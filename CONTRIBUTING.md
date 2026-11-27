# Contributing to Orchdeck

Thank you for contributing to **Orchdeck**! Please review our branch workflow and engineering standards before opening a Pull Request.

---

## Branch Workflow

- **`dev` (default branch):** all daily integration happens here. Branch off `dev`:
  - `feat/<area>-<slug>`
  - `fix/<area>-<slug>`
  - `docs/<slug>`
  - `chore/<slug>`
- **`main` (stable branch):** mirrors tagged releases (`vX.Y.Z`) only. Accepts release PRs from `dev` (or `hotfix/*` with immediate back-merge to `dev`).
- **Merge strategy:** `Squash & Merge` into `dev`; clean `Merge commit` from `dev` → `main` to preserve release history.

---

## Commit Conventions

We follow **Conventional Commits**:
- `feat(adapter-claude): ...`
- `fix(approvals): ...`
- `docs(design): ...`
- `chore(ci): ...`

---

## Development Rules

1. **Test without burning subscriptions:** all CI suites and adapter contract tests must run against `MockAdapter` and recorded fixtures—never depend on live CLI credentials in GitHub Actions.
2. **Git operations via system CLI:** all repository actions in the Core Daemon must invoke the system `git` binary through `GitService`. Do not add `libgit2`-style write bindings.
3. **Design System compliance:** follow tokens and anti-AI-slop rules in [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md). Avoid raw Tailwind palette classes (`indigo-*`, `purple-*`, `slate-*`).
4. **Security invariants:** changes to adapters, MCP handling, or approval modes must preserve API key stripping and hard `main` branch protection.
