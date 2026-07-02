# Audit inquiry — ready-to-send drafts

Companion to `AUDITORS.md` / `AUDIT_SCOPE.md`. These are complete drafts; fill
the two `[bracketed]` fields and send. Nothing here has been sent anywhere.

---

## Template (Track B — MPC/threshold crypto; primary: NCC Group)

**Subject:** Audit inquiry — Solana threshold-signing protocol wrapping ZF FROST (frost-ed25519) + bnb-chain tss-lib

Hello,

We're seeking a security assessment of **Distin**, a cross-chain threshold-
signing protocol. Solana (Anchor) is the control plane: operators bond LST as
slashable collateral and register a group public key; signing requests
finalize on-chain only when distinct-operator count and staked weight clear a
threshold within a slot deadline.

The cryptographic layer wraps implementations your team may know well:

- **FROST Ed25519** — Zcash Foundation `frost-ed25519` (the crates NCC
  assessed in 2023), driven both in-process (Rust) and as three separate
  operator processes over mutual TLS, reached from Go over a C ABI.
- **GG20 ECDSA** — `bnb-chain/tss-lib` v2.0.2 (post-CVE-2023-33241), also as
  networked operator processes.

Proposed scope (~4 areas): the Rust wrapper + key-set serialization and C ABI;
the Go operator mesh (mTLS/PKI, DKG transcript binding, share-at-rest
envelopes: AES-256-GCM/argon2id and ChaCha20-Poly1305/Argon2id); TSSHOCK-class
implementation-leak review of the GG20 integration; and the encryption-at-rest
layer of the signer daemon. A companion Solana-program track is being scoped
separately. Our internal scope document (trust model, invariants to attack,
known gaps — including honest ones) and a pinned audit commit are ready to
share, along with a live devnet deployment and offline reproduction scripts
for every ceremony.

Could you share availability, indicative team/duration for a scope of this
shape (we anchored on ~25 person-days from your FROST assessment for the
crypto core alone), and your intake process?

Best regards,
[name]
[contact / entity]

---

## Template (Track A — Solana program; primary: OtterSec or Neodyme)

**Subject:** Audit inquiry — Anchor program: threshold-signing control plane (Token-2022 bonds, Pyth-gated stake weight)

Hello,

We're seeking an audit of the on-chain half of **Distin**, a threshold-signing
protocol where Solana is the control plane. One Anchor 0.31 program (~single
crate): operator registration with Token-2022 LST bonds held in a protocol
PDA vault, Pyth-gated stake-weight computation, signing-request lifecycle
(create → partials → aggregate) enforcing distinct-operator count AND staked
weight thresholds inside a slot deadline, admin slashing with weight
recomputation and jailing, plus unbonding.

Particulars an auditor should know up front: the audit ref is the deployed
lineage, not repo HEAD (a newer HEAD changed the operator account layout and
is explicitly out of scope); our scope document lists the invariants we most
want attacked (bond conservation across slash/unbond interleavings, account
layout preservation across upgrades, oracle-spoof surface of the offset-based
Pyth parse) and an honest known-gaps list. Live devnet deployment with a
signing daemon is available for reproduction.

Could you share availability, indicative pricing/duration for a single-program
scope of this shape, and your intake process?

Best regards,
[name]
[contact / entity]

---

## Send order (recommendation)

1. NCC Group (Track B) — strongest prior-knowledge match (they audited the
   exact FROST crates we wrap).
2. OtterSec and Neodyme (Track A) in parallel — take the earlier slot.
3. If NCC is unavailable: Verichains (TSSHOCK authors) or Kudelski (original
   tss-lib auditors) for Track B.

Intake links are on each firm's site; all four take inquiries by form/email.
