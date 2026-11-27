# Orchdeck Adapter SDK Guide

This guide explains how contributors can add a fourth CLI engine adapter to Orchdeck while preserving full TypeScript strictness, subscription-only execution (zero API-key leakage), hard `main` branch protection, and deterministic CI testing via `MockAdapter`.

---

## 1. Register the Engine in Shared Contracts (`packages/shared`)

1. Add the new `ProviderId` literal in [packages/shared/src/adapter.ts](packages/shared/src/adapter.ts):
   - Update `ProviderId` union and `PROVIDER_IDS` array.
   - Update `isProviderId(value: string)` to accept the new provider ID.
2. Define canonical model handles `<provider>:<model_id>[:<reasoning_effort>]` parsed by `parseModelHandle` and formatted with `formatModelHandle`.

---

## 2. Implement `ProviderAdapter` in the Core Daemon (`packages/daemon`)

Create `packages/daemon/src/adapters/<provider>-adapter.ts` implementing `ProviderAdapter` from `@orchdeck/shared`:

```ts
export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly pinnedCliVersionRange: string;

  healthCheck(): Promise<ProviderHealthCheck>;
  listModels(): Promise<readonly ModelDescriptor[]>;
  startSession(opts: SessionOptions): Promise<AdapterSession>;
  sendTurn(sessionId: string, input: TurnInput): AsyncIterable<NormalizedEvent>;
  cancel(sessionId: string): Promise<void>;
}
```

### Mandatory Security and Subprocess Rules

1. **No raw shells:** Launch the CLI binary with `spawnManagedProcess` (`packages/daemon/src/ipc/process-tree.ts`), which enforces `shell: false`, explicit `argv` arrays, Win32 Job Object assignment on Windows, and detached process-group teardown on POSIX.
2. **Billing Key Stripping:** Wrap environment overrides with `EnvSanitizer` (`buildSanitizedEnv`) so `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, and uppercase/lowercase variants are never forwarded unless explicitly configured otherwise.
3. **Subprocess Git Shim:** Prepend the Orchdeck `git` shim directory onto `PATH` so subprocess calls blocking `git push`, `git checkout main`, or `git switch main` are intercepted safely.
4. **Role & Read-Only Enforcement:** Respect `SessionOptions.role` (`planner`, `builder`, `reviewer`) and `SessionOptions.approvalMode` (`plan`, `architect`, `express`, `branch_pilot`).

---

## 3. Normalize Output Streams into `NormalizedEvent`

Parse headless stdout JSONL line-by-line and yield strict `NormalizedEvent` variants:

- `text_delta` / `thinking_delta`: incremental output scrubbed before persistence or rendering.
- `tool_use` / `tool_result`: compact tool invocation summaries.
- `usage`: `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `durationMs` logged into SQLite `usage_events`.
- `rate_limit`: CLI-reported quota cooldown message, optional `resetAt` ISO timestamp, and `retryAfterSeconds`.
- `status` (`starting` | `running` | `verifying` | `cancelled`), `error`, and `done`.

---

## 4. Register and Verify with Deterministic `MockAdapter` Tests

1. Export the new adapter and argument builder helpers from `packages/daemon/src/index.ts`.
2. Register the adapter instance inside `AdapterRegistry` (`packages/daemon/src/adapters/adapter-registry.ts`) and desktop startup wiring.
3. Add recorded CLI fixture tests covering argument construction (`build<Provider>Args`), semver probing, rate-limit detection, and contract parity with `MockAdapter` (`packages/daemon/src/adapters/mock-adapter.ts` and `packages/daemon/src/adapters/mock-adapter.test.ts`).
4. Run the full verification checks locally before opening a Pull Request targeting `dev`:

```sh
pnpm run lint
pnpm run security:check
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run verify:sdk
```
