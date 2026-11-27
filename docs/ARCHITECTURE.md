# Technical Architecture — Orchdeck

## 1. Layered System Overview

Orchdeck strictly separates the presentation shell from CLI process supervision, filesystem access, and Git mutations.

```text
+-------------------------------------------------------------------+
|  Shell UI (Electron Renderer: React 19 + Tailwind v4 + Shiki)     |
|  - Linear threads, Change Cards, Pickers, Popovers, Plugins Drawer|
+---------------------------------+---------------------------------+
                                  | JSON-RPC 2.0 (Named Pipe / UDS)
                                  v
+-------------------------------------------------------------------+
|  Core Daemon (Decoupled Node.js / TypeScript + SQLite WAL)        |
|  - TaskRun State Machine      - Handoff Packet Builder            |
|  - Approval & Policy Engine   - Usage Ledger & Calibration        |
|  - GitService (git CLI + shim)- Plugin Inspector / MCP Hub (v0.3) |
+-------+-------------------------+-------------------------+-------+
        |                         |                         |
        v                         v                         v
+---------------+         +---------------+         +---------------+
| ClaudeAdapter |         | CodexAdapter  |         |  AgyAdapter   |
| (claude CLI)  |         | (codex CLI)   |         |  (agy CLI)    |
+-------+-------+         +-------+-------+         +-------+-------+
        |                         |                         |
        +-------------------------+-------------------------+
                                  |
                                  v
            [ Env Sanitizer + Git Shim + Win32 Job Object ]
```

### Core Structural Rules
1. **No heavy orchestration in `ipcMain`:** Electron's main process only manages windows and app lifecycle; all orchestration runs in the Core Daemon backed by `SQLite` in `WAL` mode.
2. **System `git` binary only:** `GitService` always spawns the system `git` executable with safe explicit arguments (`--`, normalized paths). Write bindings like `libgit2` are prohibited.
3. **Guaranteed process-tree cleanup:** on Windows, each CLI runs inside a **Job Object** (`KILL_ON_JOB_CLOSE`) via a minimal native helper so child MCP servers and test watchers never leak as zombies on cancellation or crash.

---

## 2. `ProviderAdapter` Contract

Every official CLI sits behind a version-pinned adapter verified in CI using a deterministic `MockAdapter` driven by recorded real CLI fixtures:

```ts
export type ProviderId = 'claude' | 'codex' | 'antigravity';

export interface ProviderCapabilities {
  streamJson: boolean;
  strictMcpConfig: boolean;
  modelSelectionFlag: boolean;
  readOnlyFlag: boolean;
  supportsResume: boolean;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly pinnedCliVersionRange: string;

  healthCheck(): Promise<{
    installed: boolean;
    version?: string;
    authenticated: boolean;
    capabilities: ProviderCapabilities;
  }>;

  listModels(): Promise<ModelDescriptor[]>;
  startSession(opts: SessionOptions): Promise<AdapterSession>;
  sendTurn(sessionId: string, input: TurnInput): AsyncIterable<NormalizedEvent>;
  cancel(sessionId: string): Promise<void>;
}
```

### Normalized Stream (`NormalizedEvent`)
- `text_delta`: incremental assistant output.
- `thinking_delta`: collapsible reasoning trace.
- `tool_use` / `tool_result`: tool invocation and summarized output.
- `usage`: reported `input`, `output`, `cache_read`, `cache_write` tokens and turn duration.
- `rate_limit`: quota exhaustion signal and reset timestamp when printed by the CLI.
- `status` / `error` / `done`.

---

## 3. Security Invariants & Guardrails

Security rules **never rely on system prompts**; they are enforced in the Core Daemon and child-process environment:

