# Distin: thread + media checklist

Program (devnet): `4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6`
Source: github.com/distin-xyz/distin · Site: distin.xyz

This file holds the numbered X thread and the screenshot/video shotlist. The
standalone posts, longer take, comparison, and FAQ answers live in `campaign.md`.

All copy is English. No em-dashes. The status line is honest: the off-chain
threshold signing is built and independently verified; the program is deployed
and live on **devnet**. Mainnet, audit, and networked-operator hardening are
not done, and the copy never pretends otherwise.

Ground truth (verified against the real engine, not the demoware draft):
- FROST Ed25519, 2-of-3, ZF `frost-ed25519` crate, aggregate accepted by the
  independent `ed25519-dalek` verifier. `engine/kobe`, `cargo test` (~10s).
- GG20 threshold ECDSA, 2-of-3, secp256k1, Binance `tss-lib` v2; the `(r,s,v)`
  ecrecovers under go-ethereum to the group address. `engine/kobe-ecdsa`,
  `go test` (~110s). Same signer proven native-valid on BTC (BIP-143, verified
  by decred secp256k1) and Tron.
- M7: three OS processes (distinct PIDs, ports, identity keys, share files) run
  the GG20 DKG and a 2-of-3 sign over Ed25519-authenticated TCP, triggered by an
  on-chain request. `engine/kobe-ecdsa/net`, `engine/coordinator` net-demo.
- On-chain Anchor program: 6 PDA seeds (protocol, bond_vault, slash_pool,
  operator, request, partial), 5 `TargetVm` (Svm, Evm, Tron, Cosmos, Bitcoin),
  2 schemes (FrostEd25519, Gg20Secp256k1), 22 error codes. The fake byte-fold
  "signature" was removed; `aggregate_and_emit` takes the real off-chain
  aggregate and enforces threshold + slot deadline.
- Deployed live on Solana devnet at `4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6`,
  deploy tx `3LAt17P8Zmh2EYyphzVF4EHNY1uffkaJp7cp4V2yUpNh3MoV82iP5mEvdg18XMBUnKwANDGANCj43mEVRJUh6ZAQ`.

---

## Media production checklist

### Screenshots (S1–S7)

S1: The test passing (the whole thesis in one frame)
- Tag: #ProveItYourself
- Frame: a terminal in `engine/kobe` after `cargo run --example frost_demo`. The
  `group pubkey`, the 64-byte `signature`, and the `VERIFIED — 2 of 3 shares
  produced a valid standard Ed25519 signature, and the group secret was never
  reconstructed.` block all in one shot.
- Crop: the command line at top, the VERIFIED block at bottom. Nothing else.
- Caption (in tweet body): "Two of three key shares. One signature `ed25519-dalek` accepts. The group secret is never assembled. Run it yourself."

S2: GG20 test output, all green
- Tag: #ThresholdECDSA
- Frame: `engine/kobe-ecdsa` after `go test -v`. The PASS lines for
  `TestTwoOfThreeRecoversGroupEthAddress`, `TestSignatureIsEthWireFormat`
  (go-ethereum accepts it), `TestBtcThresholdSignVerifies` (decred secp256k1
  accepted the DER signature), and `TestAnyTwoOfThreeQuorum`.
- Crop: from the first `--- PASS` through `ok  github.com/distin/kobe-ecdsa`.
- Caption: "2-of-3 threshold ECDSA. The `(r,s,v)` ecrecovers under go-ethereum to the group address. Same signature is native-valid on Bitcoin and Tron."

S3: On-chain program confirmation
- Tag: #ProgramVerification
- Frame: Solana Explorer (devnet) for 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6
- Crop: URL bar (showing ?cluster=devnet) + Program ID + "Executable: Yes" + the
  BPF Upgradeable Loader line. Cut the rest.
- Caption: none. Let the address and "Executable" speak.

S4: SignatureScheme + TargetVm enums
- Tag: #SchemeBranch
- Frame: state.rs SignatureScheme (FrostEd25519, Gg20Secp256k1) and TargetVm
  (Svm, Evm, Tron, Cosmos, Bitcoin), both with doc comments.
- Caption: "FROST Ed25519 for the SVM family. GG20 secp256k1 for EVM, Bitcoin, Tron, Cosmos. Branched at the instruction level. A mismatched partial gets SchemeMismatch."

