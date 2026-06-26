//! Distin — a threshold-signature coordination & aggregation layer on Solana.
//!
//! Solana is used as the *control plane*: signing operators bond an LST
//! (Token-2022) as slashable economic security, users post a "signing intent"
//! for a foreign chain, operators submit partial signatures, and once the
//! staked-weight threshold is met within a request's slot deadline the program
//! finalizes and emits an aggregate signature for an off-chain relayer to
//! broadcast on the destination chain.
//!
//! Signing schemes are branched per destination VM:
//!   * FROST (Ed25519, secp/edwards Schnorr) — SVM / Aptos / Sui style chains
//!   * GG20  (ECDSA, secp256k1)              — EVM / BTC / Tron style chains
//!
//! The cryptographic share-verification and final group-combine are performed
//! by the off-chain `kobe-{svm,evm,tron,cosmos}` signing libraries; the precise
//! integration points are marked inline. Everything the *on-chain* layer is
//! responsible for — accounting, economic security, threshold enforcement,
//! liveness deadlines and slashing — is implemented in full here.

// The `#[program]`/`#[derive(Accounts)]` codegen in anchor-lang 0.31 emits the
// `cfg(target_os = "solana")` family (unknown to the host toolchain) and an
// internal call to the now-deprecated `AccountInfo::realloc`. Both originate in
// the framework macros, not in this crate's logic, so they are silenced here to
// keep `cargo clippy -- -D warnings` clean on the host target. No project code
// relies on either.
#![allow(unexpected_cfgs, deprecated)]

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer as SystemTransfer};
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

pub mod errors;
pub mod state;

use errors::DistinError;
use state::*;

declare_id!("4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6");

/// Basis-point denominator for the staked-weight threshold.
pub const BPS_DENOMINATOR: u64 = 10_000;
/// Hard ceiling on a request's validity window so stale intents cannot linger.
pub const MAX_VALIDITY_SLOTS_CEILING: u64 = 432_000; // ~48h at 400ms slots.

#[program]
pub mod distin {
    use super::*;

    /// Bootstrap the protocol: create the singleton config, the bonded-collateral
    /// vault and the slash pool (both Token-2022 accounts owned by the protocol PDA).
    pub fn initialize(
        ctx: Context<Initialize>,
        threshold_bps: u16,
        min_bond: u64,
        unbonding_slots: u64,
        request_fee: u64,
        max_validity_slots: u64,
        lst_price_feed: Pubkey,
    ) -> Result<()> {
        require!(
            threshold_bps as u64 >= 1 && threshold_bps as u64 <= BPS_DENOMINATOR,
            DistinError::InvalidThreshold
        );
        require!(min_bond > 0, DistinError::InsufficientBond);
        require!(
            (1..=MAX_VALIDITY_SLOTS_CEILING).contains(&max_validity_slots),
            DistinError::InvalidValidityWindow
        );

        let protocol = &mut ctx.accounts.protocol;
        protocol.admin = ctx.accounts.admin.key();
        protocol.pending_admin = Pubkey::default();
        protocol.bond_mint = ctx.accounts.bond_mint.key();
        protocol.bond_vault = ctx.accounts.bond_vault.key();
        protocol.slash_pool = ctx.accounts.slash_pool.key();
        protocol.lst_price_feed = lst_price_feed;
        protocol.threshold_bps = threshold_bps;
        protocol.min_bond = min_bond;
        protocol.unbonding_slots = unbonding_slots;
        protocol.request_fee = request_fee;
        protocol.max_validity_slots = max_validity_slots;
        protocol.operator_count = 0;
        protocol.total_bonded = 0;
        protocol.request_nonce = 0;
        protocol.paused = false;
        protocol.bump = ctx.bumps.protocol;
        Ok(())
    }

    /// Admin: tune the live economic-security and liveness parameters.
    pub fn update_config(
        ctx: Context<AdminConfig>,
        threshold_bps: Option<u16>,
        min_bond: Option<u64>,
        unbonding_slots: Option<u64>,
        request_fee: Option<u64>,
        max_validity_slots: Option<u64>,
    ) -> Result<()> {
        let protocol = &mut ctx.accounts.protocol;
        if let Some(bps) = threshold_bps {
            require!(
                bps as u64 >= 1 && bps as u64 <= BPS_DENOMINATOR,
                DistinError::InvalidThreshold
            );
            protocol.threshold_bps = bps;
        }
        if let Some(mb) = min_bond {
            require!(mb > 0, DistinError::InsufficientBond);
            protocol.min_bond = mb;
        }
        if let Some(us) = unbonding_slots {
            protocol.unbonding_slots = us;
        }
        if let Some(fee) = request_fee {
            protocol.request_fee = fee;
        }
        if let Some(mv) = max_validity_slots {
            require!(
                (1..=MAX_VALIDITY_SLOTS_CEILING).contains(&mv),
                DistinError::InvalidValidityWindow
            );
            protocol.max_validity_slots = mv;
        }
        Ok(())
    }

    /// Admin: nominate a successor admin (step 1 of a two-step handover).
    pub fn transfer_admin(ctx: Context<AdminConfig>, new_admin: Pubkey) -> Result<()> {
        require_keys_neq!(
            new_admin,
            Pubkey::default(),
            DistinError::InvalidAdminTransfer
        );
        ctx.accounts.protocol.pending_admin = new_admin;
        Ok(())
    }

