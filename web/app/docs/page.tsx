"use client"

import { useState } from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { DOCS_PAGES } from "./content"

const ACCENT = "#8B5CF6"

export default function DocsPage() {
  const [active, setActive] = useState(0)
  const page = DOCS_PAGES[active]

  return (
    <div className="min-h-screen flex" style={{ background: "#060606", color: "#fafafa" }}>
      <aside
        className="w-64 flex-shrink-0 border-r px-5 py-8 sticky top-0 h-screen overflow-y-auto hidden md:block"
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
      >
        <Link href="/" className="flex items-center gap-2.5 mb-10">
          <img src="/logo.png" alt="" width={26} height={26} />
          <span className="font-bold text-sm tracking-wide">DISTIN Docs</span>
        </Link>
        <nav className="flex flex-col gap-1">
          {DOCS_PAGES.map((p, i) => (
            <button
              key={p.slug}
              onClick={() => setActive(i)}
              className="text-left text-sm px-3 py-2 rounded-lg transition-colors"
              style={{
                background: i === active ? "rgba(255,255,255,0.06)" : "transparent",
                color: i === active ? ACCENT : "rgba(255,255,255,0.55)",
              }}
            >
              {p.title}
            </button>
          ))}
        </nav>
        <Link href="/" className="block mt-10 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
          ← Back to home
        </Link>
      </aside>

      <main className="flex-1 min-w-0 px-6 md:px-12 py-10">
        <div className="md:hidden flex gap-2 flex-wrap mb-8">
          {DOCS_PAGES.map((p, i) => (
            <button
              key={p.slug}
              onClick={() => setActive(i)}
              className="text-xs px-3 py-1.5 rounded-full border"
              style={{
                borderColor: i === active ? ACCENT : "rgba(255,255,255,0.15)",
                color: i === active ? ACCENT : "rgba(255,255,255,0.55)",
              }}
            >
              {p.title}
            </button>
          ))}
        </div>
        <article className="docs-prose max-w-3xl">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{page.body}</ReactMarkdown>
        </article>
      </main>

      <style>{`
        .docs-prose h1 { font-size: 2rem; font-weight: 800; margin: 0 0 1rem; }
        .docs-prose h2 { font-size: 1.4rem; font-weight: 700; margin: 2.2rem 0 0.8rem; color: ${ACCENT}; }
        .docs-prose h3 { font-size: 1.1rem; font-weight: 600; margin: 1.6rem 0 0.6rem; }
        .docs-prose p { line-height: 1.8; color: rgba(255,255,255,0.75); margin: 0 0 1rem; }
        .docs-prose li { line-height: 1.8; color: rgba(255,255,255,0.75); margin: 0.25rem 0 0.25rem 1.2rem; list-style: disc; }
        .docs-prose code { background: rgba(255,255,255,0.07); padding: 0.15em 0.45em; border-radius: 6px; font-size: 0.88em; }
        .docs-prose pre { background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 1rem 1.2rem; overflow-x: auto; margin: 0 0 1.2rem; }
        .docs-prose pre code { background: transparent; padding: 0; }
        .docs-prose table { border-collapse: collapse; margin: 0 0 1.2rem; width: 100%; }
        .docs-prose th, .docs-prose td { border: 1px solid rgba(255,255,255,0.1); padding: 0.5rem 0.8rem; text-align: left; font-size: 0.9rem; }
        .docs-prose th { background: rgba(255,255,255,0.04); }
        .docs-prose a { color: ${ACCENT}; text-decoration: underline; }
        .docs-prose blockquote { border-left: 3px solid ${ACCENT}; padding-left: 1rem; color: rgba(255,255,255,0.6); margin: 0 0 1rem; }
      `}</style>
    </div>
  )
}