S5: Error code set
- Tag: #ThresholdEnforcement
- Frame: errors.rs in full. ThresholdNotMet, RequestExpired, OperatorJailed,
  MalformedPartialSignature, SchemeMismatch, RequestAlreadyFinalized visible.
- Use: attach to tweet 10. 22 invariants, one per code.

S6: M7 networked operators
- Tag: #NetworkedSigning
- Frame: three terminals side by side, three operator processes (distinct PIDs
  and ports visible), the GG20 DKG and 2-of-3 sign running over TCP, ending in
  the ecrecover-matches-group line.
- Caption: "Three separate processes. Three share files. One 2-of-3 signature over authenticated TCP, triggered by an on-chain request."

S7: LST bonding transaction
- Tag: #EconomicSecurity
- Frame: the real devnet tx where a Token-2022 TransferChecked moved LST into the
  bond_vault PDA.
- Caption: "Operators lock LST via Token-2022 TransferChecked into the bond_vault PDA. Slashable on equivocation."

### Videos (V1–V3)

V1: The two-minute proof, screen-recorded
- Tag: #ProveItYourself
- Length: 90–120s
- Shots:
  1. A clean clone. `cd engine/kobe`. `cargo test`. Three green tests, including
     `one_share_cannot_sign - should panic ... ok` and
     `two_of_three_aggregate_is_a_valid_ed25519_signature ... ok`.
  2. `cargo run --example frost_demo`. The group pubkey, the 64-byte signature,
     the VERIFIED block. Pause on it.
  3. `cd ../kobe-ecdsa`. `go test -v`. Let it run. The PASS lines land one by
     one: ecrecover matches, go-ethereum accepts, decred accepts the BTC DER,
     Tron recovers.
  4. No cuts that skip a step. The point is that nothing is hidden.
- Audio: none. English captions only.
- Ratio: 16:9

V2: The on-chain coordination loop
- Tag: #Architecture
- Length: 25–35s
- Shots:
  1. A "Solana" box at center, sublabel "(control plane)".
  2. An arrow from the user into a SigningRequest PDA, labeled "32-byte intent".
  3. Operator nodes each emit a PartialSignature PDA.
  4. A staked-weight bar fills; at the threshold line the color flips.
  5. `aggregate_and_emit` records the real off-chain aggregate on-chain.
  6. A relayer picks it up and branches to EVM, BTC, Tron, Cosmos icons.
  7. "No lockup contract" overlays each destination in turn.
- Audio: none. Ratio: 16:9.

V3: Slashing
- Tag: #EconomicSecurity
- Length: 20–25s
- Shots:
  1. An operator locks LST into bond_vault. Label "Token-2022 TransferChecked".
  2. The operator submits partials to two conflicting requests.
  3. The program jails it; the icon turns red.
  4. bond_vault balance moves to slash_pool in the same instruction. Text:
     "slashed on-chain, no governance vote".
- Audio: none. Ratio: 16:9.

### Production notes

- S3, S6, S7 must be real on-chain or real process output. No mock data, no
  composites. Explorer URL visible with ?cluster=devnet.
- V1 is the most important asset in the whole campaign. It must run clean from a
  fresh clone with no edit cuts. A cut that skips a test reads as hiding one.
- The program address 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6 appears in
  every on-chain screenshot and video, or it goes in the caption.
- Tone: dark backgrounds. No neon, no glow, no CRT. Default Explorer colors fine.
- Captions English only. After upload compression, keep text at least 1/20 of
  frame height so it survives recompression.

---

## 1/ Greeting

Distin lets one Solana account hold native signing authority over Bitcoin,
Ethereum, Tron, and Cosmos. No bridge contract, no wrapped asset, on any chain.

If that sounds like the kind of claim you should distrust, good. So the whole
thing is built to be checked. Two commands, two minutes, and you watch a real
threshold signature get accepted by the destination chain's own verifier.

Program (devnet): 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6
Source: github.com/distin-xyz/distin · Site: distin.xyz

---

## 2/ The receipt, first

```
cd engine/kobe && cargo test
```

That runs a 2-of-3 FROST Ed25519 ceremony and then verifies the result under
`ed25519-dalek` directly, the same RFC 8032 primitive a Solana validator runs.
Two of three operators sign. The third stays offline. The group secret is never
assembled anywhere, on any machine, at any point.

