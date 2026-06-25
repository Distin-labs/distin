# Distin: marketing campaign

Program: `2KNozrxEXtW6bzm741Egw4R79B8AnxX33yJG5rkJAHUd`
Source: github.com/distin-xyz/distin · Site: distin.xyz

This file is the campaign: one story spine, then 15 pieces in distinct formats.
The thread + media checklist live in `tweets.md`. This is the rest of the surface
area: standalone posts, a longer take, a comparison, FAQ answers, quote-bait.

All copy is English. No em-dashes. Pulled from the real engine
(`engine/programs/distin/src/lib.rs`, `state.rs`, `errors.rs`) and `docs/`.

---

## Story spine

Every cross-chain system you have used moves a copy and locks the original.
The original sits in a contract on the source chain. That contract is the
biggest reachable target on the network, and every nine-figure bridge drain
followed the same one-line script: find the lockup address, take what is behind
it.

Distin deletes the address. Your Bitcoin never moves. The only thing that
crosses is one signature, produced the moment you decide to spend, by a set of
bonded operators who jointly sign without any one of them holding the key.

The part nobody else does: Distin runs the signing rounds *on-chain*, on Solana,
as ordinary transactions. NEAR proved you can drive a native asset from another
chain. Everyone, including NEAR, keeps the multi-round MPC coordination off-chain
on a side network the blockchain never sees. That choice quietly defeats the
staking you bolt on, because the chain you slash with never witnessed the fault.
Distin puts every commitment, every partial, every missed deadline into Solana
state, so a fault is a row the slashing logic reads, not a transcript you have to
litigate after the fact.

It only works because of one number: Solana's ~400ms slot. A two-or-three-round
signing protocol settles in about a second. On a 12-second chain the same
protocol takes most of a minute, which is too slow to keep operators online
across rounds. That is the real reason a slow chain cannot host the control plane.

The honest cost, stated everywhere: a threshold of colluding signers can still
sign your asset away. Slashing makes that expensive, not impossible. And one
account that signs for every chain is also one account whose compromise spends
everything. We say this in the copy instead of hiding it.

Tension: **the safest cross-chain design removes the thing being guarded.**
Insight: **you were never moving an asset. You were moving authority. So move only that.**

---

## Piece 1: Cold-open pain

You did not get drained because the bridge had a bug.

You got drained because the bridge worked exactly as designed. Real BTC sat in a
lockup contract on Bitcoin. The contract published how much it held. It stayed
reachable from anywhere, every day, for as long as the bridge existed. The
attacker did not break anything clever. They found the address and took what was
behind it. That is not an exploit. That is the address doing its job for the
wrong person.

Distin's answer is blunt: there is no address. Your Bitcoin never moves into
custody. Only a signature crosses.

---

## Piece 2: The one number

400 milliseconds.

That is the whole reason Distin can exist on Solana and nowhere else at scale.

Threshold signing is not one shot. The operators run two or three rounds of
back-and-forth before a signature exists. Host those rounds on a 12-second chain
and a three-round ceremony takes 36 seconds minimum. Operators drop offline
inside a window that long, so signing fails more the more decentralized you make
it.

A round per 400ms slot. Three rounds in about a second. The coordination is fast
enough that you do not feel it happening, which is the only condition under which
it can run on-chain at all.

---

## Piece 3: Mechanism in plain words

Here is the entire thing, no jargon padding.

You want a Solana account to spend your Bitcoin. Your Bitcoin stays on Bitcoin.

1. You post an intent: this chain, this message hash, this deadline (a slot
   count). It becomes a `SigningRequest` account on Solana.
2. Operators who bonded collateral each submit one partial signature as a normal
   Solana transaction. Each lands in its own `PartialSignature` account, so the
   same operator physically cannot submit twice.
3. The program adds up the staked weight behind those partials. When it crosses
   the threshold before your deadline, it emits one aggregate signature.
4. A relayer broadcasts that signature on Bitcoin. A native BTC transaction. No
   wrapped token, no lockup, nothing held anywhere.

The clever part is what is missing: a vault.

---

## Piece 4: Contrarian take

Hot take: staking on most "decentralized" bridges is theater.

If your MPC nodes gossip off-chain and only post the finished signature, then the
chain you staked them on never saw the round happen. An operator stalls,
equivocates, or sends a malformed share, and the slashing contract is blind to
all of it. To punish a protocol-level fault you would have to drag an off-chain
transcript into an on-chain court and prove misbehavior after the fact. Almost
nobody does. So the stake is a deposit with a label on it, not a condition the
ledger can enforce.