1. **Environment Sanitization (zero token billing):** before spawning any CLI, the Daemon strips `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, and any user-configured billing keys so CLIs authenticate strictly via local subscriptions.
2. **Hard `main` Protection:** agents never run edits on `main` (or configurable protected branches such as `master`, `release/*`). All write turns operate on an isolated task branch (`agent/<slug>`) or dedicated `git worktree`.
3. **Subprocess `git` Shim:** the Daemon prepends a lightweight `git` wrapper in the subprocess `PATH` blocking `git push`, `git checkout main`, and unauthorized direct commits.
4. **Clean User-Authored Commits:** when the user approves a Change Card, `GitService` creates the commit using the user's local/global `git config user.name` and `user.email`, with zero `Co-Authored-By` trailers.
5. **Post-Turn `read_only` Verification:** if a `Planner` or `Reviewer` role mutates the working tree despite CLI read-only flags, the Daemon reverts changes, aborts the turn, and alerts the user.

---

## 4. Approval Modes & `TaskRun` State Machine

| Mode | Initial Plan | Execution in Branch / Worktree | Branch Commit | Merge to `main` / `push` |
| :--- | :--- | :--- | :--- | :--- |
| **1. Plan** | Read-only / strict; confirms sensitive actions | Read-only or per-command approval | Approval in Change Card | Explicit user action |
| **2. Architect** *(Default)* | Mandatory approval before editing | Autonomous on files & allowlisted checks | Approval in Change Card | Explicit user action |
| **3. Express** | Auto-approved (streamed live) | Autonomous in branch/worktree with guardrails | Approval in single Change Card | Explicit user action |
| **4. Branch Pilot** | Auto-approved | Autonomous Builder → Tests → Reviewer loops | Atomic auto-commit on `agent/<slug>` | **Mandatory explicit user action** |

> `v0.1` exposes **Architect** and **Express** in the UI to keep QA tight; `v0.2` enables all 4 modes.

```text
IDLE
  └─> PLANNING
        ├─[Plan | Architect]───────> AWAITING_PLAN_APPROVAL
        │                              ├─(Approve)─> PREPARING_BRANCH
        │                              ├─(Revise)──> PLANNING
        │                              └─(Reject)──> CANCELLED
        └─[Express | Branch Pilot]─> PREPARING_BRANCH

PREPARING_BRANCH ─> EXECUTING
  ├─[Plan / Policy Gate]────> AWAITING_ACTION_APPROVAL ─> EXECUTING | ABORTED
  ├─[Rate-limit / Quota]────> QUOTA_HANDOFF (1-click relay or configured fallback)
  └─[Turn complete]─────────> VERIFYING (tests + optional Reviewer)
        ├─[Reviewer REQUEST_CHANGES & iter < max]─> EXECUTING
        ├─[Branch Pilot]──────────────────────────> COMMITTED_ON_BRANCH
        └─[Plan | Architect | Express]────────────> AWAITING_FINAL_REVIEW
                                                      ├─(Approve)─────────> COMMITTED_ON_BRANCH
                                                      ├─(Request changes)─> EXECUTING
                                                      └─(Discard)─────────> DISCARDED

COMMITTED_ON_BRANCH ─(Explicit UI action)─> MERGED_BY_USER
```

---

## 5. Model Fusion & Deterministic Handoff Protocol

1. **Canonical Model Handle:** `<provider>:<model_id>[:reasoning_effort]` (e.g., `antigravity:gemini-4-neon`, `codex:gpt-5-codex:high`, `claude:opus-4-6:max`).
2. **3-Slot Team Recipes:**
   - `Planner` (`read_only`): produces scope, invariants, and target files (`PlanSpec`).
   - `Builder` (`worktree_write`): implements edits and runs the project's test command.
   - `Reviewer` (`read_only`): audits `git diff` + test output and emits `APPROVE` or `REQUEST_CHANGES` (bounded retry cap prevents infinite loops).
3. **Per-Turn Tactical Override:** inline mentions (`@neon`, `@codex`, `@opus`) or quick picker override. Precedence: `Explicit mention > Recipe step > Thread default`.
4. **Deterministic Handoff Packet:** when switching models or relaying after a quota limit, Orchdeck never replays raw cross-vendor transcripts. Instead, the Daemon writes `.orchdeck/handoff.md` (locally excluded via `.git/info/exclude`, never touching `.gitignore`) containing:
   - Original task goal and relevant project memory.
   - Decisions made and changed files (`git diff --stat`).
   - Latest test output / failures.
   - Concrete next step.

---

## 6. Phased Plugins, Skills & MCPs

1. **`v0.1` — Native Passthrough:** each CLI runs in the user's environment with its installed plugins/MCPs intact.
2. **`v0.2–v0.3` — Plugins Drawer (Inspector + Switchboard):** passive read-only discovery across `~/.claude/`, `~/.codex/`, `~/.gemini/antigravity/`, and repo configs, plus per-workspace toggles via official CLI flags and portable `SKILL.md` injection.
3. **`v0.3` — Local MCP Hub:** local aggregating proxy (`127.0.0.1` with ephemeral session bearer token) sharing stateful MCP instances across all 3 engines, deduplicating native registrations, and enforcing a Policy Gate on mutating `tools/call`.

---

## 7. Honest Usage Telemetry & Empirical Calibration

Flat-rate subscriptions do not expose live remaining-quota APIs. Orchdeck never fabricates official percentages or scrapes web cookies:

- **Hard verified signals:** CLI-reported rate-limit/cooldown events (with reset timestamps when printed) and local consumption parsed from streams/JSONL (`tokens`, `cache_read`, `turns`, `duration`) across rolling **5-hour** and **7-day** windows.
- **Empirical cap calibration:** whenever a provider hits a real rate-limit in a window, the Daemon records that observed volume (`calibrated_cap`) to display honest relative pressure (*local calibration*).
