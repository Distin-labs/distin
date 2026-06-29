"use client";

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Layers, Wallet, ShieldCheck, Loader2, Check, Radio, Zap, ArrowDownRight, AlertTriangle } from "lucide-react";
import {
  RPC_URL, CLUSTER_LABEL, PROGRAM_ID,
  Scheme, TargetVm, readProtocol, sendCreateRequest, type ProtocolState,
} from "./distin";

// Chains map to the program's SignatureScheme / TargetVm enums.
const CHAINS = [
  { key: "bitcoin", name: "Bitcoin", curve: "secp256k1", scheme: "GG20 ECDSA", dot: "#f7931a", sample: "bc1qak9zl3xm7v2p0qd8sehua4rk0n6n9d3p2yq7lk", sig: Scheme.Gg20Secp256k1, vm: TargetVm.Bitcoin, chainId: 0n },
  { key: "ethereum", name: "Ethereum", curve: "secp256k1", scheme: "GG20 ECDSA", dot: "#8aa0e8", sample: "0x9f3aE12bC0d44eF77a1c0b88E2d5F3a91C7d4e02", sig: Scheme.Gg20Secp256k1, vm: TargetVm.Evm, chainId: 1n },
  { key: "tron", name: "Tron", curve: "secp256k1", scheme: "GG20 ECDSA", dot: "#e0746e", sample: "TQ5n8Wp3kJ2vQ7rL9mXa4Yb6Zc1Df0Eg2H", sig: Scheme.Gg20Secp256k1, vm: TargetVm.Tron, chainId: 0n },
  { key: "cosmos", name: "Cosmos", curve: "secp256k1", scheme: "GG20 ECDSA", dot: "#aab0cc", sample: "cosmos1p8a3v9k2m7q0xs4r6n1d5e8y2t7w3l9c0z4b", sig: Scheme.Gg20Secp256k1, vm: TargetVm.Cosmos, chainId: 0n },
  { key: "aptos", name: "Aptos", curve: "ed25519", scheme: "FROST", dot: "#5fd8c4", sample: "0x4a7c2e91d0f3b6a8c5e2147d9f0b3a6c8e1d4f7a0b2c5e8d1f4a7c0e3b6d9f2a", sig: Scheme.FrostEd25519, vm: TargetVm.Svm, chainId: 0n },
];

const mid = (s: string, l = 8, r = 6) => (s.length <= l + r + 1 ? s : `${s.slice(0, l)}…${s.slice(-r)}`);

type Row =
  | { kind: "intent"; id: string; chain: string; dot: string; dest: string; amt: string; sig: string }
  | { kind: "error"; id: string; msg: string };

const PALETTE: React.CSSProperties = {
  ["--bg" as any]: "#0d0f13",
  ["--bg2" as any]: "#161a20",
  ["--bg3" as any]: "#1f242c",
  ["--border" as any]: "#2c333d",
  ["--text" as any]: "#f3f5f9",
  ["--text2" as any]: "#c2cad6",
  ["--accent" as any]: "#84b4ff",
  ["--accent-soft" as any]: "rgba(132,180,255,0.14)",
  ["--accent-border" as any]: "rgba(132,180,255,0.42)",
  ["--warn" as any]: "#f0a35e",
  ["--warn-soft" as any]: "rgba(240,163,94,0.12)",
};

// Minimal shape of the injected wallet provider (Phantom / Solflare etc.).
type Provider = {
  isConnected?: boolean;
  publicKey?: { toString(): string; toBuffer(): Buffer } & PublicKey;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  signTransaction: (t: Transaction) => Promise<Transaction>;
};
const getProvider = (): Provider | undefined =>
  typeof window !== "undefined" ? (window as any)?.solana : undefined;

