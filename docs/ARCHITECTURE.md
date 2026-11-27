# Arquitectura Técnica — Pauta

## 1. Visión General por Capas

Pauta separa estrictamente la interfaz gráfica de la ejecución de procesos, el acceso al sistema de archivos y la manipulación de Git.

```text
+-------------------------------------------------------------------+
|  Shell UI (Electron Renderer: React 19 + Tailwind v4 + Shiki)     |
|  - Renderizado de hilos, Tarjetas de Cambios, Selectores, Popovers|
+---------------------------------+---------------------------------+
                                  | JSON-RPC 2.0 (Named Pipe / UDS)
                                  v
+-------------------------------------------------------------------+
|  Core Daemon (Node.js / TypeScript desacoplado + SQLite WAL)      |
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

### Principios estructurales
1. **Lógica fuera de `ipcMain`:** el proceso principal de Electron solo gestiona ventanas y ciclo de vida; toda la orquestación corre en el Core Daemon sobre `SQLite` en modo `WAL`.
2. **Operaciones Git vía binario oficial:** `GitService` invoca siempre el ejecutable `git` del sistema con argumentos explícitos (`--`, rutas normalizadas). Nunca se usan bindings tipo `libgit2` para escritura.
3. **Limpieza garantizada de árboles de procesos:** en Windows cada subproceso CLI corre dentro de un **Job Object** con `KILL_ON_JOB_CLOSE` (vía micro-helper nativo) para terminar también servidores MCP hijos y watchers si un turno se cancela o la app cierra.

---

## 2. Contrato `ProviderAdapter`

Cada CLI oficial se encapsula detrás de una interfaz común versionada y verificada en CI mediante un `MockAdapter` basado en fixtures reales:

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

### Stream normalizado (`NormalizedEvent`)
Todos los adaptadores traducen la salida nativa de su CLI a un conjunto único de eventos:
- `text_delta`: fragmento de respuesta del modelo.
- `thinking_delta`: traza de razonamiento (colapsable en UI).
- `tool_use` / `tool_result`: invocación de herramienta y resumen de salida.
- `usage`: tokens (`input`, `output`, `cache_read`, `cache_write`) y duración cuando el CLI los reporta.
- `rate_limit`: detección de cuota agotada y timestamp estimado de reinicio si el CLI lo expone.
- `status` / `error` / `done`.

---

## 3. Invariantes de Seguridad y Guardrails

Las reglas de seguridad **nunca dependen del prompt del sistema**; se imponen en el Daemon y en el entorno del subproceso:

1. **Sanitización de entorno (cero cobro por token):** antes de lanzar cualquier CLI, el Daemon filtra `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY` y cualquier variable configurada de billing por API, forzando el uso exclusivo de la sesión local de suscripción.
2. **Protección absoluta de `main`:** ningún agente trabaja sobre el checkout limpio cuando apunta a `main` (o ramas protegidas configurables como `master`, `release/*`). Toda escritura ocurre en una rama aislada (`agent/<task-slug>`) o en un `git worktree` dedicado.
3. **Git Shim en `PATH`:** el Daemon antepone un wrapper ligero de `git` en el `PATH` del subproceso que bloquea `git push`, `git commit` directo del agente (salvo commits internos controlados en modo *Piloto en Rama*), `git checkout main` y operaciones destructivas fuera del worktree.
4. **Commits limpios con tu identidad:** cuando el usuario aprueba una Tarjeta de Cambios, `GitService` ejecuta el commit usando `git config user.name` y `user.email` locales/globales del usuario, sin `Co-Authored-By`.
5. **Verificación de rol `read_only`:** si un rol de planificación o revisión (`Planner` / `Reviewer`) altera el árbol de trabajo pese a los flags de solo lectura del CLI, el Daemon revierte y aborta el turno con alerta.

---

## 4. Modos de Aprobación y Máquina de Estados

| Modo | Plan inicial | Ejecución en rama/worktree | Commit en rama | Merge a `main` / `push` |
| :--- | :--- | :--- | :--- | :--- |
| **1. Plan** | Solo lectura / estricto; confirma acciones sensibles | Solo lectura o confirmación por comando | Aprobación en Tarjeta | Acción explícita del usuario |
| **2. Arquitecto** *(Default)* | Aprobación obligatoria antes de editar | Autónomo en archivos y checks allowlisted | Aprobación en Tarjeta | Acción explícita del usuario |
| **3. Relámpago** | Auto-aprobado (visible en vivo) | Autónomo en rama/worktree con guardrails | Aprobación en Tarjeta única | Acción explícita del usuario |
| **4. Piloto en Rama** | Auto-aprobado | Autónomo con ciclos Builder → Tests → Reviewer | Auto-commit atómico en `agent/<slug>` | **Acción explícita obligatoria** |

> En `v0.1` se exponen **Arquitecto** y **Relámpago** en la UI para acotar QA; `v0.2` habilita los 4 modos completos.

```text
IDLE
  └─> PLANNING
        ├─[Plan | Arquitecto]──────> AWAITING_PLAN_APPROVAL
        │                              ├─(Approve)─> PREPARING_BRANCH
        │                              ├─(Revise)──> PLANNING
        │                              └─(Reject)──> CANCELLED
        └─[Relámpago | Piloto]─────> PREPARING_BRANCH

PREPARING_BRANCH ─> EXECUTING
  ├─[Plan / Policy Gate]────> AWAITING_ACTION_APPROVAL ─> EXECUTING | ABORTED
  ├─[Rate-limit / Cuota]────> QUOTA_HANDOFF (relevo 1-clic o fallback)
  └─[Turno finalizado]──────> VERIFYING (tests + Reviewer opcional)
        ├─[Reviewer REQUEST_CHANGES & iter < max]─> EXECUTING
        ├─[Piloto en Rama]────────────────────────> COMMITTED_ON_BRANCH
        └─[Plan | Arquitecto | Relámpago]─────────> AWAITING_FINAL_REVIEW
                                                      ├─(Approve)─────────> COMMITTED_ON_BRANCH
                                                      ├─(Request changes)─> EXECUTING
                                                      └─(Discard)─────────> DISCARDED

COMMITTED_ON_BRANCH ─(Acción explícita UI)─> MERGED_BY_USER
```

---

## 5. Fusión de Modelos y Protocolo de Handoff

1. **Model Handle canónico:** `<provider>:<model_id>[:reasoning_effort]` (ej. `antigravity:gemini-4-neon`, `codex:gpt-5-codex:high`, `claude:opus-4-6:max`).
2. **Recetas de 3 slots:**
   - `Planner` (`read_only`): define alcance, invariantes y archivos objetivo (`PlanSpec`).
   - `Builder` (`worktree_write`): implementa cambios y ejecuta suite de tests configurada.
   - `Reviewer` (`read_only`): audita `git diff` + output de tests y emite `APPROVE` o `REQUEST_CHANGES` (máximo configurable de iteraciones para evitar bucles).
3. **Override táctico por turno:** menciones inline (`@neon`, `@codex`, `@opus`) o selector rápido en el composer. Precedencia: `Mención explícita > Paso de Receta > Default del hilo`.
4. **Handoff Packet determinista:** al cambiar de modelo o relevar por cuota, nunca se reenvía el transcript completo. El Daemon genera `.pauta/handoff.md` (excluido localmente vía `.git/info/exclude` sin ensuciar `.gitignore`) con:
   - Objetivo de la tarea y memoria relevante del proyecto.
   - Decisiones tomadas y archivos tocados (`git diff --stat`).
   - Último resultado de tests/errores.
   - Siguiente paso concreto.

---

## 6. Plugins, Skills y MCPs por Etapas

1. **`v0.1` — Native Passthrough:** cada CLI corre en el entorno del usuario con sus plugins/MCPs ya instalados; cero reimplementación.
2. **`v0.2–v0.3` — Drawer Inspector + Switchboard:** descubrimiento pasivo (read-only) de configuraciones en `~/.claude/`, `~/.codex/`, `~/.gemini/antigravity/` y el repo actual. Permite activar/desactivar por workspace usando flags oficiales e inyectar/portar skills estándar (`SKILL.md`).
3. **`v0.3` — Local MCP Hub:** proxy agregador local (`127.0.0.1` con token efímero por sesión) para compartir una sola instancia de MCPs con estado entre los 3 motores, evitar doble registro y aplicar Policy Gate ante tools destructivos.

---

## 7. Telemetría de Uso y Calibración Empírica

Las suscripciones planas no exponen un endpoint oficial de cuota restante en tiempo real. Pauta evita cualquier estimación engañosa o scraping web:

- **Datos duros verificados:** eventos de rate-limit/cooldown reportados por los CLIs (con hora de reinicio cuando se imprime) y consumo local leído de streams/JSONL (`tokens`, `cache_read`, `turnos`, `duración`) en ventanas móviles de **5 horas** y **7 días**.
- **Calibración empírica:** cada vez que un proveedor alcanza un límite real en una ventana, el Daemon guarda ese volumen como techo observado (`calibrated_cap`) para mostrar una presión relativa honesta (*calibración local*).
