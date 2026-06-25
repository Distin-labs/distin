# Distin: thread + media checklist

Program (devnet): `4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6`
Source: github.com/distin-xyz/distin · Site: distin.xyz

This file holds the numbered X thread and the screenshot/video shotlist. The
standalone posts, longer take, comparison, and FAQ answers live in `campaign.md`.

All copy is English. No em-dashes. Status is honest: the program is deployed on
**devnet** and the core flow runs end to end. Do not write "live" or "launched"
as if this were mainnet.

Pulled from the real engine (`engine/programs/distin/src/lib.rs`, `state.rs`,
`errors.rs`). Ground truth used here: 6 PDA seeds (protocol, bond_vault,
slash_pool, operator, request, partial), 5 `TargetVm` families (Svm, Evm, Tron,
Cosmos, Bitcoin), 2 schemes (FrostEd25519, Gg20Secp256k1), 23 error codes, 15
instructions.

---

## Media production checklist

### Screenshots (S1–S7)

S1: On-chain program confirmation
- Tag: #ProgramVerification
- Frame: Solana Explorer (devnet) search result for 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6
- Crop: browser URL bar (showing ?cluster=devnet) + Program ID + "Executable: Yes" + the BPF Upgradeable Loader line. Cut the rest of the page.
- Caption: none. Let the program address and the "Executable" status speak for themselves.

S2: PDA seed declarations
- Tag: #AccountStructure
- Frame: state.rs showing PROTOCOL_SEED, BOND_VAULT_SEED, SLASH_POOL_SEED, OPERATOR_SEED, REQUEST_SEED, PARTIAL_SEED, all 6 in one shot.
- Crop: the comment + the 6 seed declarations centered. Push the use statements above the fold.
- Caption (in tweet body, no overlay on the image): "6 PDA namespaces. Every signing round is a traceable on-chain state machine."

S3: SignatureScheme + TargetVm enums
- Tag: #SchemeBranch
- Frame: state.rs SignatureScheme enum (FrostEd25519, Gg20Secp256k1) and the TargetVm enum (Svm, Evm, Tron, Cosmos, Bitcoin).
- Crop: both enum blocks with their doc comments. Dark editor theme, line numbers visible.
- Caption (in tweet): "FROST Ed25519 for the SVM family. GG20 secp256k1 for EVM, Bitcoin, Tron, Cosmos. Branched at the instruction level."

S4: Error code set
- Tag: #ThresholdEnforcement
- Frame: errors.rs in full. ThresholdNotMet, RequestExpired, OperatorJailed, MalformedPartialSignature, SchemeMismatch, RequestAlreadyFinalized all visible.
- Crop: the whole error block. The file is short enough to capture entirely.
- Use: attach to tweet 11 (Conviction). The error codes stand in for the security-model writeup.

S5: LST bonding transaction
- Tag: #EconomicSecurity
- Frame: the real devnet transaction where a Token-2022 TransferChecked moved LST into the bond_vault PDA.
- Crop: instruction name + account list (operator, bond_vault, mint, token program) + "Success".
- Caption: "Operators lock LST via Token-2022 TransferChecked into the bond_vault PDA. Slashable on equivocation."

S6: Partial signature submissions, three in a row
- Tag: #PartialAggregation
- Frame: three submit_partial_signature transactions from three different operator pubkeys, placed side by side.
- Crop: each transaction's signer address + instruction name + slot number. The slot numbers should read as consecutive.
- Caption: "Each operator submits a partial as a Solana tx. Staked weight accumulates per slot until the threshold clears."

S7: Oracle price feed rejection
- Tag: #CollateralCheck
- Frame: a transaction that hit StaleOraclePrice or InvalidOracleAccount.
- Crop: the error message + the error code number.
- Use: operator-onboarding tweet. Optional in the main thread.

### Videos (V1–V3)