export default function Page() {
  const [selected, setSelected] = useState(0);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [running, setRunning] = useState(false);
  const [feed, setFeed] = useState<Row[]>([]);
  const [intents, setIntents] = useState(0);
  const [wallet, setWallet] = useState<string | null>(null);
  const [proto, setProto] = useState<ProtocolState | null>(null);
  const idRef = useRef(0);

  const conn = useMemo(() => new Connection(RPC_URL, "confirmed"), []);
  const chain = CHAINS[selected];
  const nextId = () => `r${idRef.current++}`;
  const pushRow = useCallback((row: Row) => {
    setFeed((f) => [row, ...f].slice(0, 60));
  }, []);

  // Read live protocol state from chain (operator count + request nonce).
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const s = await readProtocol(conn);
        if (live) setProto(s);
      } catch { /* RPC unreachable — surfaced in the status line */ }
    };
    load();
    const t = setInterval(load, 6000);
    return () => { live = false; clearInterval(t); };
  }, [conn]);

  useEffect(() => {
    const sol = getProvider();
    if (sol?.isConnected && sol.publicKey) setWallet(sol.publicKey.toString());
  }, []);

  const connect = useCallback(async () => {
    const sol = getProvider();
    if (!sol) { window.open("https://phantom.app/", "_blank"); return; }
    if (wallet) {
      try { await sol.disconnect(); } catch {}
      setWallet(null);
      return;
    }
    try {
      const res = await sol.connect();
      setWallet(res?.publicKey?.toString() ?? sol.publicKey?.toString() ?? null);
    } catch {}
  }, [wallet]);

  const ready = proto?.initialized && (proto?.operatorCount ?? 0) > 0;

  const preview = useMemo(() => {
    const bonded = proto ? Number(proto.totalBonded) / 1e9 : 0;
    const ops = proto?.operatorCount ?? 0;
    return `1-of-${ops || "—"} · ${chain.scheme} (${chain.curve}) · ${bonded.toFixed(2)} weight bonded`;
  }, [chain, proto]);

  // THE CORE USER ACTION: post a real cross-VM signing intent on-chain.
  const run = useCallback(async () => {
    if (running) return;
    const sol = getProvider();
    if (!sol || !wallet) { await connect(); return; }
    if (!ready) {
      pushRow({ kind: "error", id: nextId(), msg: "Protocol has no active operators yet. Run the localnet bootstrap." });
      return;
    }
    setRunning(true);
    const c = CHAINS[selected];
    const dest = destination.trim() || c.sample;
    const amt = (amount.trim() || "0.50").replace(/[^0-9.]/g, "") || "0.50";
    try {
      const { signature } = await sendCreateRequest(
        conn,
        { publicKey: new PublicKey(wallet), signTransaction: (t) => sol.signTransaction(t) },
        {
          scheme: c.sig,
          targetVm: c.vm,
          targetChainId: c.chainId,
          intent: `${amt} ${c.name} -> ${dest}`,
          threshold: 1,
          validitySlots: 1000n,
        }
      );
      pushRow({ kind: "intent", id: nextId(), chain: c.name, dot: c.dot, dest, amt, sig: signature });
      setIntents((v) => v + 1);
      setProto(await readProtocol(conn));
    } catch (e: any) {
      pushRow({ kind: "error", id: nextId(), msg: e?.message ?? "Transaction failed." });
    } finally {
      setRunning(false);
    }
  }, [running, wallet, ready, selected, destination, amount, conn, connect, pushRow]);

  const wrap: React.CSSProperties = { minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" };
  const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

  const rowShell: React.CSSProperties = {
    border: "1px solid var(--border)", background: "var(--bg3)", borderRadius: 12,
    padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6, minWidth: 0,
  };
  const rowHead: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700, color: "var(--text)", minWidth: 0,
  };
  const rowMeta: React.CSSProperties = { fontSize: 18, color: "var(--text2)", fontFamily: mono, ...wrap };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", overflowX: "hidden", ...PALETTE }}>
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px", borderBottom: "1px solid var(--border)",
          maxWidth: 1100, margin: "0 auto", gap: 12, flexWrap: "wrap", boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <img src="/logo.png" alt="Distin" width={40} height={40} style={{ width: 40, height: 40, flex: "0 0 auto", borderRadius: 12, objectFit: "cover" }} />
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>Distin</span>
        </div>

        <button
          id="connect"
          onClick={connect}
          style={{
            display: "flex", alignItems: "center", gap: 9,
            background: wallet ? "var(--accent-soft)" : "var(--bg3)",
            border: `1px solid ${wallet ? "var(--accent-border)" : "var(--border)"}`,
            color: "var(--text)", fontSize: 18, fontWeight: 600, fontFamily: mono,
            padding: "11px 16px", borderRadius: 999, cursor: "pointer", flex: "0 0 auto", transition: "all 0.18s ease",
          }}
        >
          <Wallet size={18} />
          {wallet ? mid(wallet, 4, 4) : "Connect Wallet"}
        </button>
      </header>

      <section style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px 80px", boxSizing: "border-box" }}>
        <div
          style={{
            background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 18,
            padding: 24, boxSizing: "border-box",
            boxShadow: "0 1px 0 rgba(255,255,255,0.02) inset, 0 24px 60px -40px rgba(0,0,0,0.9)",
          }}
        >
          <div style={{ fontSize: 19, color: "var(--text2)", marginBottom: 18, lineHeight: 1.5 }}>
            One Solana account threshold-signs a native asset on any chain. No bridge, no wrapped IOU.
          </div>

          {/* Chain pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginBottom: 20 }}>
            {CHAINS.map((c, i) => {
              const on = i === selected;
              return (
                <button
                  key={c.key}
                  onClick={() => setSelected(i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: on ? "var(--accent-soft)" : "var(--bg3)",
                    border: `1px solid ${on ? "var(--accent-border)" : "var(--border)"}`,
                    color: on ? "var(--text)" : "var(--text2)",
                    fontSize: 18, fontWeight: 600, padding: "9px 14px", borderRadius: 999, cursor: "pointer", transition: "all 0.16s ease",
                  }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: c.dot, display: "inline-block", flex: "0 0 auto" }} />
                  {c.name}
                </button>
              );
            })}
          </div>

          <label style={{ fontSize: 18, color: "var(--text2)", display: "block", marginBottom: 8 }}>Destination address</label>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder={chain.sample}
            spellCheck={false}
            style={{ marginBottom: 16, width: "100%", boxSizing: "border-box", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 18, fontFamily: mono, padding: "12px 14px", outline: "none" }}
          />

          <label style={{ fontSize: 18, color: "var(--text2)", display: "block", marginBottom: 8 }}>Amount ({chain.name})</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.50"
            inputMode="decimal"
            style={{ marginBottom: 16, width: "100%", boxSizing: "border-box", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 18, fontFamily: mono, padding: "12px 14px", outline: "none" }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 18, color: "var(--text2)", fontFamily: mono, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 18 }}>
            <ShieldCheck size={18} color="var(--accent)" style={{ flex: "0 0 auto" }} />
            <span style={{ ...wrap }}>{preview}</span>
          </div>

          {proto && !ready && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 18, color: "var(--text)", background: "var(--warn-soft)", border: "1px solid var(--warn)", borderRadius: 12, padding: "12px 14px", marginBottom: 18 }}>
              <AlertTriangle size={18} color="var(--warn)" style={{ flex: "0 0 auto" }} />
              <span style={{ ...wrap }}>
                {proto.initialized ? "No active operators bonded yet." : "Protocol not initialized on this RPC."}
              </span>
            </div>
          )}

          <button
            id="action"
            onClick={run}
            disabled={running}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              background: running ? "var(--bg3)" : "var(--accent)",
              color: running ? "var(--text2)" : "#0a0f1a",
              border: "none", fontSize: 20, fontWeight: 800, padding: "16px 18px", borderRadius: 14,
              cursor: running ? "default" : "pointer", boxSizing: "border-box", transition: "all 0.18s ease",
            }}
          >
            {running ? <Loader2 size={20} style={{ animation: "spin 0.9s linear infinite" }} /> : <Zap size={20} />}
            <span style={wrap}>
              {running ? "Posting signing intent on-chain" : wallet ? "Request threshold signature" : "Connect wallet to sign"}
            </span>
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 24 }}>
          {[
            { label: "Intents posted", value: intents },
            { label: "Active operators", value: proto?.operatorCount ?? 0 },
            { label: "On-chain nonce", value: proto ? Number(proto.requestNonce) : 0 },
          ].map((s) => (
            <div key={s.label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 14px", minWidth: 0, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: mono, color: "var(--text)" }}>{s.value}</div>
              <div style={{ fontSize: 18, color: "var(--text2)", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Feed */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 28, marginBottom: 12 }}>
          <Radio size={18} color="var(--accent)" style={{ flex: "0 0 auto" }} />
          <span style={{ fontSize: 19, fontWeight: 700 }}>Signing intents</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          {feed.length === 0 && (
            <div style={{ border: "1px dashed var(--border)", background: "var(--bg2)", borderRadius: 12, padding: "20px 16px", fontSize: 18, color: "var(--text2)", textAlign: "center" }}>
              Request a threshold signature to post your first on-chain intent.
            </div>
          )}

          <AnimatePresence initial={false}>
            {feed.map((r) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: "easeOut" }} style={rowShell}>
                {r.kind === "intent" && (
                  <>
                    <div style={rowHead}>
                      <ArrowDownRight size={18} color="var(--accent)" style={{ flex: "0 0 auto" }} />
                      <span style={{ ...wrap }}>Intent posted</span>
                      <span style={{ width: 9, height: 9, borderRadius: 999, background: r.dot, display: "inline-block", flex: "0 0 auto" }} />
                      <span style={{ color: "var(--text2)", fontWeight: 600, ...wrap }}>{r.chain}</span>
                      <Check size={16} color="var(--accent)" style={{ flex: "0 0 auto" }} />
                    </div>
                    <div style={rowMeta}>{r.amt} → {mid(r.dest)}</div>
                    <div style={rowMeta}>tx {mid(r.sig, 8, 8)}</div>
                  </>
                )}
                {r.kind === "error" && (
                  <>
                    <div style={{ ...rowHead, color: "var(--warn)" }}>
                      <AlertTriangle size={18} color="var(--warn)" style={{ flex: "0 0 auto" }} />
                      <span style={{ ...wrap }}>Rejected</span>
                    </div>
                    <div style={rowMeta}>{r.msg}</div>
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div style={{ marginTop: 22, fontSize: 18, color: "var(--text2)", fontFamily: mono, ...wrap }}>
          {CLUSTER_LABEL} · coordinator {mid(PROGRAM_ID.toBase58(), 6, 6)}
        </div>
      </section>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