It also asserts the failures: one share alone can't sign, a tampered signature
is rejected, the wrong group key is rejected. A green run can't be a false
positive, because the negative cases are in the same suite.

[attach S1]

---

## 3/ The other curve

```
cd engine/kobe-ecdsa && go test -v -timeout 600s
```

Same idea, harder math: 2-of-3 GG20 threshold ECDSA over secp256k1, the curve
Ethereum, Bitcoin, and Tron all run. The `(r,s,v)` it produces ecrecovers, under
go-ethereum's own `Ecrecover`, to the address derived from the group key. That is
the exact check an Ethereum node performs.

The same signer is proven native-valid on Bitcoin (a BIP-143 sighash, accepted
by the decred secp256k1 library, a different library than the one that signed)
and on Tron. Takes about 110 seconds. Safe-prime DKG is genuinely slow, and we
left the real timing in.

[attach S2]

---

## 4/ Why this matters

Every bridge moves a wrapped IOU, not the real asset. So a lockup contract sits
on the source chain holding actual BTC or ETH, publishing how much it holds,
reachable from any laptop on earth, for as long as the bridge exists.

The exploit history is not a run of sloppy code. The lockup has to exist for the
model to work, and the lockup is the thing that gets drained.

Distin has no lockup. The asset never moves. The only thing that crosses a chain
is the signature you just watched verify.

---

## 5/ How the pieces fit

The cryptography is off-chain (it has to be; that is where shares stay split).
The coordination is on-chain, on Solana.

A user posts a 32-byte intent to a SigningRequest PDA: destination VM, scheme,
message hash, slot deadline. Each operator submits a PartialSignature PDA. The
program accumulates staked weight. Threshold clears before the deadline,
`aggregate_and_emit` records the real off-chain aggregate on-chain. It doesn't
clear, RequestExpired, the user reposts.

Every step is a Solana instruction. Every state is an on-chain account.

---

## 6/ The branch

The signing scheme is fixed on the request and branches at the instruction level.

FROST Ed25519 for the SVM family, where Ed25519 is native. GG20 secp256k1 for
EVM, Bitcoin, Tron, and Cosmos, where the destination wants ECDSA.

Submit a partial that doesn't match the scheme declared in the request and the
program throws SchemeMismatch. Hard reject. No coercion across curve families.

[attach S4]

---

## 7/ Why now, why Solana

The cryptography is five years old. FROST published in 2020, GG20 in 2020. Nobody
was waiting on a math breakthrough.

What was missing was a place to run the coordination. FROST is 3 rounds, GG20 is
~6, and signers have to see round N before computing round N+1. On a 12-second
chain a three-round ceremony takes 36 seconds minimum, long enough for operators
to drop offline between rounds, so signing fails more the more you decentralize.

Solana settles a slot every ~400ms. The same ceremony finishes in seconds of
wall-clock time. That is the whole reason the control plane lives here.

---

## 8/ Networked, not a single binary

The shares don't sit in one process pretending to be three.

In the M7 path, three separate OS processes run the show: distinct PIDs, distinct
ports, distinct Ed25519 identity keys, distinct share files. They run the GG20
DKG and a 2-of-3 sign over authenticated TCP. An on-chain request triggers it.
The resulting wire signature ecrecovers to the group address.

It's localhost today, not a hardened network. We say exactly that below. But the
distributed signing path is real and runs end to end.

[attach S6]

---

## 9/ What's on-chain and verifiable now

On devnet at 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6:

A Protocol singleton with an operator registry. LST bonding and unbonding via
Token-2022 TransferChecked into the bond_vault PDA. Staked-weight accumulation
per SigningRequest. Slot-deadline enforcement with RequestExpired. An
OperatorJailed state that blocks participation. SchemeMismatch rejection at
submission. Slash execution into the slash_pool PDA with no intermediate step.

`aggregate_and_emit` takes the real off-chain aggregate as input and enforces
threshold and deadline. The earlier draft folded bytes together and called it a
signature. That fake was removed. The aggregate the program records is the one
the test in tweet 2 just verified.

---

## 10/ The numbers

5 destination VM families in one program. 2 schemes. 6 PDA namespaces, so every
signing round is a deterministically addressable state machine. 22 error codes,
each mapped to one invariant.

