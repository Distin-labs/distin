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

const requestPda = (protocol: PublicKey, nonce: bigint) => {
  const n = new Uint8Array(8);
  new DataView(n.buffer).setBigUint64(0, nonce, true);
  return PublicKey.findProgramAddressSync(
    [REQUEST_SEED, protocol.toBuffer(), n],
    PROGRAM_ID
  )[0];
};

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
): Promise<{ ix: TransactionInstruction; request: PublicKey; nonce: bigint }> {
  const protocol = protocolPda();
  const state = await readProtocol(conn);
  const nonce = state.requestNonce;
  const request = requestPda(protocol, nonce);

  const messageHash = await sha256(args.intent);

  // Borsh-style little-endian arg encoding, matching the program signature.
  const buf = new Uint8Array(8 + 1 + 1 + 8 + 32 + 2 + 8);
  let o = 0;
  buf.set(CREATE_REQUEST_DISC, o); o += 8;
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

  return { ix, request, nonce };
}

// Sign + send via the injected wallet, then confirm. Returns the tx signature.
export async function sendCreateRequest(
  conn: Connection,
  wallet: { publicKey: PublicKey; signTransaction: (t: Transaction) => Promise<Transaction> },
  args: IntentArgs
): Promise<{ signature: string; request: PublicKey }> {
  const { ix, request } = await buildCreateRequestIx(conn, wallet.publicKey, args);
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  const signed = await wallet.signTransaction(tx);
  const signature = await conn.sendRawTransaction(signed.serialize());
  await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return { signature, request };
}
