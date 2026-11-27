# CLI Capability Matrix and Spike Fixtures

This document records the headless CLI contract matrix for **Claude Code**, **Codex CLI**, and **Antigravity CLI**, along with deterministic fixtures used in CI without consuming live user subscriptions or forwarding API keys.

---

## 1. Engine Capability Matrix

| Provider ID | Binary | Pinned Min Range | Headless Command & Stream Format | Model & Reasoning Flags | Native `read_only` / Sandbox | Strict MCP Flag |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `claude` | `claude` | `>= 1.0.0` | `claude -p <prompt> --output-format stream-json --verbose` (`stream-json`) | `--model <id>` + `--effort <level>` | `--permission-mode plan` | `--strict-mcp-config` |
| `codex` | `codex` | `>= 0.1.0` | `codex exec <prompt> --json` (`JSONL`) | `--model <id>` + `-c model_reasoning_effort=<level>` | `--sandbox read-only` | Native TOML / Local MCP Hub dedup |
| `antigravity` | `agy` | `>= 0.1.0` | `agy chat --headless` / runtime `--help` probe (`JSONL` + plaintext fallback) | Capability-probed (`--model`) | `--read-only` (when advertised) | Local MCP Hub dedup |

Implementation sources:
- [claude-adapter.ts](../packages/daemon/src/adapters/claude-adapter.ts)
- [codex-adapter.ts](../packages/daemon/src/adapters/codex-adapter.ts)
- [antigravity-adapter.ts](../packages/daemon/src/adapters/antigravity-adapter.ts)

---

## 2. Reproducible Security Invariant (Zero API Keys)

All local spike probes and daemon subprocesses strip `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, and `GOOGLE_API_KEY` case-insensitively before execution (`EnvSanitizer` and `buildSanitizedEnv`):

```sh
pnpm run spike:probe
```

The command emits a JSON report listing installed CLIs, detected capability flags from `--version` / `--help`, and `strippedBillingKeys` confirming zero billing credentials leaked into child processes.

---

## 3. Recorded Rate-Limit and Streaming Fixtures (`v0.1`–`v1.0` CI)

Deterministic fixtures live in [cli-fixtures.ts](../packages/daemon/src/adapters/fixtures/cli-fixtures.ts) and are validated by [cli-adapters.test.ts](../packages/daemon/src/adapters/cli-adapters.test.ts):

- **Claude (`CLAUDE_RATE_LIMIT_FIXTURE`):**
  - Input line: `{"type":"result","is_error":true,"result":"Rate limit exceeded. Retry after 300s (resets 2026-11-27T08:00:00.000Z)."}`
  - Normalized output: `rate_limit` event with `retryAfterSeconds: 300` and `resetAt: 2026-11-27T08:00:00.000Z`.
- **Codex (`CODEX_RATE_LIMIT_FIXTURE`):**
  - Input line: `{"type":"turn.failed","error":{"message":"429 Too Many Requests: quota exceeded until 2026-11-27T09:00:00.000Z"}}`
  - Normalized output: `rate_limit` event with parsed `resetAt` timestamp routed into `ProviderCooldownTracker`.
- **Antigravity (`AGY_JSONL_FIXTURE` / `AGY_PLAINTEXT_FIXTURE`):**
  - Supports structured JSONL (`thinking_delta`, `tool_use`, `tool_result`, `text_delta`, `usage`, `done`) with resilient plaintext fallback.