The unbonding cooldown is checked at the instruction level against the current
slot. An operator cannot start withdrawing collateral while a signing window they
took part in is still open. Otherwise you sign, you unbond, you walk, and the
slash hits an empty account.

[attach S5]

---

## 11/ Why staked weight, not headcount

A t-of-n scheme that counts heads is beaten by spinning up many cheap operators.

Distin thresholds on staked weight. To corrupt a signing round an attacker needs
a meaningful fraction of the total bonded LST, so the cost of corruption scales
with the collateral pool, not with the number of keyholders.

Slashing makes it binding. When an operator equivocates, their bond_vault balance
moves to the slash_pool in the same transaction that catches it. No dispute
window. No governance delay.

[attach S5]

---

## 12/ The relayer question, answered straight

"The off-chain relayer is still a trusted component."

It is. The relayer broadcasts the aggregate signature but cannot forge it. Go
offline and requests expire at their slot deadline and users repost. Submit a
malformed transaction and the destination chain rejects it, because the signature
doesn't verify. Its failure mode is liveness, not safety.

The power that can actually steal from you, producing the signature, sits with
operators who are bonded on-chain and slashable. We put the dangerous trust
behind staked collateral and left the harmless trust in a part anyone can replace.

---

## 13/ The name

Distin is short for distinct.

Two things people usually fuse stay separate: the asset, and the authority to
spend it. Your BTC stays on Bitcoin. The authority travels as one signature,
produced on demand by bonded operators. Asset here, authority there, distinct on
purpose. That is the design, not a label stuck on after.

---

## 14/ What's real, and what's next

Real and independently verified, today: FROST Ed25519 and GG20 ECDSA threshold
signing, 2-of-3, accepted by ed25519-dalek and go-ethereum; BTC and Tron native
envelopes; the on-chain coordination loop end to end; networked operators over
TCP; the reconciled program live on devnet.

Not done, and not claimed: the networked path is localhost, no TLS or PKI yet,
fail-stop instead of identifiable abort, shares in files not an HSM. This
integration and the on-chain program are not audited. Mainnet is gated behind a
verified devnet run. No partners, no audit badge, no token.

Program (devnet): 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6
Source: github.com/distin-xyz/distin · Site: distin.xyz

If a thread sells you a cross-chain primitive with no weaknesses, close the tab.
Ours are right here, and so is the test that proves the part that does work.

---
---

# X Article: Distin

# You can watch the impossible-sounding part verify in two minutes

The claim is small and hard to believe: one Solana account can hold native
signing authority over Bitcoin, Ethereum, Tron, and Cosmos, with no bridge
contract and no wrapped asset anywhere. The reason it is hard to believe is the
reason every line of this is built to be checked. So before any architecture,
here is the check.

## Run it

```
cd engine/kobe && cargo test
```

This runs a 2-of-3 FROST Ed25519 ceremony, keygen through aggregate, and then
verifies the result two ways: under FROST's own verify path, and under the
independent `ed25519-dalek` crate, which is the exact RFC 8032 primitive a Solana
or Cosmos chain runs. Two of three operators sign, the third stays offline, and
the group secret is never reconstructed on any machine at any point. The same
suite asserts that one share alone cannot sign, that a tampered signature fails,
and that the wrong group key fails. A green run cannot be a false positive,
because the negative cases ride in the same file.

```
cd engine/kobe-ecdsa && go test -v -timeout 600s
```

This runs 2-of-3 GG20 threshold ECDSA over secp256k1, the curve under Ethereum,
Bitcoin, and Tron. The `(r,s,v)` it produces recovers, under go-ethereum's own
`Ecrecover`, to the address derived from the group public key. That is precisely
what an Ethereum node does to a transaction. The same signer is then proven
native-valid on Bitcoin, a BIP-143 sighash DER-encoded and accepted by the decred
secp256k1 library, a different library than the one that signed, and on Tron,
where the recovered address matches a known vector. It takes about 110 seconds,
because safe-prime DKG is genuinely slow, and we left the real timing in rather
than trimming it for a cleaner number.

That is the thesis, reproducible from a clean clone: shares in, one chain-valid
signature out, verified by the destination chain's own primitive, never the
secret key.

## Why anyone should care

