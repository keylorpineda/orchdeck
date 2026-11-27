## Summary

Briefly describe what this PR changes and how it aligns with Orchdeck's roadmap.

- Related issue: #

## Type of Change

- [ ] `feat` (new feature)
- [ ] `fix` (bug fix)
- [ ] `adapter` (Claude / Codex / Antigravity adapter change)
- [ ] `docs` / `chore`

## Architecture & Security Checklist

- [ ] Core Daemon / adapter changes preserve API key environment stripping (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`).
- [ ] No code path allows agents to write to or push `main` / protected branches.
- [ ] Adapter tests run with `MockAdapter` / recorded fixtures without consuming live subscriptions.
- [ ] UI changes follow `docs/DESIGN_SYSTEM.md` tokens (no raw Tailwind palette colors or generic slop).
- [ ] PR targets `dev` (unless it is a release PR into `main`).
