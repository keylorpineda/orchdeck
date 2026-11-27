# Council Decisions — Orchdeck

This document records the decisions made through a **2-phase Council** (Phase 1 independent analysis across three specialist advisors — Principal Systems Architect, Staff Product Designer, and Product/Open-Source Strategist — followed by blind cross-review and an express English naming round).

---

## 1. Naming Decision: **Orchdeck**

After discarding initial candidates with existing GitHub/agent-tool collisions or non-English phrasing, the Council ran a ranked-choice vote across verified English names with **zero existing repositories on GitHub**: `Orchdeck`, `Orchrail`, `Orchline`, `Orchbay`, `Orchcraft`, `Orchyard`, `Orchway`, `Orchgrid`, `Orchrun`.

### Final Vote Tally (`#1 = 3 pts`, `#2 = 2 pts`, `#3 = 1 pt`)

| Candidate | Advisor 1 (Systems Architect) | Advisor 2 (Product Designer) | Advisor 3 (Product Strategist) | Total |
| :--- | :---: | :---: | :---: | :---: |
| **Orchdeck** | #1 (3 pts) | #1 (3 pts) | #1 (3 pts) | **9 pts (Unanimous Winner)** |
| **Orchrail** | #2 (2 pts) | — | #2 (2 pts) | **4 pts** |
| **Orchline** | — | #2 (2 pts) | #3 (1 pt) | **3 pts** |
| **Orchbay** | #3 (1 pt) | #3 (1 pt) | — | **2 pts** |

**Why `Orchdeck` won unanimously:**
- Immediately communicates a desktop **orchestration command deck** for coding agents on GitHub and in terminal/config paths (`.orchdeck/`).
- Clean two-syllable English phonetics without collisions (`Orchcraft`) or misreadings (`Orchyard` → *orchard*), pairing naturally with our core **Change Cards** metaphor and *Precision Editorial Workbench* visual system.

---

## 2. Technical & Product Verdicts

### A. Desktop Stack
- **Decision:** **Electron + Decoupled Local Core Daemon** (Node.js/TypeScript + JSON-RPC 2.0 over Windows Named Pipe / macOS Unix Domain Socket + SQLite in `WAL` mode) + lightweight Win32 helper for **Windows Job Objects** (`KILL_ON_JOB_CLOSE`) to prevent orphaned CLI/MCP child processes.
- **Git operations:** always invoke the system `git` binary with sanitized environments and safe arguments; never use `libgit2`/`nodegit` for writes due to edge cases with `git worktree`, signing, and hooks.
- **Why not Tauri v2:** avoids maintaining a dual Rust/TS stack, constant IPC serialization overhead with TypeScript MCP SDKs, and rendering discrepancies between WebView2 and WKWebView on large virtualized diffs. The decoupled daemon keeps the UI shell replaceable later.

### B. Visual Identity (Anti-AI-Slop)
- **Decision:** **«Precision Editorial Workbench»** (*Paper & Ink* light theme + *Graphite & Vermilion* dark theme), established from `v0.1`.
- **Banned tropes:** neon purple/blue gradients, gratuitous glassmorphism, cliché AI emojis (sparkles, rocket, brain), unstyled `shadcn/ui` defaults, and default `Lucide` chrome.
- **UI stack:** React 19 + TypeScript + Vite + Tailwind CSS v4 + Base UI / Radix Primitives + Shiki (custom themes) + Phosphor Icons + `cmdk`.

### C. Approval Modes
- **Decision:** **4 orthogonal modes** (`Plan`, `Architect` [default], `Express`, `Branch Pilot`) enforced in the Core Daemon (never delegated to prompts): **no mode can ever write to `main` or execute `git push` without explicit user action**, and every approved commit uses solely the user's `git config` identity with zero `Co-Authored-By` trailers.
- **Rollout:** architecture supports all 4 modes from day 1; `v0.1` exposes `Architect` and `Express` to focus QA, and `v0.2` completes `Plan` and `Branch Pilot`.

### D. Model Fusion
- **Decision:** **Canonical Model Handles + 3-Slot Recipes + Deterministic Handoff Packet** (no complex node-graph workflow builders).
- Handle format: `<provider>:<model_id>[:reasoning_effort]` (e.g., `antigravity:gemini-4-neon`, `codex:gpt-5-codex`, `claude:opus-4-6`).
- Each recipe maps 3 roles (`Plan`, `Implement`, `Review`), supports inline per-turn overrides (`@neon`, `@codex`, `@opus`), and keeps the conversation in a single linear thread.
- `v0.2` adds an embedded **Second Opinion** card (2 `read_only` models side-by-side inside the linear thread).

