# Distin: marketing campaign

Program: `4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6`
Source: github.com/distin-xyz/distin · Site: distin.xyz

This file is the campaign: one story spine, then 15 pieces in distinct formats.
The thread + media checklist live in `tweets.md`. This is the rest of the
surface: standalone posts, a longer take, a comparison, FAQ answers, quote-bait.

All copy is English. No em-dashes. Every claim is pulled from and checked against
the real engine (`engine/kobe`, `engine/kobe-ecdsa`, `engine/coordinator`,
`engine/programs/distin`) and `README.md` / `core.verified`. Where the README
says 23 error codes and the source says 22, the copy uses 22, the number you'll
count in `errors.rs`.

---

## Story spine

Distin makes one claim, and it is the kind you should distrust: a single Solana
account can hold native signing authority over Bitcoin, Ethereum, Tron, and
Cosmos, with no bridge contract and no wrapped asset anywhere.

The distrust is the point. So the whole thing is built so you can check the hard
part yourself, before you read a word of architecture. Two commands, two minutes,
from a clean clone. `cargo test` runs a 2-of-3 FROST Ed25519 ceremony and hands
the result to `ed25519-dalek`, the exact primitive a Solana validator runs.
`go test` runs 2-of-3 GG20 threshold ECDSA and the signature ecrecovers under
go-ethereum to the group address, the exact check an Ethereum node performs. Two
of three operators sign. The third stays offline. The group secret is never
assembled. You watch a real threshold signature get accepted by the destination
chain's own verifier.

That is the lead, because the receipt is the product. Everything else explains
why the receipt matters.

Why it matters: every cross-chain system you have used moves a copy and locks the
original. The original sits in a contract on the source chain, the biggest
reachable target on the network, and every nine-figure drain ran the same one
line of script: find the lockup address, take what is behind it. Distin deletes
the address. The asset never moves. The only thing that crosses is the signature
you just watched verify.

Why on Solana: multi-round MPC needs a control plane that settles rounds faster
than operators drop offline. FROST is 3 rounds, GG20 is ~6. On a 12-second chain
a three-round ceremony takes 36 seconds, too slow to keep operators in the room.
Solana's ~400ms slot finishes it in seconds. The coordination lives on-chain as
ordinary transactions, so the staked collateral can actually witness a fault.

The honest cost, stated everywhere: a threshold of colluding operators can still
sign your asset away. Slashing makes that expensive, not impossible. One account
that signs for every chain is one account whose compromise spends everything. And
the integration is not audited, the networked path is localhost, mainnet is gated
behind a verified devnet run. We say all of it in the copy.

Tension: **the claim sounds too good, so we made it checkable instead of
trustworthy.**
Insight: **you were never moving an asset. You were moving authority. So move
only that, and let anyone verify the move.**

---

## Piece 1: The receipt (lead)

You don't have to believe me. You have to run two commands.

```
cd engine/kobe && cargo test
```

That runs a 2-of-3 FROST Ed25519 ceremony and verifies the output under
`ed25519-dalek`, the same RFC 8032 primitive a Solana validator runs. Two of
three operators sign, the third stays offline, and the group secret is never
assembled on any machine. The suite also asserts that one share alone can't sign
and a tampered signature fails, so a green run can't be a fluke.

```
cd engine/kobe-ecdsa && go test -v -timeout 600s
```

That runs 2-of-3 GG20 threshold ECDSA over secp256k1. The `(r,s,v)` ecrecovers
under go-ethereum to the group address, the exact check an Ethereum node does,
and the same signature is native-valid on Bitcoin and Tron.

Shares in, one chain-valid signature out, never the secret key. That is the whole
thesis, and it runs from a clean clone.

---

## Piece 2: Cold-open pain

You did not get drained because the bridge had a bug.

You got drained because the bridge worked exactly as designed. Real BTC sat in a
lockup contract on Bitcoin. The contract published how much it held. It stayed
reachable from anywhere, every day, for as long as the bridge existed. The
attacker did not break anything clever. They found the address and took what was
behind it. That is not an exploit. That is the address doing its job for the
wrong person.

Distin's answer is blunt: there is no address. Your Bitcoin never moves into
custody. Only a signature crosses, and you can watch it verify.

---

## Piece 3: The one number

400 milliseconds.

That is the whole reason Distin can exist on Solana and nowhere else at scale.

Threshold signing is not one shot. FROST runs 3 rounds, GG20 runs about 6, and a
signer has to see round N before computing round N+1. Host those rounds on a
12-second chain and a three-round ceremony takes 36 seconds minimum. Operators
drop offline inside a window that long, so signing fails more the more
decentralized you make it.

A round per 400ms slot. Three rounds in about a second. The coordination is fast
enough that you do not feel it happening, which is the only condition under which
it can run on-chain at all.

---

## Piece 4: Mechanism in plain words

Here is the entire thing, no jargon padding.

You want a Solana account to spend your Bitcoin. Your Bitcoin stays on Bitcoin.