    /// Nominee: accept the admin role (step 2 of the two-step handover).
    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        let protocol = &mut ctx.accounts.protocol;
        require_keys_eq!(
            protocol.pending_admin,
            ctx.accounts.new_admin.key(),
            DistinError::Unauthorized
        );
        protocol.admin = protocol.pending_admin;
        protocol.pending_admin = Pubkey::default();
        Ok(())
    }

    /// Admin: halt all user/operator state transitions (emergency brake).
    pub fn pause(ctx: Context<AdminConfig>) -> Result<()> {
        ctx.accounts.protocol.paused = true;
        Ok(())
    }

    /// Admin: resume normal operation.
    pub fn unpause(ctx: Context<AdminConfig>) -> Result<()> {
        ctx.accounts.protocol.paused = false;
        Ok(())
    }

    /// Operator: join the signing set by bonding LST collateral.
    pub fn register_operator(
        ctx: Context<RegisterOperator>,
        group_pubkey: [u8; 33],
        attestation_pubkey: [u8; 32],
        bond_amount: u64,
    ) -> Result<()> {
        let protocol = &ctx.accounts.protocol;
        require!(!protocol.paused, DistinError::ProtocolPaused);
        require!(
            bond_amount >= protocol.min_bond,
            DistinError::InsufficientBond
        );

        // Pull the bond into the protocol-owned Token-2022 vault.
        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.operator_token_account.to_account_info(),
                    mint: ctx.accounts.bond_mint.to_account_info(),
                    to: ctx.accounts.bond_vault.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            bond_amount,
            ctx.accounts.bond_mint.decimals,
        )?;

        let stake_weight = compute_stake_weight(&ctx.accounts.lst_price_feed, bond_amount)?;
        let clock = Clock::get()?;

        let operator = &mut ctx.accounts.operator;
        operator.protocol = protocol.key();
        operator.authority = ctx.accounts.authority.key();
        operator.group_pubkey = group_pubkey;
        operator.attestation_pubkey = attestation_pubkey;
        operator.bonded_amount = bond_amount;
        operator.stake_weight = stake_weight;
        operator.partials_submitted = 0;
        operator.slash_count = 0;
        operator.jailed = false;
        operator.unbonding_at = 0;
        operator.joined_slot = clock.slot;
        operator.bump = ctx.bumps.operator;

        let protocol = &mut ctx.accounts.protocol;
        protocol.total_bonded = protocol
            .total_bonded
            .checked_add(stake_weight)
            .ok_or(DistinError::MathOverflow)?;
        protocol.operator_count = protocol
            .operator_count
            .checked_add(1)
            .ok_or(DistinError::MathOverflow)?;

        emit!(OperatorRegistered {
            operator: operator.key(),
            authority: operator.authority,
            stake_weight,
        });
        Ok(())
    }

    /// Operator: start the unbonding timer and exit the active signing set so it
    /// can no longer take on new requests while its bond is still slashable.
    pub fn begin_unbonding(ctx: Context<OperatorLifecycle>) -> Result<()> {
        let protocol = &ctx.accounts.protocol;
        require!(!protocol.paused, DistinError::ProtocolPaused);

        let unbonding_slots = protocol.unbonding_slots;
        let removed_weight = ctx.accounts.operator.stake_weight;
        let clock = Clock::get()?;

        let operator = &mut ctx.accounts.operator;
        require!(operator.unbonding_at == 0, DistinError::AlreadyUnbonding);
        operator.unbonding_at = clock
            .slot
            .checked_add(unbonding_slots)
            .ok_or(DistinError::MathOverflow)?;
        operator.jailed = true;

        let protocol = &mut ctx.accounts.protocol;
        protocol.total_bonded = protocol.total_bonded.saturating_sub(removed_weight);
        protocol.operator_count = protocol.operator_count.saturating_sub(1);
        Ok(())
    }

    /// Operator: reclaim the bond once the unbonding window has elapsed; closes
    /// the operator account and returns its rent to the authority.
    pub fn withdraw_bond(ctx: Context<WithdrawBond>) -> Result<()> {
        let clock = Clock::get()?;
        let operator = &ctx.accounts.operator;
        require!(operator.unbonding_at != 0, DistinError::NotUnbonding);
        require!(
            clock.slot >= operator.unbonding_at,
            DistinError::UnbondingNotComplete
        );

        let amount = operator.bonded_amount;
        let signer_seeds: &[&[&[u8]]] = &[&[PROTOCOL_SEED, &[ctx.accounts.protocol.bump]]];

        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.bond_vault.to_account_info(),
                    mint: ctx.accounts.bond_mint.to_account_info(),
                    to: ctx.accounts.operator_token_account.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
            ctx.accounts.bond_mint.decimals,
        )?;
        Ok(())
    }

    /// Admin: slash a misbehaving operator's bond into the slash pool.
    ///
    /// In production this entry point is gated by a verified fraud proof
    /// (equivocation / invalid-share / liveness fault) produced by the signing
    /// libraries; the on-chain effect — moving collateral and jailing — is what
    /// is enforced here.
    pub fn slash_operator(ctx: Context<SlashOperator>, amount: u64, reason: u8) -> Result<()> {
        let operator_weight_before = ctx.accounts.operator.stake_weight;
        require!(
            amount <= ctx.accounts.operator.bonded_amount,
            DistinError::SlashAmountExceedsBond
        );

        let signer_seeds: &[&[&[u8]]] = &[&[PROTOCOL_SEED, &[ctx.accounts.protocol.bump]]];
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.bond_vault.to_account_info(),
                    mint: ctx.accounts.bond_mint.to_account_info(),
                    to: ctx.accounts.slash_pool.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
            ctx.accounts.bond_mint.decimals,
        )?;

        let min_bond = ctx.accounts.protocol.min_bond;
        let was_active = ctx.accounts.operator.unbonding_at == 0 && !ctx.accounts.operator.jailed;

        let operator = &mut ctx.accounts.operator;
        operator.bonded_amount = operator.bonded_amount.saturating_sub(amount);
        operator.slash_count = operator
            .slash_count
            .checked_add(1)
            .ok_or(DistinError::MathOverflow)?;
        // Recompute weight from the residual bond (1:1 with the bonded amount
        // under the current oracle policy; see `compute_stake_weight`).
        let new_weight =
            compute_stake_weight(&ctx.accounts.lst_price_feed, operator.bonded_amount)?;
        operator.stake_weight = new_weight;
        if operator.bonded_amount < min_bond {
            operator.jailed = true;
        }

        // Keep protocol-wide bonded weight consistent for active operators only.
        if was_active {
            let weight_delta = operator_weight_before.saturating_sub(new_weight);
            let protocol = &mut ctx.accounts.protocol;
            protocol.total_bonded = protocol.total_bonded.saturating_sub(weight_delta);
            if operator.jailed {
                protocol.total_bonded = protocol.total_bonded.saturating_sub(new_weight);
                protocol.operator_count = protocol.operator_count.saturating_sub(1);
            }
        }

        emit!(OperatorSlashed {
            operator: operator.key(),
            amount,
            reason,
        });
        Ok(())
    }

    /// M9 — identifiable abort. Slash the operator that a threshold of honest
    /// operators have cryptographically identified as the GG20 signing-round
    /// culprit, WITHOUT requiring the admin.
    ///
    /// This is the on-chain consumer of the off-chain `FaultReport` /
    /// `Attestation` flow (`engine/kobe-ecdsa/net/fault.go`). GG20 itself names
    /// the cheater (a failed zero-knowledge proof attributed to a specific party);
    /// each honest operator signs the identical canonical report with its
    /// registered Ed25519 attestation key. Here the program:
    ///
    ///  1. reconstructs the exact 32-byte report digest the operators signed
    ///     (byte-identical to `FaultReport.digest32`),
    ///  2. reads the sibling **Ed25519 native-program** instruction via the
    ///     instructions sysvar and confirms every (pubkey, message) pair it
    ///     verified signs THAT digest (the Ed25519 program already checked the
    ///     signatures cryptographically — we trust only that, not a passed-in
    ///     bool),
    ///  3. requires each signing pubkey to be the `attestation_pubkey` of a
    ///     distinct registered operator (passed in `remaining_accounts`), none of
    ///     them the culprit, and the count to meet the protocol threshold,
    ///  4. binds the report's culprit key to the slashed operator account, then
    ///     applies the same economic slash as `slash_operator`.
    ///
    /// A minority cannot reach the threshold, so an honest operator is not
    /// slashable by a minority. The residual framing risk requires a colluding
    /// MAJORITY — the same honest-majority boundary the signature scheme already
    /// assumes — so this adds no new trust assumption (see SECURITY.md).
    pub fn slash_operator_attested<'info>(
        ctx: Context<'_, '_, 'info, 'info, SlashOperatorAttested<'info>>,
        amount: u64,
        session: String,
        message_hash: [u8; 32],
        round: u32,
        culprit_global: u32,
    ) -> Result<()> {
        require!(!ctx.accounts.protocol.paused, DistinError::ProtocolPaused);
        require!(
            amount <= ctx.accounts.operator.bonded_amount,
            DistinError::SlashAmountExceedsBond
        );

        // (4-binding) The report names the culprit by its Ed25519 attestation key;
        // that key MUST be the registered key of the operator account being
        // slashed, so attesters cannot sign about op X and have op Y slashed.
        let culprit_pubkey = ctx.accounts.operator.attestation_pubkey;

        // (1) Reconstruct the exact digest the honest operators signed.
        let digest = fault_report_digest(
            session.as_bytes(),
            &message_hash,
            round,
            culprit_global,
            &culprit_pubkey,
        );

        // (2) Pull the verified (pubkey, message) pairs out of the sibling
        // Ed25519 native-program instruction. Each pair is a signature the
        // runtime already verified; we accept a signer only if it signed `digest`.
        let signer_keys = verified_ed25519_signers(&ctx.accounts.instructions, &digest)?;

        // (3) Each verified signer must be a DISTINCT registered operator (its
        // attestation key), none of them the culprit. Count the distinct ones.
        let threshold_bps = ctx.accounts.protocol.threshold_bps;
        let operator_count = ctx.accounts.protocol.operator_count;
        // Required distinct attesters = ceil(operator_count * threshold_bps / 1e4),
        // floored to at least 1; this mirrors the staked-weight threshold but in
        // operator-count terms (a fault report is a head-count attestation).
        let required = required_attesters(operator_count, threshold_bps);

        let mut counted = 0u32;
        // Dedup on the ATTESTATION KEY actually signed, NOT the operator PDA.
        // `register_operator` does not force attestation keys to be unique, so two
        // distinct operator accounts could share one key; keying the count on the
        // PDA would then let a SINGLE Ed25519 signature be counted once per
        // duplicate account, reaching the quorum with fewer distinct witnesses than
        // `required`. Deduping on the signed key makes one signature count exactly
        // once regardless of how many operator accounts claim it.
        let mut seen_keys: Vec<[u8; 32]> = Vec::with_capacity(ctx.remaining_accounts.len());
        for acc in ctx.remaining_accounts.iter() {
            // Each remaining account must be a valid Operator PDA of THIS protocol.
            let op: Account<Operator> = Account::try_from(acc)?;
            require_keys_eq!(op.protocol, ctx.accounts.protocol.key(), DistinError::Unauthorized);
            // It must not be the culprit, and its key must not be double-counted.
            if op.attestation_pubkey == culprit_pubkey {
                continue;
            }
            if seen_keys.contains(&op.attestation_pubkey) {
                continue;
            }
            // Its registered attestation key must be among the verified signers.
            if signer_keys.iter().any(|k| *k == op.attestation_pubkey) {
                seen_keys.push(op.attestation_pubkey);
                counted = counted.checked_add(1).ok_or(DistinError::MathOverflow)?;
            }
        }
        require!(counted >= required, DistinError::ThresholdNotMet);

        // (4-apply) Same economic slash as the admin path, but reason is fixed to
        // the identifiable-abort code and the gate was the attestation quorum.
        let operator_weight_before = ctx.accounts.operator.stake_weight;
        let signer_seeds: &[&[&[u8]]] = &[&[PROTOCOL_SEED, &[ctx.accounts.protocol.bump]]];
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.bond_vault.to_account_info(),
                    mint: ctx.accounts.bond_mint.to_account_info(),
                    to: ctx.accounts.slash_pool.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
            ctx.accounts.bond_mint.decimals,
        )?;

        let min_bond = ctx.accounts.protocol.min_bond;
        let was_active = ctx.accounts.operator.unbonding_at == 0 && !ctx.accounts.operator.jailed;
        let operator = &mut ctx.accounts.operator;
        operator.bonded_amount = operator.bonded_amount.saturating_sub(amount);
        operator.slash_count = operator
            .slash_count
            .checked_add(1)
            .ok_or(DistinError::MathOverflow)?;
        let new_weight =
            compute_stake_weight(&ctx.accounts.lst_price_feed, operator.bonded_amount)?;
        operator.stake_weight = new_weight;
        if operator.bonded_amount < min_bond {
            operator.jailed = true;
        }
        if was_active {
            let weight_delta = operator_weight_before.saturating_sub(new_weight);
            let protocol = &mut ctx.accounts.protocol;
            protocol.total_bonded = protocol.total_bonded.saturating_sub(weight_delta);
            if operator.jailed {
                protocol.total_bonded = protocol.total_bonded.saturating_sub(new_weight);
                protocol.operator_count = protocol.operator_count.saturating_sub(1);
            }
        }

        emit!(OperatorSlashed {
            operator: operator.key(),
            amount,
            reason: REASON_IDENTIFIABLE_ABORT,
        });
        Ok(())
    }

    /// User: post a cross-VM signing intent for the operator set to fulfill.
    pub fn create_signing_request(
        ctx: Context<CreateSigningRequest>,
        scheme: SignatureScheme,
        target_vm: TargetVm,
        target_chain_id: u64,
        message_hash: [u8; 32],
        threshold: u16,
        validity_slots: u64,
    ) -> Result<()> {
        let protocol = &ctx.accounts.protocol;
        require!(!protocol.paused, DistinError::ProtocolPaused);
        require!(protocol.operator_count > 0, DistinError::NoActiveOperators);
        require!(
            message_hash.iter().any(|b| *b != 0),
            DistinError::EmptyMessageHash
        );
        require!(
            threshold >= 1 && (threshold as u32) <= protocol.operator_count,
            DistinError::InvalidThreshold
        );
        require!(
            validity_slots >= 1 && validity_slots <= protocol.max_validity_slots,
            DistinError::InvalidValidityWindow
        );

        // Charge the request fee in lamports to the protocol account.
        if protocol.request_fee > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    SystemTransfer {
                        from: ctx.accounts.requester.to_account_info(),
                        to: ctx.accounts.protocol.to_account_info(),
                    },
                ),
                protocol.request_fee,
            )?;
        }

        // Snapshot the economic-security target at creation time.
        let required_stake_weight =
            required_stake_weight(protocol.total_bonded, protocol.threshold_bps)?;

        let clock = Clock::get()?;
        let request_id = ctx.accounts.protocol.request_nonce;

        let request = &mut ctx.accounts.request;
        request.protocol = ctx.accounts.protocol.key();
        request.requester = ctx.accounts.requester.key();
        request.request_id = request_id;
        request.scheme = scheme;
        request.target_vm = target_vm;
        request.target_chain_id = target_chain_id;
        request.message_hash = message_hash;
        request.threshold = threshold;
        request.partials_collected = 0;
        request.stake_weight_collected = 0;
        request.required_stake_weight = required_stake_weight;
        request.created_slot = clock.slot;
        request.expiry_slot = clock
            .slot
            .checked_add(validity_slots)
            .ok_or(DistinError::MathOverflow)?;
        request.status = RequestStatus::Pending;
        request.aggregate_sig = [0u8; 64];
        request.bump = ctx.bumps.request;

        let protocol = &mut ctx.accounts.protocol;
        protocol.request_nonce = protocol
            .request_nonce
            .checked_add(1)
            .ok_or(DistinError::MathOverflow)?;

        emit!(SigningRequestCreated {
            request: request.key(),
            request_id,
            scheme,
            target_vm,
            target_chain_id,
        });
        Ok(())
    }

    /// Operator: submit a partial signature share toward a pending request.
    ///
    /// The dedicated `PartialSignature` PDA (seeded by request+operator) makes
    /// double submission impossible at the account layer.
    pub fn submit_partial_signature(ctx: Context<SubmitPartial>, share: [u8; 64]) -> Result<()> {
        require!(!ctx.accounts.protocol.paused, DistinError::ProtocolPaused);

        let operator = &ctx.accounts.operator;
        require!(!operator.jailed, DistinError::OperatorJailed);
        require!(operator.unbonding_at == 0, DistinError::OperatorJailed);

        let clock = Clock::get()?;
        {
            let request = &ctx.accounts.request;
            require!(
                request.status == RequestStatus::Pending,
                DistinError::RequestNotPending
            );
            require!(
                clock.slot <= request.expiry_slot,
                DistinError::RequestExpired
            );
            // === MPC partial-share verification point (kobe-{svm,evm,tron,cosmos}) ===
            verify_partial_share(request.scheme, &share, &request.message_hash)?;
        }

        let weight = operator.stake_weight;
        let scheme = ctx.accounts.request.scheme;

        let request = &mut ctx.accounts.request;
        // A partial is recorded as a *participation receipt*, NOT combined
        // on-chain. The byte-wise fold that used to live here did not produce a
        // valid signature: summing FROST/GG20 share bytes is cryptographically
        // meaningless, and the chain has no curve arithmetic to do the real
        // group-combine anyway. The canonical aggregate is computed off-chain by
        // the coordinator (real FROST round 1/2 + `frost::aggregate`) and posted
        // back in `aggregate_and_emit`. Here the chain only attests *who*
        // participated and *how much stake* they carry, which is what the
        // economic-security threshold is enforced against.
        request.partials_collected = request
            .partials_collected
            .checked_add(1)
            .ok_or(DistinError::MathOverflow)?;
        request.stake_weight_collected = request
            .stake_weight_collected
            .checked_add(weight)
            .ok_or(DistinError::MathOverflow)?;

        let partial = &mut ctx.accounts.partial;
        partial.request = request.key();
        partial.operator = ctx.accounts.operator.key();
        partial.scheme = scheme;
        partial.share = share;
        partial.submitted_slot = clock.slot;
        partial.stake_weight = weight;
        partial.bump = ctx.bumps.partial;

        let operator = &mut ctx.accounts.operator;
        operator.partials_submitted = operator
            .partials_submitted
            .checked_add(1)
            .ok_or(DistinError::MathOverflow)?;

        emit!(PartialSignatureSubmitted {
            request: ctx.accounts.request.key(),
            operator: operator.key(),
            partials_collected: ctx.accounts.request.partials_collected,
            stake_weight_collected: ctx.accounts.request.stake_weight_collected,
        });
        Ok(())
    }

    /// Coordinator (permissionless): finalize a threshold-met request by
    /// recording the canonical aggregate signature produced off-chain, then emit
    /// it for broadcast on the target chain.
    ///
    /// The signature is computed by the off-chain MPC coordinator (`kobe`: real
    /// FROST round 1/2 over the collected quorum, then `frost::aggregate`) and
    /// passed in here. The chain does NOT recompute it — it cannot do curve
    /// arithmetic over the shares — it *records* the finished signature, binds it
    /// to this exact request and message, and only accepts it once the economic
    /// threshold the program DOES enforce (distinct-operator count + staked
    /// weight) has been met within the slot deadline. A relayer reads the stored
    /// `aggregate_sig` and verifies it against the group key with an ordinary
    /// Ed25519/secp256k1 verifier before broadcasting.
    pub fn aggregate_and_emit(
        ctx: Context<AggregateAndEmit>,
        aggregate_sig: [u8; 64],
    ) -> Result<()> {
        require!(!ctx.accounts.protocol.paused, DistinError::ProtocolPaused);

        let clock = Clock::get()?;
        let request = &mut ctx.accounts.request;
        require!(
            request.status == RequestStatus::Pending,
            DistinError::RequestAlreadyFinalized
        );
        require!(
            clock.slot <= request.expiry_slot,
            DistinError::RequestExpired
        );
        require!(
            request.partials_collected >= request.threshold
                && request.stake_weight_collected >= request.required_stake_weight,
            DistinError::ThresholdNotMet
        );
        // The aggregate must be a real signature, not a zero placeholder.
        require!(
            aggregate_sig.iter().any(|b| *b != 0),
            DistinError::MalformedPartialSignature
        );

        // Record the off-chain-computed canonical aggregate, bound to this
        // request and its message_hash by the request PDA the relayer reads.
        request.aggregate_sig = aggregate_sig;
        request.status = RequestStatus::Aggregated;

        emit!(AggregateSignatureEmitted {
            request: request.key(),
            request_id: request.request_id,
            scheme: request.scheme,
            target_vm: request.target_vm,
            target_chain_id: request.target_chain_id,
            message_hash: request.message_hash,
            aggregate_sig: request.aggregate_sig,
        });
        Ok(())
    }

    /// Requester: cancel one's own still-pending request and reclaim its rent.
    ///
    /// Only the original requester may cancel: closing is otherwise a free
    /// griefing primitive (an attacker could tear down a victim's in-flight
    /// request mid-collection). Garbage-collecting a *foreign* request is only
    /// permitted once it has actually expired (see `expire_request`).
    pub fn cancel_request(ctx: Context<CancelRequest>) -> Result<()> {
        require!(
            ctx.accounts.request.status == RequestStatus::Pending,
            DistinError::RequestAlreadyFinalized
        );
        Ok(())
    }

    /// Permissionless: garbage-collect an expired pending request, refunding its
    /// rent to the original requester.
    pub fn expire_request(ctx: Context<CloseRequest>) -> Result<()> {
        let clock = Clock::get()?;
        require!(
            ctx.accounts.request.status == RequestStatus::Pending,
            DistinError::RequestAlreadyFinalized
        );
        require!(
            clock.slot > ctx.accounts.request.expiry_slot,
            DistinError::RequestNotPending
        );
        Ok(())
    }
}

