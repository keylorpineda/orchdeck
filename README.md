# Orchdeck

> A single desktop command deck to orchestrate **Claude Code**, **Codex**, and **Antigravity** together on your local repositories — using your own subscriptions, with zero per-token billing.

---

### Branch & Development Status

- **Default branch (`dev`):** active daily development and Pull Request integration (`Squash & Merge`).
- **Stable branch (`main`):** mirrors tagged stable releases promoted from `dev`.
- **Current stage:** `Phase 0 — Architecture, Design System & CLI Spike`.

---

## The Problem

Using **Claude Code**, **Codex CLI**, and **Antigravity** today means juggling three separate apps, three disconnected chat histories, and three isolated usage limits. When you want one model to plan, another to implement, and a third to audit, you end up copy-pasting context between windows with no shared project memory or cross-review.

## The Solution

**Orchdeck** is a conversation-first desktop workbench — **not an IDE** — where you direct the work and agents edit your local repositories directly through their **official CLIs** and your already-authenticated subscriptions:

- **Projects & Chats:** sidebar of linked local Git repositories with persistent SQLite chat histories per project.
- **Model Picker & Fusion Recipes:** choose an exact model per chat or turn (`antigravity:gemini-4-neon`, `codex:gpt-5-codex`, `claude:opus-4-6`), run **3-slot Team Recipes** (*Plan → Implement → Review*), override inline (`@neon`, `@codex`, `@opus`), or compare two models side-by-side with **Second Opinion** cards.
- **4 Approval Modes with Hard `main` Protection:** `Plan`, `Architect` (default), `Express`, and `Branch Pilot`. No agent can ever write to or push `main` without your explicit action.
- **Change Cards, Not a Code Editor:** every delivery lands in chat as a review sheet with changed files, a Shiki diff, configurable test results, and three actions: **Approve** (clean `git commit` authored solely with your Git identity, zero `Co-Authored-By` trailers), **Request Changes**, or **Discard**.
- **Phased Plugins, Skills & MCPs:** instant *Native Passthrough* in `v0.1`, a unified *Inspector + Switchboard* drawer and portable `SKILL.md` injection in `v0.2–v0.3`, and a deduplicating *Local MCP Hub* with a Policy Gate in `v0.3`.
- **Honest Usage & Quota Radar:** three quiet status marks (`● ■ ◆`) in the top bar + popover showing hard availability (`Available` / `Cooldown`), verified local telemetry (`5h` / `7d` windows), and empirically calibrated pressure blocks (never fabricated percentages or web scraping).
- **Parallel Work & Shared Memory:** opt-in `git worktree` isolation for concurrent chats, shared project memory (`AGENTS.md` / `CLAUDE.md` bridge), and 1-click context handoff via `.orchdeck/handoff.md` whenever you switch models or hit a quota limit.

---

## Engine Support Matrix

| Mark | Engine | Official CLI | Target Status |
| :---: | :--- | :--- | :--- |
| `●` | **Claude** | `claude` (Claude Code) | Tier 1 — `v0.1` |
| `■` | **Codex** | `codex` (OpenAI Codex CLI) | Tier 1 — `v0.1` |
| `◆` | **Antigravity** | `agy` (Antigravity CLI) | Tier 1 / Beta — `v0.1` |

---

## Documentation

- [Council Decisions](docs/COUNCIL_DECISIONS.md) — Full record of the 2-phase Council on naming (`Orchdeck`), stack, visual identity, scope, and guardrails.
- [Architecture](docs/ARCHITECTURE.md) — Electron + Decoupled Core Daemon, `ProviderAdapter` contract, approval state machine, model fusion, plugins, and telemetry.
- [Design System](docs/DESIGN_SYSTEM.md) — *Precision Editorial Workbench* identity, anti-AI-slop rules, light/dark tokens, typography, and component specs.
- [Roadmap](docs/ROADMAP.md) — Phased milestones from `Phase 0` to `v1.0` and explicit *Non-Goals*.
- [Security](SECURITY.md) — API key stripping, branch protection invariants, and no-scraping policy.
- [Contributing](CONTRIBUTING.md) — `feat/* → dev → main` workflow, Conventional Commits, and `MockAdapter` CI rules.
