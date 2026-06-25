"use client"

import { useEffect, useRef, useState } from "react"
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useInView,
  useMotionValue,
  animate,
} from "framer-motion"
import { AtSign, MessageCircle, Globe, Plus, Minus, ArrowRight, ArrowUpRight, Wallet } from "lucide-react"
import dynamic from "next/dynamic"

const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false })
const BgScene = dynamic(() => import("./BgScene"), { ssr: false })

// Mount heavy WebGL only after the browser is idle, so the 3D boot stays out
// of the initial load / time-to-interactive window. 3D quality is untouched.
function DeferredMount({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }
    const ric = w.requestIdleCallback
    if (ric) {
      const id = ric(() => setReady(true), { timeout: 2500 })
      return () => (w.cancelIdleCallback ?? clearTimeout)(id as number)
    }
    const t = setTimeout(() => setReady(true), 1200)
    return () => clearTimeout(t)
  }, [])
  return ready ? <>{children}</> : null
}

const ACCENT = "#8B5CF6"
const ACCENT_BTN = "#7C3AED" // deeper accent for white-on-fill (WCAG AA: 5.7:1)
const ACCENT_TEXT = "#a78bfa" // lighter accent for small text on dark surfaces
const BG = "#060606"
const SURFACE = "#0d0d0d"
const LINE = "rgba(255,255,255,0.08)"
const MUTED = "rgba(255,255,255,0.62)"
const MONO = '"SFMono-Regular", ui-monospace, "JetBrains Mono", Menlo, monospace'

const features = [
  {
    img: "/feature_1.png",
    title: "Native settlement",
    body: "Liquidity stays on Solana from order to fill. No wrapped assets, no custodial relays, no waiting on an external chain to acknowledge.",
  },
  {
    img: "/feature_2.png",
    title: "Single-block routing",
    body: "Routes resolve inside one block. What you quote is what you settle, with no second transaction to bridge the gap.",
  },
  {
    img: "/feature_3.png",
    title: "Verifiable reserves",
    body: "Every pool publishes its state on-chain. Balances are readable by anyone, at any time, without trusting an off-chain attestation.",
  },
  {
    img: "/feature_4.png",
    title: "Program-owned vaults",
    body: "Funds sit in program-derived accounts the team cannot unilaterally move. Authority is code, not a multisig promise.",
  },
]

const comparison = [
  ["Asset movement", "Locked, minted, redeemed across chains", "Stays native on Solana"],
  ["Settlement time", "Minutes, gated by external finality", "One Solana block"],
  ["Trust surface", "Bridge validators and relayers", "On-chain program only"],
  ["Failure mode", "Stranded wrapped assets", "Transaction simply reverts"],
]

const faqs = [
  {
    q: "What does Distin replace?",
    a: "The cross-chain bridge. Distin keeps liquidity native to Solana and settles routes inside a single block, so there is no lock-and-mint step to compromise.",
  },
  {
    q: "Where do funds actually sit?",
    a: "In program-derived vault accounts. The controlling authority is the program itself, so balances cannot be moved by an off-chain key.",
  },
  {
    q: "How is reserve state verified?",
    a: "Each pool writes its full state on-chain. Anyone can read balances directly from the cluster without relying on a third-party attestation.",
  },
  {
    q: "Is there a token?",
    a: "No token is live. Distin is the settlement engine first. Any future asset would be announced on-chain, never implied here.",
  },
]

