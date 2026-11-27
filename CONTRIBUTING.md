# Contributing to Orchdeck

Thank you for contributing to **Orchdeck**. This document defines the mandatory repository workflow, package manager rules, commit conventions, issue standards, Pull Request requirements, and security invariants.

All repository artifacts—including code comments, commit messages, issues, Pull Requests, and documentation—must be written in clear, descriptive **English**, contain **zero emojis**, and include **zero `Co-Authored-By` or AI-attribution trailers**.

---

## 1. Package Manager Policy (`pnpm` Exclusively)

Orchdeck uses **`pnpm`** exclusively (`packageManager: pnpm@11.17.0`).

- **Prohibited tools:** never run `npm`, `npx`, or `yarn` in this repository.
- **Lockfile rule:** only `pnpm-lock.yaml` is permitted. Committing `package-lock.json`, `yarn.lock`, or `bun.lock*` will fail both local pre-commit checks and CI.
- **Enforcement:** `scripts/enforce-pnpm.ts` runs on `preinstall` and aborts non-`pnpm` invocations. `scripts/check-repo-hygiene.ts` verifies lockfile, TypeScript-only compliance, and `packageManager`.

### TypeScript-Only Policy

Orchdeck is **100% strict TypeScript**. Do not commit `.js`, `.mjs`, `.cjs`, or `.jsx` source files anywhere in the repository (only compiled artifacts inside gitignored `dist/` directories are emitted at build time). `pnpm run lint:repo` rejects any committed JavaScript source files.

### Local Setup

```sh
pnpm install
pnpm run setup:git
```

`pnpm install` activates Husky Git hooks automatically via `prepare`. `pnpm run setup:git` configures `.gitmessage` as your local `commit.template`.

---

## 2. Branch Workflow and Merge Strategy

- **`dev` (default branch):** all daily development and Pull Requests integrate into `dev`. Create short-lived branches off `dev`:
  - `feat/<area>-<slug>`
  - `fix/<area>-<slug>`
  - `refactor/<area>-<slug>`
  - `docs/<slug>`
  - `ci/<slug>`
  - `chore/<slug>`
- **`main` (stable branch):** mirrors tagged releases (`vX.Y.Z`) promoted from `dev` (or `hotfix/*` / `release/*` PRs with immediate back-merge to `dev`). Direct feature PRs targeting `main` are rejected by CI.
- **Merge strategy:**
  - Feature/fix PRs into `dev` use **Squash & Merge** with a Conventional Commit PR title.
  - Release PRs from `dev` into `main` use a **Merge Commit** to preserve release history.

---

## 3. Commit Message Standards

Orchdeck enforces **Conventional Commits** with mandatory scopes and descriptive bodies via `commitlint.config.mjs` and `.husky/commit-msg`.

### Required Format

```text
<type>(<scope>): <imperative lowercase summary>

Why:
Explain the problem, motivation, or architectural constraint addressed.

What changed:
- List the concrete files, modules, or behaviors modified.
- Note any edge cases, invariants, or verification steps.

Refs: #123
```

### Mandatory Rules

1. **Language:** 100% English.
2. **Allowed types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
3. **Mandatory scope (`kebab-case`):** must be one of `repo`, `ci`, `deps`, `docs`, `desktop`, `daemon`, `shared`, `ui`, `design`, `git`, `security`, `approvals`, `fusion`, `plugins`, `mcp`, `usage`, `memory`, `worktrees`, `adapters`, `adapter-claude`, `adapter-codex`, `adapter-antigravity`, `spike`, `release`.
4. **Header:** maximum 100 characters; subject must start lowercase, be at least 12 characters long, and have no trailing period.
5. **Descriptive body (mandatory):** minimum 30 characters, separated from the header by one blank line, with lines wrapped at 100 characters or fewer.
6. **Zero emojis:** both Unicode pictographs and colon-delimited emoji shortcodes are strictly forbidden.
7. **Zero co-author trailers:** `Co-Authored-By` trailers and AI-generation attribution lines are strictly forbidden. Every commit must be authored solely by the contributor's Git identity.

### Examples

Compliant commit:

```text
fix(security): block protected-branch checkout in subprocess git shim

Why:
Agent turns running inside an isolated worktree could invoke `git checkout main`
if the subprocess PATH shim only filtered `git push`.

What changed:
- Reject `checkout` and `switch` targets matching protected branch patterns in `GitShim`.
- Add unit tests covering `main`, `master`, and `release/*` branch guards.

Verification:
- Ran `pnpm run lint`, `pnpm run typecheck`, and `pnpm run test` (all passed).

Refs: #4
```

Non-compliant commits (rejected by hooks and CI):

- `fix: bug` (missing scope, vague subject, missing descriptive body)
- `feat(ui): Add Change Card` (uppercase subject start, missing body)
- `chore(repo): update config` (missing descriptive body)
- Any commit containing emojis or `Co-Authored-By` trailers

---

## 4. Issue Reporting and Triage Standards

Blank issues are disabled. Every issue must use one of the structured forms in `.github/ISSUE_TEMPLATE/`:

- **Bug Report** (`bug_report.yml`) for defects in the desktop shell, Core Daemon, Git integration, or UI.
- **Feature Request** (`feature_request.yml`) for roadmap-aligned proposals that respect Orchdeck's Non-Goals.
- **External CLI / Adapter Breakage** (`adapter_breakage.yml`) when upstream `claude`, `codex`, or `agy` updates break parsing or flags.
- **Engineering Task** (`task.yml`) for planned architecture, spike, tooling, or milestone work.

All issues must be written in English, include reproduction or acceptance details, redact secrets/tokens, and contain zero emojis. Security vulnerabilities must **never** be filed as public issues—use a private **GitHub Security Advisory**.

---

## 5. Pull Request Standards

Every Pull Request must:

1. Target `dev` (unless promoting `dev`, `release/*`, or `hotfix/*` to `main`).
2. Use a PR title matching `<type>(<scope>): <lowercase summary>` with an allowed scope and zero emojis.
3. Fill out every required section in `.github/PULL_REQUEST_TEMPLATE.md`:
   - `## Summary`
   - `## Linked Issues`
   - `## Detailed Changes`
   - `## Verification and Testing`
4. Pass both **CI** (`lint`, `typecheck`, `test`, `build` via `pnpm`) and **PR Governance** (`check-pr-governance.ts` + `commitlint` across all PR commits).

---

## 6. Engineering, Design System, and Security Rules

1. **Test without burning subscriptions:** all CI suites and adapter contract tests must run against `MockAdapter` and recorded fixtures—never depend on live CLI credentials in GitHub Actions. Follow [ADAPTER_SDK.md](docs/ADAPTER_SDK.md) when implementing a new CLI engine adapter.
2. **Git operations via system CLI:** all repository actions in the Core Daemon must invoke the system `git` binary through `GitService`. Do not add `libgit2`-style write bindings.
3. **Design System compliance:** follow tokens and anti-AI-slop rules in [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md). Avoid raw Tailwind palette classes (`indigo-*`, `purple-*`, `slate-*`).
4. **Security and sensitive-data invariants:** follow [SECURITY.md](SECURITY.md) and [SECURITY_ARCHITECTURE.md](docs/SECURITY_ARCHITECTURE.md). Preserve API key stripping (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`), `SecretRedactor` redaction, Electron sandboxing, and hard `main` branch protection. Never commit `.env` files, private keys, tokens, or local databases; run `pnpm run security:check` before opening a PR.
