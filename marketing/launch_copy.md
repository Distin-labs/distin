# Distin launch copy (Crypto Twitter, builders)

Voice: dry, technical, confident. No em-dash, minimal emoji, no forced memes.
Every number and mechanism is real. The proof is a confirmed native Bitcoin
transaction the operator set threshold-signed.

Proof tx (Bitcoin testnet, confirmed):
https://mempool.space/testnet/tx/d8d46e3068f5f11133eb0be5e45d1ba400b1148e2001155ee9ad57337cfba7a1

---

## Pinned tweet

You can move native BTC from a Solana account. No bridge, no wrapped IOU.

A quorum of bonded operators threshold-signs the real Bitcoin transaction. The
group key never exists in one place, not at setup, not at signing.

Here is one, confirmed on-chain:
https://mempool.space/testnet/tx/d8d46e3068f5f11133eb0be5e45d1ba400b1148e2001155ee9ad57337cfba7a1

---

## Thread

1/
Bridges are the biggest honeypot in crypto. Over $2B drained, and the design is
the reason: lock your asset, mint an IOU, and now a contract holds the real
coins for everyone to attack.

Distin does not lock and does not mint.

2/
One Solana account threshold-signs a NATIVE transaction on any chain.

Your BTC stays BTC, on Bitcoin. Your ETH stays ETH, on Ethereum. No wrapped
token, no lock contract, nothing to drain.

3/
How it works. A quorum of bonded operators runs an MPC signing ceremony over
your transaction:

secp256k1 (GG20) for Bitcoin, Ethereum, Tron, Cosmos.
Ed25519 (FROST) for Aptos and SVM.

The group private key is never assembled in one place.

4/
Solana is the control plane, not the vault.

You post a signing intent as a single account. Operators are bonded with
slashable stake and coordinated on-chain, their weight priced live from Pyth. If
an operator misbehaves, the bond burns.

5/
This is not a diagram.

Here is a real, confirmed Bitcoin transaction the operator set signed. It spends
a UTXO from the group address, pays a recipient, and returns change. Bitcoin's
own consensus verified the witness.

https://mempool.space/testnet/tx/d8d46e3068f5f11133eb0be5e45d1ba400b1148e2001155ee9ad57337cfba7a1

6/
And you can check it yourself.

The signature is validated against Bitcoin's BIP-143 rules by a different
secp256k1 library than the one that produced it. cargo test in engine/kobe,
go test in engine/kobe-ecdsa. Clone it and watch a signature the group key never
assembled verify in under two minutes.

7/
Why it matters. Every cross-chain route you use today either wraps your asset or
trusts a bridge multisig. Here the thing you hold is the native coin, and the
thing that can fail is a bonded, slashable operator set, not a pot of locked
funds.

8/
Read the code, run the tests, sign something.

distin.xyz

---

## X Article / longform

### Cross-chain without the honeypot

Bridges have lost more money than almost anything else in this industry. The
number is past two billion dollars, and it keeps climbing, because the failure is
not a bug you patch. It is the design.

A bridge locks your asset on one chain and mints a claim on another. You stop
holding the coin and start holding an IOU, and a single contract now holds the
real coins for the entire network. That contract is the honeypot. Every large
bridge exploit has been some version of the same story: the wrapped-mint logic
or the multisig behind it gets broken, and the locked pool walks out the door.

Distin is built so there is no pool to walk.

### One account, native assets

The core idea is simple to state. One Solana account can authorize a native
transaction on any chain. Your Bitcoin stays Bitcoin, on Bitcoin. Your Ethereum
stays Ethereum, on Ethereum. Nothing is wrapped, nothing is locked in a bridge
contract, so there is nothing to drain.

What makes this possible is threshold signing. A quorum of operators jointly
controls one account on the target chain, but no single operator ever holds the
private key for it. When you want to move funds, the operators run a multi-party
signing ceremony over the real transaction and produce one valid signature. The
group key is never assembled in one place, not when the account is created and
not when it signs.

Under the hood there are two schemes, chosen per chain:

- GG20 threshold ECDSA over secp256k1, for Bitcoin, Ethereum, Tron, and Cosmos.
- FROST threshold Schnorr over Ed25519, for Aptos and SVM.

Both produce a signature that is byte-for-byte a normal, native signature on the
destination chain. A Bitcoin node cannot tell it apart from any other spend, and
that is the point.

### Solana as the control plane

Solana is where coordination happens, not where value sits. You post a signing
intent as a single account. The operator set is registered on-chain, each
operator bonded with slashable stake, its weight priced live from a Pyth feed. A
request finalizes only when enough distinct operators and enough staked weight
sign within the slot deadline. An operator that misbehaves can be slashed on
proof, so the security is economic and legible, not a promise.

This is the part that replaces the honeypot. In a bridge, the thing that can
fail is a contract holding everyone's locked funds. Here, the thing that can
fail is a bonded operator set that loses its stake for cheating. The native
coins were never pooled anywhere to begin with.

### The proof

None of this is a whitepaper diagram. The operator set signed a real Bitcoin
transaction and it confirmed on-chain:

https://mempool.space/testnet/tx/d8d46e3068f5f11133eb0be5e45d1ba400b1148e2001155ee9ad57337cfba7a1

It spends a UTXO the group controls, pays a recipient, and sends change back to
the group address. Bitcoin's own consensus rules validated the witness. The
signature was produced by the distributed operators, and the group private key
was never in one place at any point.

If you would rather not take a link's word for it, the repository ships the
tests. cargo test in engine/kobe reproduces a FROST Ed25519 signature an
independent verifier accepts. go test in engine/kobe-ecdsa reproduces the GG20
secp256k1 signature and checks it against Bitcoin's BIP-143 rules using a
different secp256k1 implementation than the one that made it. Clone the repo and
watch it happen in under two minutes.

### For builders

The interesting surface here is not a bridge UI. It is a neutral signing layer:
one on-chain account that can hold and move native assets across curves, with
the custody split across a bonded, slashable set and the coordination sitting on
Solana. If you have wanted cross-chain that does not mint a wrapper you did not
ask for, this is the shape of it.

Read the code, run the tests, and sign something.

distin.xyz
