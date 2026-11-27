## Summary

<!-- Describe what this Pull Request changes, why it is needed, and how it fits the roadmap. -->

## Linked Issues

<!-- Reference related or closed issues, e.g., Closes #12 or Refs #4. -->
- Refs #

## Type of Change

- [ ] `feat` (new feature or user-facing capability)
- [ ] `fix` (bug fix)
- [ ] `refactor` (internal restructuring without behavior change)
- [ ] `docs` (documentation updates)
- [ ] `ci` / `chore` / `build` (tooling, workflows, repository governance, dependencies)

## Detailed Changes

<!-- List the concrete technical changes by package, module, or file. -->
-

## Verification and Testing

<!-- List the exact pnpm commands and checks run locally (never npm), plus observed results. -->
- [ ] `pnpm run lint`
- [ ] `pnpm run security:check`
- [ ] `pnpm run typecheck`
- [ ] `pnpm run test`
- [ ] `pnpm run build`

## Architecture, Security, and Governance Checklist

- [ ] PR title follows Conventional Commits (`<type>(<scope>): <lowercase summary>`) with an allowed scope.
- [ ] Every commit message is written in English with a descriptive body, zero emojis, and zero `Co-Authored-By` trailers.
- [ ] Dependencies and scripts use `pnpm` exclusively (no `npm`, `npx`, `yarn`, `package-lock.json`, or `yarn.lock`).
- [ ] No secrets, `.env` files, private keys, or local `.db`/`.sqlite` files are committed (`pnpm run security:secrets` passes).
- [ ] Sensitive outputs, logs, SQLite records, and `.orchdeck/handoff.md` preserve `SecretRedactor` / `EnvSanitizer` protections (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`).
- [ ] Electron / IPC / MCP changes preserve sandboxing, CSP, owner-only socket/pipe auth, and hard `main` branch protection (`docs/SECURITY_ARCHITECTURE.md`).
- [ ] Adapter and daemon tests run deterministically with `MockAdapter` / fixtures without live credentials.
- [ ] UI changes comply with `docs/DESIGN_SYSTEM.md` tokens and anti-AI-slop rules.
- [ ] PR targets `dev` (unless promoting `dev` or a `hotfix/*` / `release/*` branch to `main`).

## Breaking Changes and Migration Notes

<!-- State "None" if there are no breaking changes, or explain required migrations clearly. -->
None.