const css = `
.wrap { max-width: 1360px; margin: 0 auto; padding: 0 48px; }
.wrap-wide { max-width: 1760px; margin: 0 auto; padding: 0 48px; }
.hero-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
.hero-foot { display: grid; grid-template-columns: 1fr 300px; align-items: end; gap: 64px; }

.metrics { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; }
.metric-cell { padding: 64px 44px 56px; position: relative; }

.sec-head { display: grid; grid-template-columns: 1fr 1fr; align-items: end; gap: 48px; }

.manifesto-grid { display: grid; grid-template-columns: 320px 1fr; gap: 80px; align-items: start; }

.cmp-row { display: grid; grid-template-columns: 1.3fr 1fr 1fr; }

.feature-row { display: grid; grid-template-columns: 7fr 5fr; gap: 72px; align-items: center; }
.feature-row.flip .feature-media { order: 2; }
.feature-row.flip .feature-copy { order: 1; }

.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; }

@media (max-width: 980px) {
  .wrap, .wrap-wide { padding: 0 22px; }
  .hero-foot { grid-template-columns: 1fr; gap: 28px; }
  .metrics { grid-template-columns: repeat(2, 1fr); }
  .metric-cell { padding: 40px 26px; }
  .sec-head { grid-template-columns: 1fr; gap: 24px; }
  .manifesto-grid { grid-template-columns: 1fr; gap: 28px; }
  .cmp-row { grid-template-columns: 1fr; }
  .feature-row { grid-template-columns: 1fr; gap: 28px; }
  .feature-row.flip .feature-media { order: 0; }
  .feature-row.flip .feature-copy { order: 0; }
  .stats-grid { grid-template-columns: 1fr; }
}
`

function Label({ children, color = MUTED }: { children: React.ReactNode; color?: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 13,
        fontFamily: MONO,
        fontSize: 18,
        textTransform: "uppercase",
        letterSpacing: "0.09em",
        color,
      }}
    >
      <span style={{ width: 9, height: 9, background: ACCENT, borderRadius: "50%", flexShrink: 0 }} />
      {children}
    </div>
  )
}

function Index({ n }: { n: string }) {
  return (
    <span
      aria-hidden
      style={{
        fontFamily: MONO,
        fontSize: 18,
        letterSpacing: "0.12em",
        color: ACCENT,
      }}
    >
      {n}
    </span>
  )
}

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })
  const value = useMotionValue(0)
  const [display, setDisplay] = useState("0")

  useEffect(() => {
    if (!inView) return
    const controls = animate(value, to, {
      duration: 1.6,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v).toLocaleString()),
    })
    return () => controls.stop()
  }, [inView, to, value])

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  )
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