V1: Main product demo
- Tag: #ProductDemo
- Length: 45–60s
- Shots:
  1. A Solana wallet. Balance shows native BTC (not wBTC; emphasize "native").
  2. The user runs "send BTC". The signing intent is submitted as a Solana transaction.
  3. Solana Explorer confirms it. The SigningRequest PDA is created. Slot number and deadline slot visible.
  4. A slot or two later, several PartialSignature PDAs appear in Explorer. Real-time without a refresh is best.
  5. Staked-weight accumulation: the request account's accumulated weight field climbing.
  6. The aggregate_and_emit transaction confirms. Status flips to Aggregated.
  7. After the aggregate signature is emitted, a relayer broadcasts to Bitcoin (relayer log in a terminal).
  8. Bitcoin Explorer shows the real UTXO move. txid visible.
  9. Elapsed-time overlay: how many 400ms slots the whole coordination took.
  10. Pin the program address at the bottom, then fade to the logo.
- Audio: none. English captions only. No narration.
- Ratio: 16:9

V2: Architecture diagram animation
- Tag: #Architecture
- Length: 25–35s
- Shots:
  1. A "Solana" box at center with a "(control plane)" sublabel.
  2. An arrow from the user icon into the Protocol PDA, labeled "signing intent".
  3. Several operator nodes each connect to a PartialSignature PDA.
  4. A staked-weight bar fills. The moment it crosses the threshold line, the color changes.
  5. An "aggregate sig" icon emits out of the Solana box.
  6. A relayer icon picks it up and branches to EVM, BTC, Tron, Cosmos icons.
  7. "No lockup contract" overlays on each destination chain in turn.
- Audio: none
- Ratio: 16:9

V3: Slashing mechanism
- Tag: #EconomicSecurity
- Length: 20–25s
- Shots:
  1. An operator locks LST into the bond_vault PDA. Label: "Token-2022 TransferChecked".
  2. The operator tries to submit partials to two conflicting requests at once.
  3. The program jails the operator. The operator icon turns red.
  4. The bond_vault balance moves to the slash_pool PDA immediately. Text: "slashed on-chain, no governance vote".
- Audio: none
- Ratio: 16:9

### Production notes

- S5 and S6 must be real on-chain transactions. No mock data, no test screenshots, no composites. The Solana Explorer URL must be visible in the address bar, with ?cluster=devnet.
- The V1 demo must run end to end without edit cuts that skip a step. Cutting out a stage reads as hiding something.
- The program address 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6 must appear in every screenshot and video. If it is not on screen, add it as a caption.
- Tone: dark backgrounds. No neon, no glow, no CRT. The default Solana Explorer UI colors are fine to keep.
- Build V2 in Figma or Excalidraw and render it as an animation, not a screen recording.
- Captions are English only.
- After compression for upload, keep text large enough that Twitter's recompression does not blur it (font at least 1/20 of frame height).

---

## 1/ Greeting

Distin.

One Solana account holds signing authority over native assets on every major chain. No bridge contract on any destination.

Program (devnet): 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6
Source: github.com/distin-xyz/distin
Site: distin.xyz

This thread covers the full coordination mechanism.

---

## 2/ Problem

Every bridge moves a wrapped IOU, not the real asset.

So a lockup contract sits on the source chain holding actual BTC or ETH. That contract publishes how much it holds. It exists for as long as the bridge exists. Every day it exists, it is a target.

The exploit history is not a run of sloppy code. It is structural. The lockup contract has to exist for the model to work, and the contract is the thing that gets drained.

---

## 3-1/ Solution

Distin coordinates threshold signatures on Solana. An off-chain relayer takes the aggregate signature and broadcasts a native transaction on the destination chain.

No lockup contract on Bitcoin holding real UTXOs. Nothing on Ethereum. The honeypot address that every bridge exploit has targeted does not exist, because there is nothing to lock up.

Operators produce one signature. The destination chain accepts it as native. That is the whole surface difference.

---

## 3-2/ Solution

The on-chain coordination flow, step by step.