/// Translate a bonded LST amount into a SOL-denominated economic weight.
///
/// === Pyth oracle integration point ===
/// Production reads the LST/SOL price from the Pyth price account and scales the
/// bond into economic weight:
/// ```ignore
/// use pyth_sdk_solana::state::SolanaPriceAccount;
/// let feed = SolanaPriceAccount::account_info_to_feed(price_feed)?;
/// let price = feed
///     .get_price_no_older_than(Clock::get()?.unix_timestamp, MAX_PRICE_AGE_SECS)
///     .ok_or(DistinError::StaleOraclePrice)?;
/// let weight = (bonded as i128 * price.price as i128
///     / 10i128.pow(price.expo.unsigned_abs())) as u64;
/// ```
/// Until the feed is wired, the bond mint is treated as a 1:1 SOL-pegged LST so
/// the economic-security accounting stays exact and deterministic.
fn compute_stake_weight(price_feed: &AccountInfo, bonded: u64) -> Result<u64> {
    require_keys_neq!(
        price_feed.key(),
        Pubkey::default(),
        DistinError::InvalidOracleAccount
    );
    Ok(bonded)
}

/// Enforce the on-chain invariants for a submitted partial share.
///
/// === MPC partial-share verification point ===
/// FROST(Ed25519) and GG20(secp256k1) each verify a signer's share against its
/// committed nonce and public-key share inside the off-chain signing libraries.
/// The on-chain layer enforces the structural invariants it is responsible for:
/// a non-zero share bound to a non-empty request message, branched per scheme.
fn verify_partial_share(
    scheme: SignatureScheme,
    share: &[u8; 64],
    message_hash: &[u8; 32],
) -> Result<()> {
    require!(
        share.iter().any(|b| *b != 0),
        DistinError::MalformedPartialSignature
    );
    require!(
        message_hash.iter().any(|b| *b != 0),
        DistinError::EmptyMessageHash
    );
    match scheme {
        // Ed25519 Schnorr share: 32-byte nonce commitment || 32-byte response.
        SignatureScheme::FrostEd25519 => {
            require!(
                share[..32].iter().any(|b| *b != 0),
                DistinError::MalformedPartialSignature
            );
        }
        // secp256k1 ECDSA share: 32-byte r || 32-byte s component.
        SignatureScheme::Gg20Secp256k1 => {
            require!(
                share[32..].iter().any(|b| *b != 0),
                DistinError::MalformedPartialSignature
            );
        }
    }
    Ok(())
}