### E. Plugins, Skills & MCPs
- **Decision:** **Zero re-implementation of proprietary plugin runtimes.**
- **Stages:**
  1. `v0.1`: **100% Native Passthrough** (CLIs run with the user's existing plugins/MCPs).
  2. `v0.2–v0.3`: **Plugins Drawer (Inspector + Switchboard)** for unified visibility/toggles + portable `SKILL.md` injection across engines.
  3. `v0.3`: **Local MCP Hub** (local aggregating proxy with instance deduplication and a Policy Gate for mutating tools).

### F. Usage & Quota Tracking
- **Decision:** **Strict honesty — zero fabricated percentages and zero web-cookie scraping.**
- Tracks verifiable telemetry from local streams/JSONL logs (tokens, cache hits, turns, latency, real rate-limit/cooldown events) across rolling `5h` and `7d` windows.
- UI (`v0.2`) surfaces 3 quiet marks (`● ■ ◆`) in the top bar + popover with hard status (`Available` / `Cooldown`), verified activity, and 4 pressure blocks using **local empirical calibration** (recording observed consumption caps whenever a real rate-limit occurs).

### G. `v0.1` Multi-Engine Scope
- **Decision:** `v0.1` ships with the **common adapter contract across all 3 engines** (Claude Tier 1, Codex Tier 1, Antigravity Tier 1/Beta depending on exposed CLI flags) so Orchdeck delivers its core multi-engine promise immediately rather than launching as a single-CLI wrapper. Parallel worktrees, plugin UI, inline diff comments, and quota UI follow in `v0.2`–`v0.3`.

---

## 3. Mascot & Editorial Pixel-Art Decision: **Zompo**

Convened through a 3-advisor Council (Systems Architect, Staff Product Designer, and Costa Rican Cultural Strategist) to design a completely original, Costa Rica-inspired pixel-art critter mascot with zero tourist clichés and crisp legibility at `14px`–`28px` across both *Paper & Ink* and *Graphite & Vermilion*.

### Ranked-Choice Vote (`#1 = 3 pts`, `#2 = 2 pts`, `#3 = 1 pt`)

| Candidate | Advisor 1 (Systems Architect) | Advisor 2 (Product Designer) | Advisor 3 (Cultural Strategist) | Total |
| :--- | :---: | :---: | :---: | :---: |
| **Zompo** *(Leafcutter Ant / Zompopa)* | #1 (3 pts) | #2 (2 pts) | #1 (3 pts) | **8 pts (Winner)** |
| **Pumi** *(Blue-Jeans Dart Frog)* | #2 (2 pts) | #1 (3 pts) | #2 (2 pts) | **7 pts** |
| **Vitro** *(Glass Frog)* | #3 (1 pt) | — | #3 (1 pt) | **2 pts** |
| **Ketz** *(Blocky Quetzal)* | — | #3 (1 pt) | — | **1 pt** |

**Why `Zompo` won:**
- The Costa Rican *zompopa* (leafcutter ant) is nature's parallel multi-agent orchestrator: disciplined worker trails slicing precision pieces and carrying discrete payloads without jamming the main trail.
- Maps directly onto Orchdeck's palette and core **Change Card** metaphor: shaded vermilion chitin (`--zompo-shell-hi/mid/deep`), dorsal pronotal spines, curved articulated legs, glossy eye, and a Costa Rican serrated leaf with veined chlorophyll gradient (`--zompo-leaf-hi/mid/deep/vein`).
- Rendered as a lifelike, anatomically sculpted `64x52` SVG with smooth GPU-accelerated animations (alternating tripod stride gait while working, independent elbowed antenna sensing sweep, periodic natural eye blink, overhead leaf inertia sway, and `prefers-reduced-motion` support) paired with subtle architectural pixel-art details (`PixelGlyph`, `.pixel-rule`, `.pixel-frame`, and `PixelStepTrack`) — zero anxious Tailwind bounce/pulse effects.
- Bilingual (`EN` / `ES`) working phrases reflect authentic software craft and subtle Costa Rican idioms (`"Zompo está cocinando..."`, `"Zompo está jalando diffs..."`, `"Zompo está chorreando un patch..."`).

---

## 4. Mascot & Motion Evolution Addendum: **Orso** (Bear Engineer)

Following live desktop visual evaluation, the mascot and motion language evolved from the initial leafcutter ant (`Zompo`) to **Orso**, a richly textured craftsman bear engineer rendered in custom SVG (`OrsoMascot`) with:
- Procedural SVG fur and sweater knit textures (`<feTurbulence>` noise filter + SVG knit `<pattern>`) calibrated across both *Paper & Ink* and *Graphite & Vermilion*.
- Direct workstation choreography: articulated paws typing across depressing glowing mechanical keys (`typing` / `working` moods), steaming ceramic mug, periodic eye blink, ear wiggle, celebratory commit pose (`committed`), and interactive click-to-wave.
- Editorial boot `SplashScreen`, smooth CSS drawer/sidebar width+opacity transitions (`.orch-panel-slide`), popover/card entrances (`.orch-popover`, `.orch-enter`), tactile buttons (`.orch-btn`), and live keystroke reactivity.

