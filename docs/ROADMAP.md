# Roadmap — Orchdeck

Built around one anti-vaporware rule: **`v0.1` must be solid enough to use every day while building `v0.2`.**

---

## Phase 0 — Technical Spike & Foundations
**Goal:** eliminate CLI unknowns before building the UI.
- Validate headless invocation, streaming output, model flags, read-only modes, and rate-limit detection across `claude`, `codex`, and `agy` without API keys.
- Monorepo scaffolding: Electron Shell + Decoupled Core Daemon (`JSON-RPC` + `SQLite WAL`) + Win32 Job Objects helper.
- Define `ProviderAdapter`, `NormalizedEvent`, and a fixture-driven `MockAdapter` for CI.
- Implement `EnvSanitizer` (API key stripping) and subprocess `git` shim blocking `commit`/`push` on protected branches.

## `v0.1` — Multi-Engine Daily Driver
**Goal:** daily-driver desktop chat supporting all 3 engines under a minimal common contract, Change Cards, and hard `main` protection.
- *Precision Editorial Workbench* Design System (light/dark tokens, IBM Plex, Phosphor, geometric marks).
- Local project (Git repo) CRUD, chat sidebar, and SQLite persistence.
- Version-pinned adapters with contract tests: **Claude Code** (Tier 1), **Codex CLI** (Tier 1), and **Antigravity CLI** (Tier 1/Beta), using *Native Passthrough* for plugins.
- Streaming chat thread with per-chat/per-turn engine & model picker and clear attribution.
- **Change Card:** Shiki diff, configurable per-project test runner, **Approve** (clean user-authored commit, zero co-authors), **Request Changes**, and **Discard**.
- Initial UI approval modes: **Architect** and **Express** + silent usage/rate-limit logging in SQLite.

## `v0.2` — Model Fusion, Team Mode, Quotas & Worktrees
**Goal:** unlock cross-model collaboration, full autonomy controls, and safe parallelism.
- **3-Slot Team Recipes:** `Plan → Implement → Review` plus inline turn overrides (`@neon`, `@codex`, `@opus`).
- **Deterministic Handoff Packet** (`.orchdeck/handoff.md` excluded via `.git/info/exclude`) and 1-click relay (manual and quota-triggered).
- **All 4 Approval Modes:** `Plan`, `Architect`, `Express`, `Branch Pilot` + post-turn `read_only` role enforcement.
- **Second Opinion Card:** 2 `read_only` models side-by-side inside the linear thread.
- **Honest Usage & Quota Radar:** quiet top-bar marks, verified `5h`/`7d` telemetry, and empirical local cap calibration.
- **Inline line-level diff comments** on Change Cards and opt-in **Git Worktrees** for parallel chats in the same repo.

## `v0.3` — Unified Plugins & Shared Project Memory
**Goal:** ecosystem visibility across all 3 tools and cross-session project continuity.
- **Plugins Drawer (Inspector + Switchboard):** unified catalog of installed vs repo-active plugins/MCPs + portable `SKILL.md` injection.
- **Local MCP Hub:** aggregating local proxy with stateful instance deduplication and a Policy Gate.
- **Shared Project Memory:** editable decisions, conventions, and pending items synced transparently with `AGENTS.md` / `CLAUDE.md`.

## `v1.0` — Intelligence, Polish & Ecosystem
**Goal:** data-backed model recommendations and signed cross-platform distribution.
- Per-task metrics (first-pass approval rate, iterations, latency) and hybrid **model/recipe recommender** driven by local history + heuristics (no extra LLM router calls).
- Signed Windows/macOS installers, auto-updates, and documented `Adapter SDK` for community engines.

---

## Non-Goals (Out of Scope for v1)

- Full code editor or advanced visual merge-conflict IDE (Orchdeck is a command deck, not an IDE).
- Embedded interactive terminal replacement for your system shell.
- Per-token API billing as the primary workflow.
- Web-cookie scraping or hitting private web endpoints to read subscription quotas.
- Visual node/DAG workflow builders (n8n-style).
- Opaque vector databases for project memory when structured Markdown + SQLite suffice transparently.