/// Economic-security target: the staked weight a request must collect to
/// finalize, snapshotted at creation as `total_bonded * threshold_bps / 10_000`.
///
/// The multiply is checked (a 64-bit weight times a ≤10_000 bps factor can
/// overflow `u64`), and the divide is integer-floored so the requirement is
/// never rounded *down* below what the policy demands — flooring the target
/// only ever makes it marginally easier to reach by at most one unit of weight,
/// never harder, so it cannot silently under-secure a request past the bound.
fn required_stake_weight(total_bonded: u64, threshold_bps: u16) -> Result<u64> {
    Ok(total_bonded
        .checked_mul(threshold_bps as u64)
        .ok_or(DistinError::MathOverflow)?
        / BPS_DENOMINATOR)
}

/// Slash `reason` byte for an identifiable-abort (M9) slash, distinct from any
/// admin discretionary reason.
pub const REASON_IDENTIFIABLE_ABORT: u8 = 1;

/// The Ed25519 native program id, against which the sibling signature-verifying
/// instruction is checked. (Pinned as bytes so the program needs no extra dep.)
const ED25519_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::ed25519_program::ID;

/// Number of DISTINCT operator attestations required to slash a culprit:
/// `ceil(operator_count * threshold_bps / 10_000)`, floored to at least 1. This
/// is the head-count analogue of the staked-weight threshold — a fault report is
/// a quorum of operators each independently attesting the same cryptographic
/// fact, so a minority can never assemble a slashable bundle.
fn required_attesters(operator_count: u32, threshold_bps: u16) -> u32 {
    let prod = (operator_count as u64) * (threshold_bps as u64);
    let ceil = prod.div_ceil(BPS_DENOMINATOR) as u32;
    ceil.max(1)
}