Distin puts the rounds on-chain specifically so the stake watches the actual
crime. The fault is a row in Solana state. The slash is plain program logic
reading that row, in the same transaction that catches it.

---

## Piece 5: What quietly breaks today

Right now, "use your BTC in DeFi" means this chain of fragile assumptions:

- A contract on Bitcoin holds your real coin.
- It stays solvent and unbroken for as long as you hold the claim.
- The claim token in your wallet keeps being worth one BTC.

That last line is where the bodies are. In every headline failure, the claim
kept circulating in wallets after the coin backing it had already walked out the
door. People held a token that said *someone owes you one Bitcoin* against a
contract that could no longer pay.

Distin never issues the claim. The coin never leaves Bitcoin. There is nothing
to keep solvent.

---

## Piece 6: Builder devlog

Spent the week on the part that has no glory: the unbonding restriction.

An operator who signed a request should not be able to yank their collateral
before that request resolves. Otherwise you sign, you unbond, you walk, and the
slash hits an empty account. So `begin_unbonding` sets `unbonding_at = current
slot + cooldown`, flips the operator to jailed, and pulls their weight out of the
active set immediately. `withdraw_bond` then refuses until `clock.slot >=
unbonding_at`. The check is at the instruction level against the current slot, not
a timestamp you can fudge.

Unglamorous. Also the difference between slashable collateral and a refundable
deposit.

---

## Piece 7: Before / after

Sending BTC cross-chain.

Before: a bridge contract locks real BTC on Bitcoin mainnet. You hold wBTC on the
other side. The lockup contract sits there holding nine figures, reachable from
any laptop on earth, advertising the balance.

After: your Solana account posts a signing intent. Operators coordinate a GG20
secp256k1 aggregate through the on-chain program. A relayer broadcasts a native
Bitcoin transaction. A UTXO moves on Bitcoin mainnet with nothing locked anywhere.

Same action from your side. Completely different thing for an attacker to point
at, because there is nothing to point at.

---

## Piece 8: Sharp analogy

A bridge is a coat check that loses coats.

You hand over the real coat, you get a numbered ticket, and your whole evening
now depends on that ticket meaning something when you come back. The pile of real
coats in the back is the target. Burn the coat check, the tickets are worthless.

Distin is not a better coat check. It is the realization that you never needed to
hand over the coat. You needed someone at the door able to vouch for you on the
way out. The operators are that signature at the door. Your coat stays on you.

---

## Piece 9: The receipt

Everything below is on-chain and readable today on devnet at
`2KNozrxEXtW6bzm741Egw4R79B8AnxX33yJG5rkJAHUd`.

- 6 PDA namespaces: protocol, bond_vault, slash_pool, operator, request, partial.
  Every signing round is a deterministically addressable state machine.
- Collateral moves via Token-2022 `TransferChecked` into the `bond_vault` PDA.
- Slashed bonds move `bond_vault -> slash_pool` in the same instruction, no
  governance vote, no dispute window.
- 23 error codes, each mapped to one invariant. `ThresholdNotMet` is the
  finalize gate. `SchemeMismatch` is a hard reject across curve families, no
  fallback.
- 5 destination VM families (`TargetVm`: Svm, Evm, Tron, Cosmos, Bitcoin), two
  schemes: FROST Ed25519 for the SVM family, GG20 secp256k1 for EVM, Tron,
  Cosmos, and Bitcoin.

Pull the IDL from the deployed account and check it line by line.

---

## Piece 10: FAQ-killer (the relayer question)

"The off-chain relayer is still a trusted party, so what did you actually fix?"

Fair, and worth answering straight. The relayer broadcasts the aggregate
signature. It cannot forge it. Send a malformed transaction and the destination
chain rejects it, because the signature does not verify. Go offline and requests
expire at their slot deadline and users repost. The relayer's failure mode is
liveness, not safety.

The power that actually matters, producing the signature, sits with the
operators, who are bonded on-chain and slashable. We moved the trust that can
steal from you behind staked collateral, and left the trust that can only
inconvenience you in a component anyone can replace.

---

## Piece 11: Why now

The cryptography has been sitting on the shelf since 2020. FROST published in
2020. GG20 published in 2020. Nobody was waiting on a math breakthrough.

What was missing was a place to run the coordination. Multi-round MPC needs a
control plane that settles rounds faster than operators drop offline, and that is
a latency problem, not a crypto problem. The chains fast enough to be that
control plane did not exist at scale until Solana's 400ms slot.

