# Security Architecture and Sensitive Data Handling — Orchdeck

This document defines the mandatory security architecture, sensitive-data boundaries, and runtime hardening rules that every package (`apps/desktop`, `packages/daemon`, `packages/shared`) must enforce before implementation begins.

Security in Orchdeck is **never delegated to prompt instructions**. Every rule below is enforced deterministically in code, OS permissions, subprocess environments, and CI checks.

---

## 1. Data Classification Matrix

| Tier | Examples | Storage & Lifecycle Rules |
| :--- | :--- | :--- |
| **Public** | Repository metadata, design tokens, `MockAdapter` fixtures, documentation | Safe to commit in Git. Must pass `pnpm run lint:repo` and `pnpm run security:secrets`. |
| **Workspace Metadata** | Linked local repo paths, chat titles, `PlanSpec`, normalized stream events, usage token counters | Stored in local SQLite (`WAL` mode) inside an owner-only app data directory. Subject to `SecretRedactor` before persistence. |
| **Local Sensitive** | Ephemeral daemon/MCP bearer tokens, user-approved MCP env-var references, handoff packets (`.orchdeck/handoff.md`) | Ephemeral tokens live in memory only (256-bit CSPRNG). `.orchdeck/` is excluded via `.git/info/exclude` (never modifying target repo `.gitignore`). |
| **Prohibited to Store** | Provider API billing keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`), browser cookies, subscription session tokens, resolved MCP secret values | **Never** persisted in SQLite, JSON config, logs, crash dumps, or renderer state. |

---

## 2. Credential and Secret Management

1. **Zero Unexpected Token Billing (`EnvSanitizer`):**
   - Before spawning any CLI subprocess (`claude`, `codex`, `agy`) or helper tool, the Core Daemon constructs an explicit allowlisted environment and strips `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `AZURE_OPENAI_API_KEY`, `AWS_SECRET_ACCESS_KEY`, and any user-configured billing key names.
   - CLIs authenticate exclusively via the user's pre-existing local subscription sessions.
2. **No Plaintext Secrets on Disk:**
   - Local MCP Hub configurations store only **references** (environment variable names or external CLI config paths), never resolved secret values.
   - If a future feature requires persisting a user-entered secret, it must use Electron `safeStorage` (backed by Windows DPAPI / macOS Keychain) and never plain SQLite columns or JSON files.
3. **Zero Web-Cookie Scraping:**
   - Orchdeck never reads browser cookie stores or calls undocumented web endpoints to query subscription quotas.

---

## 3. Centralized `SecretRedactor` Pipeline

All untrusted or sensitive text streams must pass through a single shared `SecretRedactor` utility in `packages/shared` before they are written to SQLite, `.orchdeck/handoff.md`, application log files, crash reports, or rendered in the UI:

- **Covered patterns:** Anthropic keys (`sk-ant-...`), OpenAI keys (`sk-proj-...`, `sk-...T3BlbkFJ...`), Google/Gemini keys (`AIza...`), GitHub tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `github_pat_`), AWS keys (`AKIA...`), `Bearer <token>` authorization headers, PEM private key blocks, and database/cache URLs containing embedded passwords.
- **Redaction format:** matched substrings are replaced deterministically with `[REDACTED:<category>]` (never partially echoed).
- **Zero raw secret error reporting:** error handlers and CI scripts must report file path, line number, and rule ID without echoing matched secret content.

---

## 4. Electron Shell Hardening (`apps/desktop`)

Every `BrowserWindow` and `WebContents` in the Electron shell must enforce:

1. **Process Isolation:**
   - `contextIsolation: true`
   - `nodeIntegration: false`
   - `sandbox: true`
   - `webSecurity: true`
   - `allowRunningInsecureContent: false`
2. **Strict Content Security Policy (CSP):**
   - Production builds must enforce:
     `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none';`
   - Renderer windows never make direct outbound network calls (`connect-src 'none'`).
3. **Navigation and New-Window Lockdown:**
   - Reject all `will-navigate` events away from the bundled app origin.
   - Deny all `setWindowOpenHandler` calls; external documentation links open via an explicit, scheme-validated (`https:` only) shell handler after user click.
4. **Minimal Typed Preload Bridge:**
   - `preload` exposes only explicit, schema-validated IPC methods via `contextBridge.exposeInMainWorld`.
   - Raw `ipcRenderer`, `fs`, `child_process`, and `process.env` are never exposed to the renderer.

---

## 5. Core Daemon IPC, Local MCP Hub, and Filesystem Isolation

1. **Authenticated Local Daemon Transport:**
   - Windows: Named Pipe scoped to the current user SID (`DACL` granting access exclusively to the current user).
   - macOS/Linux: Unix Domain Socket created inside a `0700` runtime directory with `0600` socket file permissions.
   - Every JSON-RPC 2.0 connection requires an ephemeral 256-bit random bearer token generated at daemon startup and passed in-memory to the Electron main process.
2. **Local MCP Hub (`v0.3`) Hardening:**
   - Binds strictly to `127.0.0.1` on an ephemeral port (never `0.0.0.0`).
   - Requires the ephemeral per-session bearer token on every request and validates `Host` / `Origin` headers to prevent DNS-rebinding attacks from browser tabs.
   - Applies the active Approval Mode Policy Gate to mutating `tools/call` invocations.
3. **SQLite & App Data Directory Permissions:**
   - Store `orchdeck.db`, `-wal`, and `-shm` files inside a dedicated directory created with owner-only permissions (`0700` on POSIX; current-user ACL on Windows).
4. **Path Traversal & Symlink Containment:**
   - Every file path referenced by Change Cards, diff viewers, or worktree helpers must be canonicalized (`fs.realpath`) and verified to remain inside the linked repository or worktree root.

---

## 6. Subprocess, Git, and Supply-Chain Controls

1. **Command Execution Safety:**
   - Spawn `git`, `claude`, `codex`, and `agy` using `spawn` / `execFile` with `shell: false` and explicit argv arrays (`--` separating flags from paths). Never interpolate user or model text into shell strings.
2. **Hard `main` Protection & `read_only` Enforcement:**
   - Subprocess `PATH` prepends the Orchdeck `git` shim blocking `git push`, `git checkout main`, `git switch main`, `git reset --hard` on protected branches, and unauthorized commits.
   - Post-turn verification reverts any working tree mutation performed during a `Planner` or `Reviewer` `read_only` turn, aborts the turn, and alerts the user.
3. **Guaranteed Process-Tree Cleanup:**
   - Windows: assign every child CLI to a Win32 Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
   - macOS/Linux: spawn in a detached process group and terminate `-pgid` on cancellation or exit.
4. **Repository & Supply-Chain Hygiene:**
   - `pnpm` exclusively (`packageManager` pinned, `pnpm-lock.yaml` frozen in CI, `onlyBuiltDependencies` explicitly allowlisted in `pnpm-workspace.yaml`).
   - Local pre-commit (`lint:repo` + `security:secrets`) and `commit-msg` hooks via Husky + Commitlint.
   - GitHub Actions CI running `security:secrets`, `pnpm audit --audit-level=high`, and CodeQL static analysis, backed by GitHub secret scanning and push protection.