Operators bond LST (Token-2022) into a bond_vault PDA as slashable collateral. A user posts a signing intent: destination VM, signature scheme, message hash, slot deadline. Each operator submits a PartialSignature PDA. The program accumulates staked weight. Threshold clears before the deadline: finalized, aggregate signature emitted. Threshold does not clear: RequestExpired, the user reposts.

Every step is a Solana instruction. Every state is an on-chain account.

---

## 3-3/ Solution

The signing scheme branches at the instruction level.

FROST Ed25519 for the SVM family, where Ed25519 is native. GG20 secp256k1 for EVM, Bitcoin, Tron, and Cosmos, where the destination expects ECDSA over secp256k1.

If a submitted partial does not match the scheme declared in the SigningRequest, the program throws SchemeMismatch. Hard rejection. No fallback, no coercion across curve families.

[attach S3]

---

## 4/ Why now

Multi-round MPC has existed for years. FROST published in 2020. GG20 published in 2020. The cryptography was never the bottleneck.

Coordination latency was. FROST and GG20 both need several communication rounds between signers. If each round settles on a 12-second chain, a three-round protocol takes 36 seconds minimum. That is not a UX problem. It is a liveness problem: operators drop offline across a window that long, and signing fails more the more operators you add.

Solana's 400ms slot changes the arithmetic. A three-round sequence settles in under two seconds. Now the coordination is fast enough to be practical.

---

## 5/ Vision

Picture one Solana keypair as your signing authority on BTC, Ethereum, Tron, Cosmos, and other SVM chains.

You post a signing intent. Operators clear the staked-weight threshold within a slot or two. A relayer broadcasts the native transaction on the destination. No wrapping step. No synthetic token in your wallet. No counterparty holding your real asset behind an address.

The cross-chain account abstraction other protocols sell as a product is, here, a coordination protocol with slashable collateral sitting under it.

---

## 6/ Only here

Solana at 400ms per slot is the one structural requirement for this design: a control plane that settles rounds faster than operators drop offline. No other L1 at scale delivers that.

The full accountability loop closes inside one Anchor program. Operators bond, get jailed, get slashed, and serve unbonding cooldowns through the same program that coordinates their signing. No separate slashing contract. No off-chain governance step between bad behavior and economic consequence.

---

## 7/ Product demo [V1]

A signing intent is posted as a Solana instruction. Operators submit partials across slots. The staked-weight threshold clears. The aggregate signature is relayed to Bitcoin as a native transaction.

No wrapped token. No bridge UI. One Solana account.

Program (devnet): 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6

[attach V1]

---

## 8/ Before vs after

Sending BTC cross-chain, before:

A bridge contract locks real BTC on Bitcoin mainnet. You receive wBTC on the other side. The lockup contract holds nine figures in real assets and can be reached from anywhere on the internet.

Sending BTC cross-chain, after:

A Solana account posts a signing intent. Operators coordinate a GG20 secp256k1 aggregate through the on-chain program. A relayer broadcasts a native Bitcoin transaction. A UTXO moves on Bitcoin mainnet with nothing locked anywhere.

Same action from your side. A completely different thing for an attacker to point at, because there is nothing to point at.

---

## 9/ Builder log

What is on-chain and verifiable now, on devnet.

A Protocol singleton PDA with an operator registry. LST bonding and unbonding via Token-2022 TransferChecked into the bond_vault PDA. Staked-weight accumulation per SigningRequest account. Slot-deadline enforcement with RequestExpired. An OperatorJailed state that blocks participation. Oracle price-feed validation for collateral. SchemeMismatch rejection at partial submission. Slash execution into the slash_pool PDA with no intermediate step.

The signing libraries that combine the cryptographic shares are stubbed with doc comments that mark the exact handoff boundary between on-chain accounting and off-chain share combination.

---

## 10/ Traction