So this is not a new idea finally invented. It is a five-year-old idea that
finally has a chain underneath it that can keep the operators in the same room
long enough to finish a signature.

---

## Piece 12: Quote-bait one-liner

You were never bridging an asset. You were bridging authority. Distin moves only
the authority and leaves the asset exactly where you put it.

(Alt: "The safest cross-chain design is the one with nothing left to steal.")

---

## Piece 13: Comparison

How Distin sits next to what exists:

- Wormhole / deBridge: move a wrapped IOU, real asset locked in a source-chain
  contract. The honeypot is the design.
- NEAR Chain Signatures: proved you can drive a native asset on chain A from an
  account on chain B. Coordination stays off-chain, and the hub is NEAR, not
  Solana.
- Lit PKP / Particle Universal Accounts: account abstraction over an off-chain
  MPC network. Same off-chain-coordination assumption.
- Distin: native asset control like NEAR, but the signing rounds run on Solana as
  transactions, so the staked collateral can actually witness and punish a
  protocol fault. Solana is the control plane, not one supported chain among many.

We are not claiming we invented the category. We are claiming we moved the one
thing everyone else left off-chain.

---

## Piece 14: The honest weakness (said first, by us)

A system that hides what you have to trust has failed at its only job. So:

A threshold of colluding operators can sign your asset away. Slashing raises the
cost of theft to "more than the SOL and LST they are willing to burn." That is
real, measurable, and finite. Crypto-economic safety, not cryptographic
impossibility. Different grade of promise, and we are not going to blur them.

And the sharpest one: a single Solana account signing for every chain is also a
single account whose compromise spends everything, and a single pane through
which your whole cross-chain life is visible by construction. The unification that
deletes the bridge also concentrates the blast radius. We are not waving a
privacy layer at this and calling it solved, because nothing shipping today
solves it.

If a thread sells you a cross-chain primitive with no weaknesses, close the tab.

---

## Piece 15: Devnet announcement

Distin is running on devnet. The threshold-signature coordination layer is
deployed and the core flow works end to end.

One Solana account holds signing authority over native assets on SVM, EVM,
Bitcoin, Tron, and Cosmos. Operators bond LST as slashable collateral. The signing
rounds run on-chain. No lockup contract on any destination chain, because there
is nothing to lock.

We have driven the full path on devnet: initialize the protocol, register a
bonded operator, post a signing intent, finalize. `create_signing_request`
confirms as an ordinary Solana transaction. This is the testing stage, not a
mainnet launch, and we are not going to pretend otherwise.

Program (devnet): `2KNozrxEXtW6bzm741Egw4R79B8AnxX33yJG5rkJAHUd`
Source: github.com/distin-xyz/distin
Site: distin.xyz

The thread walks the full coordination mechanism. The weaknesses are in it too.

---

## Images

Palette: deep eggplant-purple ground, warm gold ribbons, thin bright violet edge
accent, matte paper grain. Matches the Distin site (#8B5CF6 / #7C3AED / #a78bfa).

- `images/m01_one_account_five_chains.webp`: one gold ribbon fanning into five
  chains. Spine visual, one account, five destinations.
- `images/m02_empty_vault.webp`: a hollow gold vault frame holding nothing inside
  it. For the "no honeypot" posts (Piece 1, 5, 7).
- `images/m03_threshold_converge.webp`: many partials overlapping at a violet
  point into one signature. For mechanism / threshold posts (Piece 3, 9).
- Older thread assets `images/s01..s05` are SOUSUI-era (navy/cream/coral, and
  s01 is a literal sluice-gate water wheel from the dropped suiryu name). They
  are off-brand for Distin. Regenerate them in the purple/gold palette above or
  drop them before posting the thread.

---

## Operator note: weakest 2 pieces

1. **Piece 8 (coat-check analogy).** Analogies are the highest AI-smell risk and
   the easiest to over-cute. "A coat check that loses coats" lands, but the
   payoff line ("someone at the door able to vouch for you") strains the metaphor
   a little. If it reads clever-for-clever's-sake to you, cut Piece 8 entirely.
   The mechanism pieces carry the campaign without it.

2. **Piece 12 (quote-bait).** One-liners are where you either sound like a person
   or sound like a LinkedIn caption. "You were never bridging an asset, you were
   bridging authority" is the strongest line in the campaign or the most
   AI-poster-ish, depending on your ear. Read it out loud once. If it sounds like
   a keynote slide, use the alt or drop it.
