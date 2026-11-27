# Security Policy — Orchdeck

Orchdeck orchestrates local CLI coding agents with filesystem, shell, and subscription access. Security is enforced as **technical controls inside the Core Daemon, Electron shell, and repository CI**, never as prompt instructions.

For the full technical specification covering data classification, `SecretRedactor`, Electron sandboxing, IPC authentication, and supply-chain controls, see [Security Architecture](docs/SECURITY_ARCHITECTURE.md).

---

## Threat Model and Mandatory Controls

1. **Zero Unexpected Token Billing (`EnvSanitizer`):**
   - Before spawning any CLI (`claude`, `codex`, `agy`), the Daemon strips API billing keys such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `AZURE_OPENAI_API_KEY`, `AWS_SECRET_ACCESS_KEY`, and any user-configured list, forcing local subscription authentication only.
2. **Hard Protection of `main` and Protected Branches:**
   - Agents never edit on `main` (or configurable protected branches). All writes occur on an isolated task branch (`agent/<slug>`) or dedicated `git worktree`.
   - `git push` and protected-branch checkouts are blocked by the subprocess `git` shim.
3. **Role Isolation and Post-Turn Verification:**
   - `Planner` and `Reviewer` roles run in `read_only` mode. If a read-only turn modifies the working tree despite CLI flags, the Daemon reverts the changes, aborts the turn, and alerts the user.
4. **Sensitive-Data Redaction and Storage Hygiene:**
   - Logs, SQLite transcripts, and `.orchdeck/handoff.md` packets pass through `SecretRedactor` before persistence or display. Plaintext billing keys, cookies, and resolved MCP secrets are never persisted.
   - Repository pre-commit hooks and CI enforce `pnpm run security:secrets`, `.gitleaks.toml` rules, `pnpm audit --audit-level=high`, and CodeQL analysis.
5. **Electron Shell and Local IPC Hardening:**
   - Renderer windows enforce `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP (`connect-src 'none'`), and navigation/new-window blocking.
   - Local Core Daemon Named Pipes / Unix sockets and the `v0.3` Local MCP Hub (`127.0.0.1`) require per-session 256-bit bearer tokens and owner-only OS permissions.
6. **Child Process-Tree Cleanup:**
   - On Windows, every CLI process runs inside a `Job Object` (`KILL_ON_JOB_CLOSE`) so child MCP servers or background watchers cannot survive cancellation or app exit.
7. **Credential Safety and Zero Scraping:**
   - Orchdeck **never** reads browser cookies, **never** scrapes private subscription web endpoints, and **never** persists resolved MCP secrets inside SQLite (only references to environment variables or config paths).

---

## Reporting a Vulnerability

If you discover a way to bypass protected-branch guards, leak stripped environment variables/secrets, bypass Electron sandboxing/CSP, or run unauthorized mutating actions under `Plan` / `Architect` modes, **do not open a public issue**.

Please open a private **GitHub Security Advisory** on `keylorpineda/orchdeck` with reproduction steps, OS version, and affected CLI details.