5 destination VM families handled in one program. FROST Ed25519 for the SVM family. GG20 secp256k1 for EVM, Bitcoin, Tron, and Cosmos secp256k1 variants.

The unbonding cooldown is checked at instruction level against the current slot. An operator cannot begin withdrawing collateral while a signing window they took part in is still open.

23 error codes, each mapped to a specific invariant in the security model.

[attach S4]

---

## 11/ Conviction

Why staked weight beats signer count.

A t-of-n scheme that counts heads can be attacked by spinning up many low-collateral operators. A staked-weight threshold means an attacker has to acquire a meaningful fraction of the total bonded LST pool. The cost of corrupting the signing set scales with total collateral, not with how many participants there are.

Slashing makes it binding. When an operator equivocates, their bond_vault balance moves to the slash_pool in the same transaction that catches the equivocation. No dispute window. No governance delay. The consequence lands immediately.

[attach S4]

---

## 12/ Rebuttal

"The off-chain relayer is still a trusted component."

It is. The relayer broadcasts the aggregate signature but cannot forge it. If it goes offline, signing requests expire at their slot deadline and users repost. If it submits a malformed transaction, the destination chain rejects it, because the signature does not verify. The relayer's failure mode is liveness, not safety.

The operators, where the actual cryptographic power sits, are bonded on-chain and slashable. The trust that can steal from you is bonded and visible.

---

## 13/ The name

Distin is short for "distinct".

The point of the system is that two things people usually fuse stay separate: the asset, and the authority to spend it. Your BTC stays on Bitcoin. The authority to move it travels as one signature, produced on demand by bonded operators. Asset here, authority there, kept distinct on purpose.

That is the design principle, not a label stuck on afterward. We started building after hitting the same wall over and over: native cross-chain asset control and wrapping-free composability would not coexist under any existing model. This program is the attempt to close that gap at the signing layer.

---

## 14/ Devnet status

Distin is a threshold-signature coordination layer running on Solana devnet.

Native asset control across SVM, EVM, Bitcoin, Tron, and Cosmos. One Solana account. Slashable operator collateral. No lockup contract on any destination chain.

We have driven the core path on devnet: initialize the protocol, register a bonded operator, post a signing intent. create_signing_request confirms as an ordinary Solana transaction. Testing stage, not a mainnet launch.

Program (devnet): 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6
Source: github.com/distin-xyz/distin
Site: distin.xyz

---
---

# X Article: Distin

# Signing authority, not assets

## The problem

Every cross-chain architecture you have used runs on the same premise: move representations of value across chains, and keep the real asset locked somewhere on the source side. A bridge contract holds actual BTC on Bitcoin while you hold a claim token on Ethereum. A messaging protocol carries proofs of balances while the balances themselves stay locked. The locked asset is the core assumption. It is also why every major bridge exploit has run the same script: find the lockup address, drain what is behind it.

The lockup is not a sloppy detail that better engineers would have avoided. It is the mechanism. The bridge model only works because real assets sit behind a publicly reachable address. The attack is not a bug in the bridge. It is a property of the model.

So the question that matters is whether you can give a user native asset control across several chains without ever creating an address that holds those assets on their behalf. Not wrapped tokens. Not locked collateral. Portable cryptographic signing authority, and assets that never move from where the user placed them.

## Why now

The threshold signature schemes that could do this have existed for years. FROST, the Schnorr threshold protocol used for Ed25519 chains, was published in 2020. GG20, the threshold ECDSA construction for secp256k1 that covers Ethereum, Bitcoin, and Tron, was published the same year. The cryptography was ready long before any practical deployment showed up.

The blocking problem was coordination latency. Both protocols need several synchronous rounds between signing parties before they produce output. A signer has to see everyone's contribution from round N before computing round N+1. If your coordination layer settles a round every 12 seconds, a three-round ceremony takes at least 36 seconds end to end. That window is long enough for operators to go offline between rounds, so liveness failures pile up in proportion to operator count. The larger and more decentralized your signer set, the less reliable your signing gets.