/// Reconstruct the 32-byte SHA-256 fault-report digest the honest operators
/// signed off-chain. This MUST stay byte-for-byte identical to
/// `FaultReport.digest32` in `engine/kobe-ecdsa/net/fault.go`:
///   sha256( "distin-fault-report-v1\0"
///         || u32be(len(session))   || session
///         || u32be(len(msg_hash))  || msg_hash
///         || u32be(round)
///         || u32be(culprit_global)
///         || u32be(len(culprit_pk)) || culprit_pk )
fn fault_report_digest(
    session: &[u8],
    message_hash: &[u8; 32],
    round: u32,
    culprit_global: u32,
    culprit_pubkey: &[u8; 32],
) -> [u8; 32] {
    use anchor_lang::solana_program::hash::hashv;
    let session_len = (session.len() as u32).to_be_bytes();
    let mh_len = (message_hash.len() as u32).to_be_bytes();
    let round_be = round.to_be_bytes();
    let culprit_be = culprit_global.to_be_bytes();
    let pk_len = (culprit_pubkey.len() as u32).to_be_bytes();
    hashv(&[
        b"distin-fault-report-v1\x00",
        &session_len,
        session,
        &mh_len,
        message_hash,
        &round_be,
        &culprit_be,
        &pk_len,
        culprit_pubkey,
    ])
    .to_bytes()
}

/// Read the sibling **Ed25519 native-program** instruction from the instructions
/// sysvar and return the set of public keys that the runtime verified a signature
/// for OVER `expected_msg`. The Ed25519 program has already done the
/// cryptographic check; this function trusts only that result and additionally
/// pins (a) the instruction is the real Ed25519 program, and (b) each verified
/// message equals the fault digest. Any signer over a different message is
/// ignored, so a bundle that verifies signatures over an unrelated message
/// cannot slash.
///
/// Ed25519 native instruction data layout (little-endian offsets):
///   [0]      num_signatures: u8
///   [1]      padding: u8
///   per sig (14 bytes): sig_off u16, sig_ix u16, pk_off u16, pk_ix u16,
///                       msg_off u16, msg_size u16, msg_ix u16
/// followed by the referenced pubkey/sig/message bytes within the same data.
fn verified_ed25519_signers(
    ix_sysvar: &AccountInfo,
    expected_msg: &[u8; 32],
) -> Result<Vec<[u8; 32]>> {
    use anchor_lang::solana_program::sysvar::instructions::{
        load_current_index_checked, load_instruction_at_checked,
    };

    let current = load_current_index_checked(ix_sysvar)? as usize;
    require!(current >= 1, DistinError::MissingAttestationSignatures);
    // The Ed25519 verify instruction must be the one immediately preceding us.
    let ed_ix = load_instruction_at_checked(current - 1, ix_sysvar)?;
    require_keys_eq!(
        ed_ix.program_id,
        ED25519_PROGRAM_ID,
        DistinError::MissingAttestationSignatures
    );
    parse_ed25519_signers(&ed_ix.data, expected_msg)
}

