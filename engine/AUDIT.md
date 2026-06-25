# Engine Security Audit (solana)

Result: **PASS** (0 high/medium open)

- `cargo clippy --all-targets -- -D warnings`: clean
- `cargo test`: 12 passing (share validation + threshold/overflow math)
- `cargo audit`: 0 vulnerabilities (3 transitive warning-level advisories, not per-project fixable)

Findings fixed this pass (see `SECURITY.md` for the full threat model):
- HIGH: `cancel_request` could be called by anyone on any pending request (free
  griefing) — now requires `has_one = requester`; foreign requests are only
  closable once expired.
- CLEANUP: removed unreachable `SchemeMismatch` error code (no input path);
  error count 22 → 21.
- LINT: `manual_range_contains`, `needless_range_loop` resolved; macro-origin
  warnings scoped under a justified crate-level allow.

NOTE: the `cancel_request` account-struct change alters program bytecode →
requires a devnet re-deploy to take effect.