export default function Home() {
  const heroRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] })
  const glowY = useTransform(scrollYProgress, [0, 1], [0, 180])
  const glowOpacity = useTransform(scrollYProgress, [0, 1], [0.55, 0])
  const heroTextY = useTransform(scrollYProgress, [0, 1], [0, -60])
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  // Pre-launch CTA: Solana wallet login (Phantom). The app itself stays gated
  // until launch — these buttons connect a wallet instead of opening /app.
  const [wallet, setWallet] = useState<string | null>(null)
  const shortAddr = (s: string) => (s.length > 9 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s)
  useEffect(() => {
    const sol = typeof window !== "undefined" ? (window as any).solana : undefined
    if (sol?.isConnected && sol.publicKey) setWallet(sol.publicKey.toString())
  }, [])
  const connectWallet = async () => {
    const sol = typeof window !== "undefined" ? (window as any).solana : undefined
    if (!sol) { window.open("https://phantom.app/", "_blank"); return }
    if (wallet) { try { await sol.disconnect() } catch {} setWallet(null); return }
    try {
      const res = await sol.connect()
      setWallet(res?.publicKey?.toString() ?? sol.publicKey?.toString() ?? null)
    } catch {}
  }

  return (
    <main style={{ background: BG, color: "#fff", fontSize: 18, lineHeight: 1.5, width: "100%", overflowX: "hidden" }}>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* Fixed 3D background (deferred to idle; instant gradient poster underneath) */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background:
            "radial-gradient(120% 90% at 50% 110%, rgba(139,92,246,0.16) 0%, transparent 55%), #060606",
        }}
      >
        <DeferredMount>
          <BgScene />
        </DeferredMount>
      </div>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: "radial-gradient(ellipse 90% 80% at 30% 70%, #060606cc 0%, transparent 60%)",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
      {/* Nav */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 28px",
          margin: 20,
          border: `1px solid ${LINE}`,
          background: "rgba(6,6,6,0.66)",
          backdropFilter: "blur(14px)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 11 }}>
          <img src="/logo.png" alt="Distin" width={34} height={34} style={{ width: 34, height: 34, borderRadius: 9, flex: "0 0 auto" }} />
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.02em" }}>Distin</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <a href="/docs" style={{ color: MUTED, fontSize: 18, textDecoration: "none" }}>
            Docs
          </a>
          <button
            onClick={connectWallet}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 22px",
              background: ACCENT_BTN,
              color: "#fff",
              fontSize: 18,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <Wallet size={18} />
            {wallet ? shortAddr(wallet) : "Connect Wallet"}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section ref={heroRef} style={{ position: "relative", height: "100vh", minHeight: 720, overflow: "hidden" }}>
        {/* instant poster (matches the dark 3D rest frame) under the deferred WebGL */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(60% 55% at 72% 58%, rgba(139,92,246,0.22) 0%, transparent 60%), #060606",
          }}
        />
        <div style={{ position: "absolute", inset: 0 }}>
          <DeferredMount>
            <HeroScene />
          </DeferredMount>
        </div>
        <motion.div
          style={{
            position: "absolute",
            left: "4%",
            top: "44%",
            width: 680,
            height: 680,
            y: glowY,
            opacity: glowOpacity,
            background: `radial-gradient(circle, ${ACCENT}4d 0%, transparent 66%)`,
            pointerEvents: "none",
          }}
        />
        {/* bottom legibility gradient */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(6,6,6,0.94) 0%, rgba(6,6,6,0.22) 42%, transparent 66%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 10,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div className="wrap-wide" style={{ paddingTop: 132 }}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="hero-top"
            >
              <Label color="#fff">No bridge — Solana native settlement</Label>
              <span style={{ fontFamily: MONO, fontSize: 18, color: MUTED, letterSpacing: "0.06em" }}>
                / Settlement engine
              </span>
            </motion.div>
          </div>

          <motion.div className="wrap-wide" style={{ paddingBottom: 72, y: heroTextY }}>
            <div className="hero-foot">
              <h1
                className="hero-h1"
                style={{
                  fontSize: "clamp(64px, 14vw, 232px)",
                  fontWeight: 800,
                  lineHeight: 0.86,
                  letterSpacing: "-0.05em",
                  margin: 0,
                }}
              >
                Liquidity,
                <br />
                settled{" "}
                <span
                  style={{
                    background: `linear-gradient(95deg, ${ACCENT}, #c9b3ff)`,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  native.
                </span>
              </h1>
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.35 }}
                style={{ paddingBottom: 14, borderLeft: `1px solid ${LINE}`, paddingLeft: 28 }}
              >
                <p style={{ fontSize: 20, color: MUTED, margin: "0 0 30px", lineHeight: 1.55 }}>
                  Distin keeps assets on Solana from quote to fill and settles every route inside a
                  single block. The bridge, and everything that breaks with it, is gone.
                </p>
                <button
                  onClick={connectWallet}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "16px 34px",
                    background: ACCENT_BTN,
                    color: "#fff",
                    fontSize: 19,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <Wallet size={20} />
                  {wallet ? shortAddr(wallet) : "Connect Wallet"}
                </button>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Metric band */}
      <section style={{ borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, background: SURFACE }}>
        <div className="metrics">
          {[
            { label: "Settlement window", value: <span>1 block</span> },
            { label: "Bridges in the path", value: <Counter to={0} /> },
            { label: "Routes resolved on-chain", value: <Counter to={100} suffix="%" /> },
            { label: "Custodial relays", value: <Counter to={0} /> },
          ].map((m, i) => (
            <div
              key={i}
              className="metric-cell"
              style={{ borderRight: i < 3 ? `1px solid ${LINE}` : "none", background: i === 0 ? "rgba(139,92,246,0.06)" : "transparent" }}
            >
              <div style={{ fontFamily: MONO, fontSize: 18, color: MUTED, letterSpacing: "0.06em", marginBottom: 30 }}>
                0{i + 1}
              </div>
              <div
                style={{
                  fontSize: i === 0 ? "clamp(56px, 7.5vw, 112px)" : "clamp(44px, 5.5vw, 80px)",
                  fontWeight: 800,
                  letterSpacing: "-0.035em",
                  color: ACCENT,
                  lineHeight: 0.95,
                }}
              >
                {m.value}
              </div>
              <div style={{ marginTop: 18, fontFamily: MONO, fontSize: 18, color: MUTED, letterSpacing: "0.04em" }}>
                {m.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Manifesto */}
      <section style={{ padding: "200px 0 160px" }}>
        <div className="wrap">
          <div className="manifesto-grid">
            <Reveal>
              <div style={{ position: "sticky", top: 120 }}>
                <Label>The premise</Label>
                <div
                  aria-hidden
                  style={{
                    marginTop: 32,
                    fontSize: "clamp(120px, 16vw, 240px)",
                    fontWeight: 800,
                    lineHeight: 0.8,
                    letterSpacing: "-0.05em",
                    color: "transparent",
                    WebkitTextStroke: `1px ${LINE}`,
                  }}
                >
                  01
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <p
                style={{
                  fontSize: "clamp(30px, 4vw, 58px)",
                  fontWeight: 600,
                  lineHeight: 1.22,
                  letterSpacing: "-0.025em",
                  margin: 0,
                }}
              >
                Every bridge is a promise that someone, somewhere, is still holding your asset.{" "}
                <span style={{ color: ACCENT }}>Distin removes the promise.</span> Liquidity never
                leaves the chain it was minted on, settlement never waits on an outside validator, and
                the only thing you trust is the program you can read.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section style={{ padding: "0 0 200px" }}>
        <div className="wrap">
          <Reveal>
            <div className="sec-head" style={{ marginBottom: 56 }}>
              <div>
                <div style={{ marginBottom: 22 }}>
                  <Index n="02 / Side by side" />
                </div>
                <h2
                  style={{
                    fontSize: "clamp(44px, 7vw, 104px)",
                    fontWeight: 800,
                    letterSpacing: "-0.04em",
                    lineHeight: 0.94,
                    margin: 0,
                  }}
                >
                  Bridged DeFi
                  <br />
                  vs <span style={{ color: ACCENT }}>native.</span>
                </h2>
              </div>
              <p style={{ fontSize: 20, color: MUTED, margin: 0, maxWidth: 420, justifySelf: "end" }}>
                The difference is not a feature list. It is where your asset lives and who can move it
                while a trade is in flight.
              </p>
            </div>
          </Reveal>
          <div style={{ border: `1px solid ${LINE}`, background: SURFACE }}>
            <div className="cmp-row" style={{ borderBottom: `1px solid ${LINE}`, fontFamily: MONO, fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              <div style={{ padding: "26px 32px", color: MUTED }}>Dimension</div>
              <div style={{ padding: "26px 32px", color: MUTED, borderLeft: `1px solid ${LINE}` }}>
                Bridged DeFi
              </div>
              <div
                style={{
                  padding: "26px 32px",
                  color: ACCENT_TEXT,
                  borderLeft: `1px solid ${LINE}`,
                  background: "rgba(139,92,246,0.1)",
                }}
              >
                Distin
              </div>
            </div>
            {comparison.map((row, i) => (
              <Reveal key={i} delay={i * 0.05}>
                <div
                  className="cmp-row"
                  style={{ borderBottom: i < comparison.length - 1 ? `1px solid ${LINE}` : "none", fontSize: 20 }}
                >
                  <div style={{ padding: "30px 32px", fontWeight: 600 }}>{row[0]}</div>
                  <div style={{ padding: "30px 32px", color: MUTED, borderLeft: `1px solid ${LINE}` }}>
                    {row[1]}
                  </div>
                  <div
                    style={{
                      padding: "30px 32px",
                      borderLeft: `1px solid ${LINE}`,
                      background: "rgba(139,92,246,0.1)",
                      fontWeight: 600,
                    }}
                  >
                    {row[2]}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ position: "relative", padding: "150px 0 220px", overflow: "hidden", borderTop: `1px solid ${LINE}` }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url(/bg_features.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.1,
            pointerEvents: "none",
          }}
        />
        <div className="wrap-wide" style={{ position: "relative" }}>
          <Reveal>
            <div style={{ marginBottom: 110, maxWidth: 1000 }}>
              <div style={{ marginBottom: 24 }}>
                <Index n="03 / Architecture" />
              </div>
              <h2
                style={{
                  fontSize: "clamp(44px, 7vw, 120px)",
                  fontWeight: 800,
                  letterSpacing: "-0.045em",
                  lineHeight: 0.9,
                  margin: 0,
                }}
              >
                Built without a
                <br />
                bridge in the path.
              </h2>
            </div>
          </Reveal>

          <div style={{ display: "flex", flexDirection: "column", gap: 130 }}>
            {features.map((f, i) => {
              const flip = i % 2 === 1
              return (
                <Reveal key={i}>
                  <div className={`feature-row${flip ? " flip" : ""}`}>
                    <div className="feature-media" style={{ position: "relative" }}>
                      <motion.div
                        whileHover={{ scale: 1.015 }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                          position: "relative",
                          height: "clamp(300px, 38vw, 520px)",
                          overflow: "hidden",
                          border: `1px solid ${LINE}`,
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            backgroundImage: `url(${f.img})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            animation: "kenburns 16s ease-in-out infinite alternate",
                          }}
                        />
                        <div
                          aria-hidden
                          style={{
                            position: "absolute",
                            top: 0,
                            [flip ? "right" : "left"]: 0,
                            padding: "20px 28px",
                            fontSize: "clamp(56px, 7vw, 104px)",
                            fontWeight: 800,
                            letterSpacing: "-0.04em",
                            lineHeight: 1,
                            color: "transparent",
                            WebkitTextStroke: "1px rgba(255,255,255,0.45)",
                          }}
                        >
                          0{i + 1}
                        </div>
                      </motion.div>
                    </div>
                    <div className="feature-copy">
                      <h3
                        style={{
                          fontSize: "clamp(32px, 3.6vw, 52px)",
                          fontWeight: 700,
                          margin: "0 0 22px",
                          letterSpacing: "-0.03em",
                          lineHeight: 1.02,
                        }}
                      >
                        {f.title}
                      </h3>
                      <p style={{ fontSize: 20, color: MUTED, margin: 0, maxWidth: 440, lineHeight: 1.55 }}>
                        {f.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section
        style={{
          position: "relative",
          padding: "0",
          backgroundImage: "url(/bg_stats.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "rgba(6,6,6,0.86)" }} />
        <div style={{ position: "relative", borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
          <div className="stats-grid">
            {[
              { to: 1, suffix: " block", label: "to final settlement" },
              { to: 100, suffix: "%", label: "of state read on-chain" },
              { to: 0, suffix: "", label: "external relayers" },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div
                  style={{
                    padding: "120px 48px",
                    borderLeft: i > 0 ? `1px solid ${LINE}` : "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: "clamp(60px, 9vw, 128px)",
                      fontWeight: 800,
                      letterSpacing: "-0.045em",
                      lineHeight: 0.92,
                      color: ACCENT,
                    }}
                  >
                    <Counter to={s.to} suffix={s.suffix} />
                  </div>
                  <div style={{ marginTop: 20, fontSize: 20, color: MUTED }}>{s.label}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: "200px 0 160px" }}>
        <div className="wrap">
          <div className="manifesto-grid">
            <Reveal>
              <div style={{ position: "sticky", top: 120 }}>
                <div style={{ marginBottom: 22 }}>
                  <Index n="04 / Answers" />
                </div>
                <h2
                  style={{
                    fontSize: "clamp(40px, 4.2vw, 58px)",
                    fontWeight: 800,
                    letterSpacing: "-0.04em",
                    lineHeight: 0.95,
                    margin: 0,
                  }}
                >
                  Questions.
                </h2>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <div style={{ borderTop: `1px solid ${LINE}` }}>
                {faqs.map((f, i) => {
                  const open = openFaq === i
                  return (
                    <div key={i} style={{ borderBottom: `1px solid ${LINE}` }}>
                      <button
                        onClick={() => setOpenFaq(open ? null : i)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 16,
                          padding: "34px 4px",
                          background: "transparent",
                          border: "none",
                          color: "#fff",
                          fontSize: "clamp(22px, 2.6vw, 32px)",
                          fontWeight: 600,
                          letterSpacing: "-0.015em",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        {f.q}
                        {open ? <Minus size={26} color={ACCENT} /> : <Plus size={26} color={ACCENT} />}
                      </button>
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            style={{ overflow: "hidden" }}
                          >
                            <p style={{ margin: 0, padding: "0 4px 34px", fontSize: 20, color: MUTED, maxWidth: 640, lineHeight: 1.55 }}>
                              {f.a}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ position: "relative", padding: "220px 0 200px", overflow: "hidden", borderTop: `1px solid ${LINE}` }}>
        <video
          autoPlay
          muted
          loop
          playsInline
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.32 }}
        >
          <source src="/bg_video.mp4" type="video/mp4" />
        </video>
        <div style={{ position: "absolute", inset: 0, background: "rgba(6,6,6,0.66)" }} />
        <div className="wrap-wide" style={{ position: "relative" }}>
          <Reveal>
            <Label color="#fff">Get started</Label>
            <h2
              style={{
                fontSize: "clamp(56px, 11vw, 180px)",
                fontWeight: 800,
                letterSpacing: "-0.05em",
                lineHeight: 0.88,
                margin: "30px 0 0",
                maxWidth: 1300,
              }}
            >
              Trade what you can read.
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 40, marginTop: 48 }}>
              <p style={{ fontSize: 21, color: MUTED, margin: 0, maxWidth: 520, lineHeight: 1.55 }}>
                Native liquidity, single-block settlement, and a state you can verify yourself.
              </p>
              <button
                onClick={connectWallet}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "20px 44px",
                  background: ACCENT_BTN,
                  color: "#fff",
                  fontSize: 21,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Wallet size={22} />
                {wallet ? shortAddr(wallet) : "Connect Wallet"}
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Closing wordmark */}
      <section style={{ overflow: "hidden", padding: "48px 0 0", borderTop: `1px solid ${LINE}` }}>
        <div
          aria-hidden
          style={{
            fontSize: "clamp(96px, 27vw, 380px)",
            fontWeight: 800,
            letterSpacing: "-0.05em",
            lineHeight: 0.78,
            textAlign: "center",
            whiteSpace: "nowrap",
            color: "transparent",
            WebkitTextStroke: "1px rgba(255,255,255,0.16)",
            marginBottom: "-0.1em",
            userSelect: "none",
          }}
        >
          Distin
        </div>
      </section>

      {/* Footer */}
      <footer style={{ margin: 20, marginTop: 40, border: `1px solid ${LINE}`, padding: "44px 32px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.02em" }}>Distin</div>
            <div style={{ marginTop: 8, fontSize: 18, color: MUTED }}>
              Native liquidity on Solana. No bridge.
            </div>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {[
              { Icon: AtSign, label: "Contact" },
              { Icon: MessageCircle, label: "Community" },
              { Icon: Globe, label: "Website" },
            ].map(({ Icon, label }, i) => (
              <a
                key={i}
                href="/app"
                aria-label={label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 48,
                  height: 48,
                  border: `1px solid ${LINE}`,
                  color: "#fff",
                }}
              >
                <Icon size={20} />
              </a>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${LINE}`, fontSize: 18, color: MUTED }}>
          © 2026 Distin. Built on Solana.
        </div>
      </footer>
      </div>
    </main>
  )
}