Every cross-chain system you have used moves a representation and locks the
original. A bridge contract holds real BTC on Bitcoin while you hold a claim
token on Ethereum. The locked asset is not a detail a better engineer would have
avoided. It is the mechanism. The bridge only works because real value sits
behind a publicly reachable address, and every major drain ran the same script:
find the lockup, take what is behind it.

Distin removes the address. The asset never moves. The only thing that crosses a
chain is the signature you just watched verify, produced the moment you decide to
spend it by a set of bonded operators who jointly sign without any one of them
holding the key.

## How it works

The cryptography is off-chain, because that is where the shares stay split. The
coordination is on-chain, on Solana, and that split is the whole design.

An operator who wants to sign bonds a Token-2022 LST into the bond_vault PDA. The
bond is their staked weight in the signing set, measured against the total
collateral pool. Threshold clearing is a staked-weight calculation, not a
headcount, so the cost of corrupting a round scales with the collateral, not with
the number of keyholders.

A user posts a signing intent to a SigningRequest PDA: the destination VM, the
scheme (FrostEd25519 or Gg20Secp256k1), a 32-byte message hash, and a slot
deadline. Each participating operator submits a PartialSignature PDA. The program
checks the operator is active and not jailed, that the scheme matches the request,
and that the deadline has not passed, then adds the operator's staked weight to an
accumulator. Once weight crosses the threshold, `aggregate_and_emit` records the
real off-chain aggregate on-chain and closes the request. An earlier version of
the program folded bytes together and called the result a signature. That fake
was removed. The aggregate the program now records is the same kind of aggregate
the tests above verify.

The relayer is the honest limitation, so name it directly. It broadcasts the
aggregate signature. It cannot forge it, and a malformed transaction is rejected
by the destination chain because the signature will not verify. If it goes
offline, requests expire and users repost. You are trusting it for liveness, not
safety, and that is worth knowing before you build on it.

When an operator equivocates by submitting valid partials to two conflicting
requests in the same window, their bond_vault balance moves to the slash_pool PDA
in the same transaction that catches the conflict. No governance process, no
dispute window. The slash is part of the instruction that detects the fault.

## Networked, and honest about how far

The signing is not one process pretending to be three. In the M7 path, three
separate OS processes, with distinct PIDs, ports, Ed25519 identity keys, and
share files, run the GG20 DKG and a 2-of-3 sign over authenticated TCP. An
on-chain request triggers the run, and the wire signature ecrecovers to the group
address.

It is localhost today. No TLS, no PKI beyond a static pinned-key directory, and a
fail-stop abort rather than GG20 identifiable abort, so it does not yet attribute
and slash the specific operator who misbehaved. Shares live in local files, not
an HSM. That hardening is the next milestone, and it is not done.

## Numbers

Program (devnet): 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6, deploy tx
3LAt17P8Zmh2EYyphzVF4EHNY1uffkaJp7cp4V2yUpNh3MoV82iP5mEvdg18XMBUnKwANDGANCj43mEVRJUh6ZAQ.

Two schemes: FROST Ed25519 for the SVM family, GG20 secp256k1 for EVM, Bitcoin,
Tron, and Cosmos. Five destination VM families in one program. Six PDA
namespaces, so every signing round is a deterministically addressable state
machine. Twenty-two error codes, each tied to one invariant: ThresholdNotMet is
the finalization gate, RequestExpired releases liveness pressure past the
deadline, OperatorJailed keeps a slashed operator out of later rounds,
SchemeMismatch is a hard reject across curve families.

## What is verified, and what is not

Verified, today, from a clean clone: the threshold signing on both curves,
accepted by independent standard verifiers; the BTC and Tron envelopes; the
on-chain coordination loop end to end on a local validator; the networked
operators over TCP; and the reconciled program live on devnet.

Not verified, and not claimed: a security audit. `tss-lib` and `frost-ed25519`
are audited; this integration and the on-chain program are not. Nothing here is
audited for real value. The networked path is localhost. Mainnet is gated behind
a verified devnet run.

The honest cost stays stated: a threshold of colluding operators can still sign
your asset away. Slashing makes that expensive, not impossible, and a single
account that signs for every chain is also a single account whose compromise
spends everything. We say it in the copy instead of hiding it.

Program (devnet): 4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6. Source:
github.com/distin-xyz/distin. Site: distin.xyz. Pull the IDL, read the threshold
handler, then run the two tests and watch the part that sounds impossible verify.