1. You post an intent: this chain, this 32-byte message hash, this deadline (a
   slot count). It becomes a `SigningRequest` account on Solana.
2. Operators who bonded collateral each submit one partial signature as a normal
   Solana transaction. Each lands in its own `PartialSignature` account, so the
   same operator physically cannot submit twice.
3. The program adds up the staked weight behind those partials. When it crosses
   the threshold before your deadline, `aggregate_and_emit` records the real
   off-chain aggregate on-chain.
4. A relayer broadcasts that signature on Bitcoin. A native BTC transaction. No
   wrapped token, no lockup, nothing held anywhere.

The clever part is what is missing: a vault. The off-chain step in 2 and 3 is the
ceremony you can reproduce with `cargo test` and `go test`.

---

## Piece 5: Contrarian take

Hot take: staking on most "decentralized" bridges is theater.

If your MPC nodes gossip off-chain and only post the finished signature, then the
chain you staked them on never saw the round happen. An operator stalls,
equivocates, or sends a malformed share, and the slashing contract is blind to
all of it. To punish a protocol-level fault you would have to drag an off-chain
transcript into an on-chain court and prove misbehavior after the fact. Almost
nobody does. So the stake is a deposit with a label on it, not a condition the
ledger can enforce.

Distin puts the rounds on-chain so the stake watches the actual crime. The fault
is a row in Solana state. The slash is plain program logic reading that row, in
the same transaction that catches it.

---

## Piece 6: What quietly breaks today

Right now, "use your BTC in DeFi" means this chain of fragile assumptions:

- A contract on Bitcoin holds your real coin.
- It stays solvent and unbroken for as long as you hold the claim.
- The claim token in your wallet keeps being worth one BTC.

That last line is where the bodies are. In every headline failure, the claim
kept circulating in wallets after the coin backing it had already walked out the
door. People held a token that said someone owes you one Bitcoin against a
contract that could no longer pay.

Distin never issues the claim. The coin never leaves Bitcoin. There is nothing to
keep solvent.

---

## Piece 7: Builder devlog

Spent the week on the part that has no glory: the unbonding restriction.

An operator who signed a request should not be able to yank their collateral
before that request resolves. Otherwise you sign, you unbond, you walk, and the
slash hits an empty account. So `begin_unbonding` sets `unbonding_at = current
slot + cooldown`, flips the operator to jailed, and pulls their weight out of the
active set immediately. `withdraw_bond` then refuses until `clock.slot >=
unbonding_at`. The check is at the instruction level against the current slot,
not a timestamp you can fudge.

Unglamorous. Also the difference between slashable collateral and a refundable
deposit.

---

## Piece 8: Before / after

Sending BTC cross-chain.

Before: a bridge contract locks real BTC on Bitcoin mainnet. You hold wBTC on the
other side. The lockup contract sits there holding nine figures, reachable from
any laptop on earth, advertising the balance.

After: your Solana account posts a signing intent. Operators coordinate a GG20
secp256k1 aggregate through the on-chain program, the same GG20 path the `go
test` suite proves ecrecovers to the group address. A relayer broadcasts a native
Bitcoin transaction. A UTXO moves on Bitcoin mainnet with nothing locked anywhere.

Same action from your side. Completely different thing for an attacker to point
at, because there is nothing to point at.

---

## Piece 9: Sharp analogy

A bridge is a coat check that loses coats.

You hand over the real coat, you get a numbered ticket, and your whole evening now
depends on that ticket meaning something when you come back. The pile of real
coats in the back is the target. Burn the coat check, the tickets are worthless.

Distin is not a better coat check. You never needed to hand over the coat. You
needed someone at the door able to vouch for you on the way out. Two of three
bonded operators are that vouch, and the signature they produce is one a single
key could have made. Your coat stays on you.

---

## Piece 10: The proof, in bytes

Want the actual bytes, not a green checkmark? `cargo run --example frost_demo`:

```
parties      : 3, threshold : 2
signing quorum: participants {1, 2}  (party 3 stays offline)
group pubkey : 25d245e6f9923f6025baf9aa031a56a77215ff32c18aba1421065e26cf0b2e29
signature(64): 73b959adfcd616a3e43a44fafdc3f46862abb52997de77ab0a3a4f82b5b9adb1...

independent ed25519-dalek verify against the group key:
VERIFIED — 2 of 3 shares produced a valid standard Ed25519 signature,
           and the group secret was never reconstructed.
```

The key and signature differ every run, because keygen draws fresh randomness.
The invariant is the VERIFIED line. Two shares, one standard signature, no
reconstructed secret. Run it and read the bytes yourself.

---

## Piece 11: FAQ-killer (the relayer question)

"The off-chain relayer is still a trusted party, so what did you actually fix?"

Fair, and worth answering straight. The relayer broadcasts the aggregate
signature. It cannot forge it. Send a malformed transaction and the destination
chain rejects it, because the signature does not verify. Go offline and requests
expire at their slot deadline and users repost. The relayer's failure mode is
liveness, not safety.

