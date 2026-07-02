// On-chain client for the Distin threshold-signature coordinator.
//
// The ONE core user action is `create_signing_request`: a single Solana account
// posts a cross-VM signing intent that the bonded operator set then fulfils.
// This module builds that instruction with raw @solana/web3.js (no anchor client
// in the browser) and derives PDAs with the exact seeds the on-chain program uses.

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

// --- Deployment config (env-overridable for devnet/mainnet shipping) ---
// Public deploy points at devnet so the wallet connects to a real network.
// The coordinator program ships to devnet as a separate operator step; until
// then readProtocol() reports uninitialized and the UI says so honestly.
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ??
    "4xy9dYHfAzi7cAcX5JHxNR6EoMJ9PGfeQDMHx6YUQQM6"
);
export const CLUSTER_LABEL = process.env.NEXT_PUBLIC_CLUSTER ?? "devnet";

// Anchor discriminator: first 8 bytes of sha256("global:create_signing_request").
const CREATE_REQUEST_DISC = new Uint8Array([81, 124, 188, 129, 112, 241, 32, 39]);

const PROTOCOL_SEED = new TextEncoder().encode("protocol");
const REQUEST_SEED = new TextEncoder().encode("request");

// SignatureScheme enum (program order).
export enum Scheme {
  FrostEd25519 = 0,
  Gg20Secp256k1 = 1,
}
// TargetVm enum (program order).
export enum TargetVm {
  Svm = 0,
  Evm = 1,
  Tron = 2,
  Cosmos = 3,
  Bitcoin = 4,
}

export const protocolPda = () =>
  PublicKey.findProgramAddressSync([PROTOCOL_SEED], PROGRAM_ID)[0];

// request_nonce offset inside the Protocol account data (after the 8-byte disc):
// admin 32 + pending_admin 32 + bond_mint 32 + bond_vault 32 + slash_pool 32
// + lst_price_feed 32 + threshold_bps 2 + min_bond 8 + unbonding_slots 8
// + request_fee 8 + max_validity_slots 8 + operator_count 4 + total_bonded 8.
const NONCE_OFFSET = 8 + 32 * 6 + 2 + 8 * 4 + 4 + 8;

export type ProtocolState = {
  initialized: boolean;
  operatorCount: number;
  requestNonce: bigint;
  totalBonded: bigint;
};

// SigningRequest account: status byte then the 64-byte threshold signature.
const REQ_SIG_OFFSET = 8 + 32 + 32 + 8 + 1 + 1 + 8 + 32 + 2 + 2 + 8 + 8 + 8 + 8 + 1;

export type RequestResult = { signed: boolean; signatureHex: string | null };

// Read what the bonded operators wrote back: a request is "signed" once a
// non-zero threshold signature is recorded on-chain.
export async function readRequest(conn: Connection, request: PublicKey): Promise<RequestResult> {
  const info = await conn.getAccountInfo(request);
  if (!info) return { signed: false, signatureHex: null };
  const sig = info.data.subarray(REQ_SIG_OFFSET, REQ_SIG_OFFSET + 64);
  const signed = sig.some((x) => x !== 0);
  return {
    signed,
    signatureHex: signed
      ? Array.from(sig).map((x) => x.toString(16).padStart(2, "0")).join("")
      : null,
  };
}

export async function readProtocol(conn: Connection): Promise<ProtocolState> {
  const info = await conn.getAccountInfo(protocolPda());
  if (!info) {
    return { initialized: false, operatorCount: 0, requestNonce: 0n, totalBonded: 0n };
  }
  const dv = new DataView(info.data.buffer, info.data.byteOffset, info.data.byteLength);
  const opCountOff = 8 + 32 * 6 + 2 + 8 * 4;
  return {
    initialized: true,
    operatorCount: dv.getUint32(opCountOff, true),
    totalBonded: dv.getBigUint64(opCountOff + 4, true),
    requestNonce: dv.getBigUint64(NONCE_OFFSET, true),
  };
}

async function sha256(input: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(input);
  const buf = new ArrayBuffer(data.byteLength);
  new Uint8Array(buf).set(data);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(digest);
}

export type IntentArgs = {
  scheme: Scheme;
  targetVm: TargetVm;
  targetChainId: bigint;
  // human-readable intent ("0.5 BTC -> bc1q...") hashed to the 32-byte message.
  intent: string;
  threshold: number;
  validitySlots: bigint;
};

// Build the create_signing_request instruction for the connected wallet.
export async function buildCreateRequestIx(
  conn: Connection,
  requester: PublicKey,
  args: IntentArgs
): Promise<{ ix: TransactionInstruction; request: PublicKey }> {
  const protocol = protocolPda();

  // A client-chosen random nonce fully determines the request PDA (seeded by
  // requester + this nonce), so the address never depends on a global counter —
  // which removes the race that made wallet pre-flight simulation fail.
  const cnLE = crypto.getRandomValues(new Uint8Array(8));
  const request = PublicKey.findProgramAddressSync(
    [REQUEST_SEED, requester.toBuffer(), cnLE],
    PROGRAM_ID
  )[0];

  const messageHash = await sha256(args.intent);

  // Borsh-style little-endian arg encoding (client_nonce is the FIRST arg).
  const buf = new Uint8Array(8 + 8 + 1 + 1 + 8 + 32 + 2 + 8);
  let o = 0;
  buf.set(CREATE_REQUEST_DISC, o); o += 8;
  buf.set(cnLE, o); o += 8;
  buf[o++] = args.scheme;
  buf[o++] = args.targetVm;
  new DataView(buf.buffer).setBigUint64(o, args.targetChainId, true); o += 8;
  buf.set(messageHash, o); o += 32;
  new DataView(buf.buffer).setUint16(o, args.threshold, true); o += 2;
  new DataView(buf.buffer).setBigUint64(o, args.validitySlots, true); o += 8;

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: requester, isSigner: true, isWritable: true },
      { pubkey: protocol, isSigner: false, isWritable: true },
      { pubkey: request, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(buf),
  });

  return { ix, request };
}

// Sign + send via the injected wallet, then confirm. Returns the tx signature.
// The request PDA is derived from the protocol's global nonce; if another
// request lands in the window between build and send, that nonce goes stale and
// the tx (and its wallet-side simulation) fails. So we build against the very
// latest nonce and retry once with a fresh one, which clears any such race.
export async function sendCreateRequest(
  conn: Connection,
  wallet: { publicKey: PublicKey; signTransaction: (t: Transaction) => Promise<Transaction> },
  args: IntentArgs
): Promise<{ signature: string; request: PublicKey }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { ix, request } = await buildCreateRequestIx(conn, wallet.publicKey, args);
    const tx = new Transaction().add(ix);
    tx.feePayer = wallet.publicKey;
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    try {
      const signed = await wallet.signTransaction(tx);
      const signature = await conn.sendRawTransaction(signed.serialize());
      await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      return { signature, request };
    } catch (e) {
      lastErr = e;
      // Only retry a stale-nonce collision (request PDA already in use); a user
      // rejection or any other error should surface immediately.
      const msg = String((e as any)?.message ?? e);
      if (!/already in use|custom program error|0x0|simulat/i.test(msg)) throw e;
    }
  }
  throw lastErr;
}