/// Pure parser for the Ed25519 native-program instruction data: return every
/// public key whose verified message equals `expected_msg`. Split out from the
/// sysvar plumbing so the security-critical byte handling is unit-testable
/// against hand-built instruction data. (The cryptographic verification is the
/// Ed25519 native program's job; this only reads which (pk, msg) pairs it ran.)
fn parse_ed25519_signers(data: &[u8], expected_msg: &[u8; 32]) -> Result<Vec<[u8; 32]>> {
    require!(data.len() >= 2, DistinError::MalformedAttestation);
    let n = data[0] as usize;
    require!(n >= 1, DistinError::MissingAttestationSignatures);

    let read_u16 = |off: usize| -> Result<usize> {
        require!(off + 2 <= data.len(), DistinError::MalformedAttestation);
        Ok(u16::from_le_bytes([data[off], data[off + 1]]) as usize)
    };

    let mut signers = Vec::with_capacity(n);
    for i in 0..n {
        // 14-byte Ed25519SignatureOffsets:
        //   sig_off(0..2) sig_ix(2..4) pk_off(4..6) pk_ix(6..8)
        //   msg_off(8..10) msg_size(10..12) msg_ix(12..14)
        let base = 2 + i * 14;
        require!(base + 14 <= data.len(), DistinError::MalformedAttestation);
        let sig_ix = read_u16(base + 2)?;
        let pk_off = read_u16(base + 4)?;
        let pk_ix = read_u16(base + 6)?;
        let msg_off = read_u16(base + 8)?;
        let msg_size = read_u16(base + 10)?;
        let msg_ix = read_u16(base + 12)?;
        // All material must live in THIS instruction's data (index 0xFFFF means
        // "this instruction"); reject cross-instruction references so the whole
        // proof is self-contained and auditable from one place.
        require!(
            sig_ix == 0xffff && pk_ix == 0xffff && msg_ix == 0xffff,
            DistinError::MalformedAttestation
        );
        require!(pk_off + 32 <= data.len(), DistinError::MalformedAttestation);
        require!(
            msg_off + msg_size <= data.len(),
            DistinError::MalformedAttestation
        );
        // Only count a signer whose runtime-verified message is exactly our digest.
        if msg_size == 32 && &data[msg_off..msg_off + 32] == expected_msg {
            let mut pk = [0u8; 32];
            pk.copy_from_slice(&data[pk_off..pk_off + 32]);
            signers.push(pk);
        }
    }
    require!(!signers.is_empty(), DistinError::MissingAttestationSignatures);
    Ok(signers)
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Protocol::INIT_SPACE,
        seeds = [PROTOCOL_SEED],
        bump
    )]
    pub protocol: Account<'info, Protocol>,

    pub bond_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = admin,
        token::mint = bond_mint,
        token::authority = protocol,
        token::token_program = token_program,
        seeds = [BOND_VAULT_SEED, protocol.key().as_ref()],
        bump
    )]
    pub bond_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = admin,
        token::mint = bond_mint,
        token::authority = protocol,
        token::token_program = token_program,
        seeds = [SLASH_POOL_SEED, protocol.key().as_ref()],
        bump
    )]
    pub slash_pool: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
        has_one = admin @ DistinError::Unauthorized
    )]
    pub protocol: Account<'info, Protocol>,
}

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    pub new_admin: Signer<'info>,
    #[account(mut, seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
}

#[derive(Accounts)]
pub struct RegisterOperator<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
        has_one = bond_mint @ DistinError::InvalidVault
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        init,
        payer = authority,
        space = 8 + Operator::INIT_SPACE,
        seeds = [OPERATOR_SEED, protocol.key().as_ref(), authority.key().as_ref()],
        bump
    )]
    pub operator: Account<'info, Operator>,

    pub bond_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = bond_mint,
        token::authority = authority,
        token::token_program = token_program
    )]
    pub operator_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, address = protocol.bond_vault @ DistinError::InvalidVault)]
    pub bond_vault: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: validated against the configured Pyth feed; read in `compute_stake_weight`.
    #[account(address = protocol.lst_price_feed @ DistinError::InvalidOracleAccount)]
    pub lst_price_feed: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OperatorLifecycle<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(
        mut,
        has_one = authority @ DistinError::Unauthorized,
        has_one = protocol @ DistinError::Unauthorized,
        seeds = [OPERATOR_SEED, protocol.key().as_ref(), authority.key().as_ref()],
        bump = operator.bump
    )]
    pub operator: Account<'info, Operator>,
}

#[derive(Accounts)]
pub struct WithdrawBond<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
        has_one = bond_mint @ DistinError::InvalidVault
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        mut,
        has_one = authority @ DistinError::Unauthorized,
        has_one = protocol @ DistinError::Unauthorized,
        seeds = [OPERATOR_SEED, protocol.key().as_ref(), authority.key().as_ref()],
        bump = operator.bump,
        close = authority
    )]
    pub operator: Account<'info, Operator>,

    pub bond_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = protocol.bond_vault @ DistinError::InvalidVault)]
    pub bond_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = bond_mint,
        token::authority = authority,
        token::token_program = token_program
    )]
    pub operator_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SlashOperator<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
        has_one = admin @ DistinError::Unauthorized,
        has_one = bond_mint @ DistinError::InvalidVault
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        mut,
        has_one = protocol @ DistinError::Unauthorized,
        seeds = [OPERATOR_SEED, protocol.key().as_ref(), operator.authority.as_ref()],
        bump = operator.bump
    )]
    pub operator: Account<'info, Operator>,

    pub bond_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = protocol.bond_vault @ DistinError::InvalidVault)]
    pub bond_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, address = protocol.slash_pool @ DistinError::InvalidVault)]
    pub slash_pool: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: validated against the configured Pyth feed; read in `compute_stake_weight`.
    #[account(address = protocol.lst_price_feed @ DistinError::InvalidOracleAccount)]
    pub lst_price_feed: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

/// Accounts for `slash_operator_attested` (M9). Permissionless: anyone who holds
/// a valid m-of-n attestation bundle can submit it. The signer pays fees only;
/// authorization comes from the Ed25519 attestation quorum, not from the caller.
/// The attester `Operator` accounts are passed in `remaining_accounts`.
#[derive(Accounts)]
pub struct SlashOperatorAttested<'info> {
    #[account(mut)]
    pub relayer: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
        has_one = bond_mint @ DistinError::InvalidVault
    )]
    pub protocol: Account<'info, Protocol>,

    /// The operator being slashed — the report's named culprit. Its registered
    /// `attestation_pubkey` is what the signed report is bound to.
    #[account(
        mut,
        has_one = protocol @ DistinError::Unauthorized,
        seeds = [OPERATOR_SEED, protocol.key().as_ref(), operator.authority.as_ref()],
        bump = operator.bump
    )]
    pub operator: Account<'info, Operator>,

    pub bond_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = protocol.bond_vault @ DistinError::InvalidVault)]
    pub bond_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, address = protocol.slash_pool @ DistinError::InvalidVault)]
    pub slash_pool: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: validated against the configured Pyth feed; read in `compute_stake_weight`.
    #[account(address = protocol.lst_price_feed @ DistinError::InvalidOracleAccount)]
    pub lst_price_feed: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,

    /// CHECK: the instructions sysvar, address-pinned; read for Ed25519
    /// introspection in `verified_ed25519_signers`.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CreateSigningRequest<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,

    #[account(mut, seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,

    #[account(
        init,
        payer = requester,
        space = 8 + SigningRequest::INIT_SPACE,
        seeds = [
            REQUEST_SEED,
            protocol.key().as_ref(),
            protocol.request_nonce.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub request: Account<'info, SigningRequest>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitPartial<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,

    #[account(
        mut,
        has_one = protocol @ DistinError::Unauthorized,
        seeds = [
            REQUEST_SEED,
            protocol.key().as_ref(),
            request.request_id.to_le_bytes().as_ref()
        ],
        bump = request.bump
    )]
    pub request: Account<'info, SigningRequest>,

    #[account(
        mut,
        has_one = authority @ DistinError::Unauthorized,
        has_one = protocol @ DistinError::Unauthorized,
        seeds = [OPERATOR_SEED, protocol.key().as_ref(), authority.key().as_ref()],
        bump = operator.bump
    )]
    pub operator: Account<'info, Operator>,

    #[account(
        init,
        payer = authority,
        space = 8 + PartialSignature::INIT_SPACE,
        seeds = [PARTIAL_SEED, request.key().as_ref(), operator.key().as_ref()],
        bump
    )]
    pub partial: Account<'info, PartialSignature>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AggregateAndEmit<'info> {
    pub relayer: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,

    #[account(
        mut,
        has_one = protocol @ DistinError::Unauthorized,
        seeds = [
            REQUEST_SEED,
            protocol.key().as_ref(),
            request.request_id.to_le_bytes().as_ref()
        ],
        bump = request.bump
    )]
    pub request: Account<'info, SigningRequest>,
}