Solana settles a slot every 400 milliseconds. A three-round sequence completes in well under two seconds. This is not a marginal latency win. It is the difference between multi-round MPC being impractical as a real-time signing service and being fast enough that users never feel the coordination happening. Slow chains cannot serve as the control plane for this architecture. Solana can.

## How it works

Distin is an Anchor program. The on-chain layer is responsible for four things: economic security, state accounting, threshold enforcement, and liveness. The actual cryptographic share combination happens off-chain in the signing libraries. I will say that plainly, because conflating the two would misrepresent what the program does.

An operator who wants to sign bonds a Token-2022 LST into the bond_vault PDA. The bond is the basis for their staked weight in the signing set, measured in basis points of the total collateral pool. Threshold clearing is a staked-weight calculation, not a headcount. An attacker who wants to corrupt a signing round needs a meaningful fraction of the total bonded LST. The cost of corruption scales with the collateral pool, not with the number of keyholders.

A user who wants to control BTC from their Solana account posts a signing intent to a SigningRequest PDA. The intent names the destination VM family, the signature scheme (FrostEd25519 or Gg20Secp256k1), a message hash, and a slot deadline. Each participating operator submits a PartialSignature PDA. The program checks that the operator is active and not jailed, that the scheme matches the one declared in the request, and that the slot deadline has not passed. It adds the operator's staked weight to a running accumulator. Once accumulated weight crosses the protocol threshold, the aggregate_and_emit instruction closes the request and the aggregate signature is ready for a relayer to pick up.

The relayer is the honest limitation, so I will name it directly. It is an off-chain component. It cannot forge the aggregate signature, and if it submits a malformed transaction the destination chain rejects it, because the signature will not verify. Its failure mode is liveness: if it goes offline, requests expire at their slot deadline and users repost. But you are trusting it for liveness, and that is worth knowing before you build on top.

When an operator equivocates by submitting valid partials to two conflicting requests in the same slot window, their bond_vault balance moves to the slash_pool PDA in the same transaction that catches the equivocation. No governance process. No dispute window. The program executes the slash immediately, as part of the same instruction that detects the conflicting state.

The off-chain signing libraries are where the cryptographic share combination lives. They handle the actual FROST and GG20 round computations. The on-chain program marks the integration points and trusts that operators run the correct signing software. The staked collateral is what makes that trust bounded and economic instead of purely social.

## Numbers

Program (devnet): 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6

Destination VM families in one program (TargetVm): Svm via FROST Ed25519; Evm, Tron, Cosmos, and Bitcoin via GG20 secp256k1.

PDA namespaces: protocol, bond_vault, slash_pool, operator, request, partial. Every signing round is a deterministically addressable on-chain state machine.

Unbonding restriction: an operator cannot begin withdrawing collateral while a signing request they took part in has not finalized or expired. Checked at instruction level against the current slot.

23 error codes, each tied to a specific invariant the program enforces. ThresholdNotMet is the finalization gate. RequestExpired removes liveness pressure once a slot deadline passes. OperatorJailed keeps a slashed operator out of later rounds. SchemeMismatch is a hard rejection with no fallback across curve families.

## Verify it yourself

The program is at 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6 on devnet. Pull the Anchor IDL from the deployed account. Check the PDA seeds against the state.rs documentation. Read the threshold enforcement in the aggregate_and_emit handler. Confirm the unbonding restriction is enforced at the instruction level against the current slot.

Source: github.com/distin-xyz/distin

The part you cannot fully verify on-chain today is the share combination logic. That lives in the off-chain signing libraries, which are in the source repository and are the right starting point for anyone evaluating the cryptographic security of the construction. The on-chain program marks the integration boundaries explicitly.

The control-plane logic, the part that governs economic security and stops operators from exiting during an active signing window, is fully on-chain. Read it.

Program (devnet): 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6. Source: github.com/distin-xyz/distin. Site: distin.xyz.
