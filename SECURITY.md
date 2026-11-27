# Security Policy — Orchdeck

Orchdeck orchestrates local CLI coding agents with filesystem, shell, and subscription access. Security is enforced as **technical controls inside the Core Daemon**, never as prompt instructions.

---

## Threat Model & Mandatory Controls

1. **Zero Unexpected Token Billing (Environment Sanitization):**
   - Before spawning any CLI (`claude`, `codex`, `agy`), the Daemon strips API billing keys such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, and any user-configured list, forcing local subscription authentication only.
2. **Hard Protection of `main` and Protected Branches:**
   - Agents never edit on `main` (or configurable protected branches). All writes occur on an isolated task branch (`agent/<slug>`) or dedicated `git worktree`.
   - `git push` and protected-branch checkouts are blocked by the subprocess `git` shim.
3. **Role Isolation & Post-Turn Verification:**
   - `Planner` and `Reviewer` roles run in `read_only` mode. If a read-only turn modifies the working tree despite CLI flags, the Daemon reverts the changes, aborts the turn, and alerts the user.
4. **Child Process-Tree Cleanup:**
   - On Windows, every CLI process runs inside a `Job Object` (`KILL_ON_JOB_CLOSE`) so child MCP servers or background watchers cannot survive cancellation or app exit.
5. **Credential Safety & Zero Scraping:**
   - Orchdeck **never** reads browser cookies, **never** scrapes private subscription web endpoints, and **never** persists resolved MCP secrets inside SQLite (only references to environment variables or config paths).

---

## Reporting a Vulnerability

If you discover a way to bypass protected-branch guards, leak stripped environment variables/secrets, or run unauthorized mutating actions under `Plan` / `Architect` modes, **do not open a public issue**.

Please open a private **GitHub Security Advisory** on `keylorpineda/orchdeck` with reproduction steps, OS version, and affected CLI details.