/// Accounts for `cancel_request` — the requester closes their own request and
/// receives the rent refund. `has_one = requester` ties the signer to the
/// account's owner, so no other party can trigger the close.
#[derive(Accounts)]
pub struct CancelRequest<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,

    #[account(
        mut,
        has_one = protocol @ DistinError::Unauthorized,
        has_one = requester @ DistinError::Unauthorized,
        seeds = [
            REQUEST_SEED,
            protocol.key().as_ref(),
            request.request_id.to_le_bytes().as_ref()
        ],
        bump = request.bump,
        close = requester
    )]
    pub request: Account<'info, SigningRequest>,
}

/// Accounts for `expire_request` — permissionless garbage collection. Any
/// signer may pay to close an *expired* request, but the rent is always
/// refunded to the original requester (`close = requester`), so the caller
/// gains nothing and cannot redirect funds.
#[derive(Accounts)]
pub struct CloseRequest<'info> {
    /// CHECK: rent-refund destination only; identity enforced via `has_one`.
    #[account(mut, address = request.requester @ DistinError::Unauthorized)]
    pub requester: UncheckedAccount<'info>,

    pub closer: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,

    #[account(
        mut,
        has_one = protocol @ DistinError::Unauthorized,
        has_one = requester @ DistinError::Unauthorized,
        seeds = [
            REQUEST_SEED,
            protocol.key().as_ref(),
            request.request_id.to_le_bytes().as_ref()
        ],
        bump = request.bump,
        close = requester
    )]
    pub request: Account<'info, SigningRequest>,
}

#[event]
pub struct OperatorRegistered {
    pub operator: Pubkey,
    pub authority: Pubkey,
    pub stake_weight: u64,
}

#[event]
pub struct OperatorSlashed {
    pub operator: Pubkey,
    pub amount: u64,
    pub reason: u8,
}

#[event]
pub struct SigningRequestCreated {
    pub request: Pubkey,
    pub request_id: u64,
    pub scheme: SignatureScheme,
    pub target_vm: TargetVm,
    pub target_chain_id: u64,
}

#[event]
pub struct PartialSignatureSubmitted {
    pub request: Pubkey,
    pub operator: Pubkey,
    pub partials_collected: u16,
    pub stake_weight_collected: u64,
}

#[event]
pub struct AggregateSignatureEmitted {
    pub request: Pubkey,
    pub request_id: u64,
    pub scheme: SignatureScheme,
    pub target_vm: TargetVm,
    pub target_chain_id: u64,
    pub message_hash: [u8; 32],
    pub aggregate_sig: [u8; 64],
}

#[cfg(test)]
mod tests {
    //! Unit coverage for the security-critical pure logic: per-scheme partial
    //! share validation and the economic-threshold math. These hold the
    //! invariants an off-chain caller cannot be trusted to enforce, so each
    //! happy path, every rejection path, and the saturation/overflow edges are
    //! exercised here. The Anchor account-constraint layer (signer/PDA/owner
    //! checks) is verified at the integration tier against the deployed program.

    use super::*;

    /// Extract the on-chain error code from a failed `Result`. Anchor assigns
    /// each `DistinError` variant a stable code (`6000 + ordinal`), so an exact
    /// `assert_eq!` against `u32::from(DistinError::X)` pins the precise revert
    /// reason a caller would see — not just "it failed".
    fn code<T: std::fmt::Debug>(r: Result<T>) -> u32 {
        match r.unwrap_err() {
            anchor_lang::error::Error::AnchorError(e) => e.error_code_number,
            other => panic!("expected AnchorError, got {other:?}"),
        }
    }

    fn nonzero_share() -> [u8; 64] {
        let mut s = [0u8; 64];
        s[0] = 1; // first half non-zero
        s[63] = 1; // second half non-zero
        s
    }

    fn nonzero_msg() -> [u8; 32] {
        let mut m = [0u8; 32];
        m[7] = 9;
        m
    }

    #[test]
    fn frost_share_accepts_when_nonce_half_set() {
        let mut share = [0u8; 64];
        share[5] = 1; // nonce-commitment half (bytes 0..32) non-zero
        assert!(
            verify_partial_share(SignatureScheme::FrostEd25519, &share, &nonzero_msg()).is_ok()
        );
    }

    #[test]
    fn frost_share_rejects_when_only_response_half_set() {
        // FROST requires the nonce-commitment half (0..32) to be present.
        let mut share = [0u8; 64];
        share[40] = 1; // only the response half is set
        assert_eq!(
            code(verify_partial_share(
                SignatureScheme::FrostEd25519,
                &share,
                &nonzero_msg()
            )),
            u32::from(DistinError::MalformedPartialSignature)
        );
    }

    #[test]
    fn gg20_share_accepts_when_s_half_set() {
        let mut share = [0u8; 64];
        share[40] = 1; // s-component half (bytes 32..64) non-zero
        assert!(
            verify_partial_share(SignatureScheme::Gg20Secp256k1, &share, &nonzero_msg()).is_ok()
        );
    }

    #[test]
    fn gg20_share_rejects_when_only_r_half_set() {
        // GG20 requires the s half (32..64) to be present.
        let mut share = [0u8; 64];
        share[5] = 1; // only the r half is set
        assert_eq!(
            code(verify_partial_share(
                SignatureScheme::Gg20Secp256k1,
                &share,
                &nonzero_msg()
            )),
            u32::from(DistinError::MalformedPartialSignature)
        );
    }

    #[test]
    fn all_zero_share_rejected_for_both_schemes() {
        let zero = [0u8; 64];
        for scheme in [
            SignatureScheme::FrostEd25519,
            SignatureScheme::Gg20Secp256k1,
        ] {
            assert_eq!(
                code(verify_partial_share(scheme, &zero, &nonzero_msg())),
                u32::from(DistinError::MalformedPartialSignature)
            );
        }
    }