The power that actually matters, producing the signature, sits with the operators,
who are bonded on-chain and slashable. We moved the trust that can steal from you
behind staked collateral, and left the trust that can only inconvenience you in a
component anyone can replace.

---

## Piece 12: Why now

The cryptography has been on the shelf since 2020. FROST published in 2020. GG20
published in 2020. Nobody was waiting on a math breakthrough.

What was missing was a place to run the coordination. Multi-round MPC needs a
control plane that settles rounds faster than operators drop offline, and that is
a latency problem, not a crypto problem. The chains fast enough to be that control
plane did not exist at scale until Solana's 400ms slot.

So this is not a new idea finally invented. It is a five-year-old idea that
finally has a chain underneath it that can keep the operators in the same room
long enough to finish a signature, and a test suite that proves they did.

---

## Piece 13: Quote-bait one-liner

You were never bridging an asset. You were bridging authority. Distin moves only
the authority, leaves the asset where you put it, and lets you watch the move
verify.

(Alt: "The safest cross-chain design is the one with nothing left to steal.")

---

## Piece 14: Comparison

How Distin sits next to what exists:

- Wormhole / deBridge: move a wrapped IOU, real asset locked in a source-chain
  contract. The honeypot is the design.
- NEAR Chain Signatures: proved you can drive a native asset on chain A from an
  account on chain B. Coordination stays off-chain, and the hub is NEAR, not
  Solana.
- Lit PKP / Particle Universal Accounts: account abstraction over an off-chain
  MPC network. Same off-chain-coordination assumption.
- Distin: native asset control like NEAR, but the signing rounds run on Solana as
  transactions, so the staked collateral can witness and punish a protocol fault,
  and the threshold ceremony is reproducible from a clean clone in two commands.

We are not claiming we invented the category. We moved the one thing everyone else
left off-chain, and we made the cryptography checkable on the spot.

---

## Piece 15: The honest weakness (said first, by us)

A system that hides what you have to trust has failed at its only job. So:

A threshold of colluding operators can sign your asset away. Slashing raises the
cost of theft to more than the SOL and LST they are willing to burn. That is real,
measurable, and finite. Crypto-economic safety, not cryptographic impossibility.
Different grade of promise, and we are not going to blur them.

The integration is not audited. `tss-lib` and `frost-ed25519` are; this wiring and
the on-chain program are not. The networked path is localhost, no TLS or PKI yet,
fail-stop instead of identifiable abort, shares in files not an HSM. Mainnet is
gated behind a verified devnet run.

And the sharpest one: a single Solana account signing for every chain is also a
single account whose compromise spends everything, and a single pane through which
your whole cross-chain life is visible by construction. The unification that
deletes the bridge concentrates the blast radius. Nothing shipping today solves
that, including this.

If a thread sells you a cross-chain primitive with no weaknesses, close the tab.

---

## Images

Palette: deep eggplant-purple ground, warm gold ribbons, thin bright violet edge
accent, matte paper grain. Matches the Distin site (#8B5CF6 / #7C3AED / #a78bfa /
gold #f0a35e on near-black #060606).

- `images/m04_verified_receipt.webp`: the VERIFIED line over a faint gold
  terminal pass and two gold ribbons merging into one violet ribbon. The lead
  image, for the receipt posts (Piece 1, 10; thread tweets 1, 2, 3).
- `images/m01_one_account_five_chains.webp`: one gold ribbon fanning into five
  chains. Spine visual, one account, five destinations.
- `images/m02_empty_vault.webp`: a hollow gold vault frame holding nothing inside.
  For the "no honeypot" posts (Piece 2, 6, 8).
- `images/m03_threshold_converge.webp`: many gold partials overlapping at a violet
  point into one signature. For mechanism / threshold posts (Piece 4, thread 5).
- Removed: the `s01..s05` SOUSUI-era assets (navy/cream/coral, sluice-gate water
  wheel from the dropped suiryu name). They were off-brand for Distin and have
  been deleted.

---

## Operator note: weakest 2 pieces

1. **Piece 9 (coat-check analogy).** Analogies are the highest AI-smell risk. The
   coat check lands, but the payoff ("someone at the door able to vouch for you")
   strains a little, and I bent it harder this pass to tie back to 2-of-3. If it
   reads clever-for-clever's-sake to you, cut Piece 9. The receipt and mechanism
   pieces carry the campaign without it.

2. **Piece 13 (quote-bait).** One-liners are where you either sound like a person
   or sound like a LinkedIn caption. "You were never bridging an asset, you were
   bridging authority" is the strongest line in the campaign or the most
   AI-poster-ish, depending on your ear, and I tacked "and lets you watch the move
   verify" onto it, which is truer but longer and may dull the punch. Read it out
   loud. If it sounds like a keynote slide, use the alt or drop the tail clause.