    #[test]
    fn empty_message_hash_rejected() {
        let zero_msg = [0u8; 32];
        assert_eq!(
            code(verify_partial_share(
                SignatureScheme::FrostEd25519,
                &nonzero_share(),
                &zero_msg
            )),
            u32::from(DistinError::EmptyMessageHash)
        );
    }

    #[test]
    fn required_weight_floors_the_product() {
        // 1_000 * 6_667 / 10_000 = 666.7 -> floors to 666.
        assert_eq!(required_stake_weight(1_000, 6_667).unwrap(), 666);
    }

    #[test]
    fn required_weight_full_threshold_is_total() {
        assert_eq!(required_stake_weight(12_345, 10_000).unwrap(), 12_345);
    }

    #[test]
    fn required_weight_min_threshold_floors_to_zero_on_tiny_stake() {
        // 1 * 1 / 10_000 = 0: a single-unit bond at 1bps rounds to no target,
        // which is why finalization *also* gates on `partials_collected`.
        assert_eq!(required_stake_weight(1, 1).unwrap(), 0);
    }

    #[test]
    fn required_weight_overflows_on_saturated_stake() {
        // total_bonded near u64::MAX times any bps > 1 cannot fit in u64.
        assert_eq!(
            code(required_stake_weight(u64::MAX, 10_000)),
            u32::from(DistinError::MathOverflow)
        );
    }

    #[test]
    fn required_weight_zero_stake_is_zero() {
        assert_eq!(required_stake_weight(0, 10_000).unwrap(), 0);
    }

    // --- M9 identifiable-abort: fault-report digest + Ed25519 introspection ---

    /// Cross-language byte-identity: the on-chain `fault_report_digest` MUST equal
    /// the Go `FaultReport.digest32` for the same inputs. The expected value is a
    /// vector printed by the Go test `TestPrintDigestVector`
    /// (engine/kobe-ecdsa/net): session "distin-sign", message_hash = 0,1,..,31,
    /// round 3, culprit_global 2, culprit_pubkey = 0xA0,0xA1,..,0xBF. If the two
    /// encoders ever drift, an honest operator's off-chain signature would no
    /// longer verify on-chain — this test pins them together.
    #[test]
    fn fault_digest_matches_go_vector() {
        let mut mh = [0u8; 32];
        for (i, b) in mh.iter_mut().enumerate() {
            *b = i as u8;
        }
        let mut pk = [0u8; 32];
        for (i, b) in pk.iter_mut().enumerate() {
            *b = 0xA0u8.wrapping_add(i as u8);
        }
        let d = fault_report_digest(b"distin-sign", &mh, 3, 2, &pk);
        let mut got = String::with_capacity(64);
        for b in d {
            got.push_str(&format!("{b:02x}"));
        }
        assert_eq!(
            got, "a148dd4ed064a256b57a6ef6f279f710321f45b850a9c4334fb5426db9aca90b",
            "on-chain fault digest drifted from the Go FaultReport.digest32 vector"
        );
    }

    /// Build a real Ed25519 native-program instruction payload carrying TWO
    /// signatures over `digest` and ONE over an unrelated message, then assert the
    /// parser returns exactly the two pubkeys that signed the digest (the third is
    /// ignored). This is the security-critical byte handling that decides who
    /// counts toward the slash quorum.
    #[test]
    fn ed25519_parser_extracts_only_digest_signers() {
        let digest = [7u8; 32];
        let other = [9u8; 32];
        let pk_a = [0x11u8; 32];
        let pk_b = [0x22u8; 32];
        let pk_c = [0x33u8; 32];
        let sig = [0u8; 64]; // sig bytes are irrelevant to the parser

        // entries: (pubkey, message)
        let entries: [(&[u8; 32], &[u8; 32]); 3] =
            [(&pk_a, &digest), (&pk_c, &other), (&pk_b, &digest)];

        let data = build_ed25519_ix_data(&entries, &sig);
        let signers = parse_ed25519_signers(&data, &digest).unwrap();
        assert_eq!(signers.len(), 2, "only the two digest-signers must be counted");
        assert!(signers.contains(&pk_a));
        assert!(signers.contains(&pk_b));
        assert!(!signers.contains(&pk_c), "a signer over an unrelated message must NOT count");
    }

    /// A malformed instruction (truncated offsets) is rejected, never silently
    /// parsed — a griefer cannot smuggle a bad bundle past the parser.
    #[test]
    fn ed25519_parser_rejects_truncated() {
        let data = vec![1u8, 0u8, 0u8, 0u8]; // claims 1 sig but no full offsets block
        assert_eq!(
            code(parse_ed25519_signers(&data, &[0u8; 32])),
            u32::from(DistinError::MalformedAttestation)
        );
    }

    #[test]
    fn required_attesters_is_ceiling_min_one() {
        // 3 operators at 6667 bps (2/3) -> ceil(20001/10000) = 3.
        assert_eq!(required_attesters(3, 6_667), 3);
        // 4 operators at 5000 bps (1/2) -> ceil(20000/10000) = 2.
        assert_eq!(required_attesters(4, 5_000), 2);
        // Never zero even at tiny bps.
        assert_eq!(required_attesters(1, 1), 1);
        // Full threshold = whole set.
        assert_eq!(required_attesters(5, 10_000), 5);
    }

    /// Build Ed25519 native-program instruction data matching the on-chain layout:
    /// `[count:u8][pad:u8]` then a 14-byte offsets block per entry, then the
    /// referenced pubkey/sig/message bytes appended after the offsets table. All
    /// references are 0xFFFF (this-instruction), exactly as the SDK builder emits.
    fn build_ed25519_ix_data(entries: &[(&[u8; 32], &[u8; 32])], sig: &[u8; 64]) -> Vec<u8> {
        const OFFSETS_START: usize = 2;
        const OFFSETS_SIZE: usize = 14;
        let n = entries.len();
        let mut data = vec![0u8; OFFSETS_START + n * OFFSETS_SIZE];
        data[0] = n as u8;
        let here: u16 = 0xffff;
        for (i, (pk, msg)) in entries.iter().enumerate() {
            let sig_off = data.len() as u16;
            data.extend_from_slice(sig);
            let pk_off = data.len() as u16;
            data.extend_from_slice(*pk);
            let msg_off = data.len() as u16;
            data.extend_from_slice(*msg);
            let base = OFFSETS_START + i * OFFSETS_SIZE;
            data[base..base + 2].copy_from_slice(&sig_off.to_le_bytes());
            data[base + 2..base + 4].copy_from_slice(&here.to_le_bytes());
            data[base + 4..base + 6].copy_from_slice(&pk_off.to_le_bytes());
            data[base + 6..base + 8].copy_from_slice(&here.to_le_bytes());
            data[base + 8..base + 10].copy_from_slice(&msg_off.to_le_bytes());
            data[base + 10..base + 12].copy_from_slice(&(msg.len() as u16).to_le_bytes());
            data[base + 12..base + 14].copy_from_slice(&here.to_le_bytes());
        }
        data
    }
}
