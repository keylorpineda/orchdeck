# Roadmap — Pauta

El plan está diseñado bajo la regla anti-vaporware: **`v0.1` debe ser lo bastante sólido para usarlo todos los días en construir `v0.2`.**

---

## Fase 0 — Spike Técnico y Fundaciones
**Objetivo:** eliminar incertidumbre sobre los CLIs oficiales antes de construir la UI.
- Validar invocación headless, streaming, selección de modelo, modos read-only y detección de rate-limit en `claude`, `codex` y `agy` sin API keys.
- Scaffolding del monorepo: Shell Electron + Core Daemon desacoplado (`JSON-RPC` + `SQLite WAL`) + micro-helper Win32 Job Objects.
- Definir contrato `ProviderAdapter`, `NormalizedEvent` y `MockAdapter` con fixtures para CI.
- Implementar sanitización de variables de entorno (`API_KEY`s) y `git shim` bloqueador de `commit`/`push`.

## `v0.1` — Daily Driver Multi-Motor
**Objetivo:** app usable todos los días con los 3 motores bajo contrato mínimo común, Tarjeta de Cambios y protección dura de `main`.
- Sistema de diseño *«Taller Editorial de Precisión»* (tokens light/dark, IBM Plex, Phosphor, marcas geométricas).
- CRUD de proyectos (repos git locales), sidebar de chats y persistencia en SQLite.
- Adaptadores con versión fijada y tests de contrato: **Claude Code** (Tier 1), **Codex CLI** (Tier 1) y **Antigravity CLI** (Tier 1/Beta), usando *Native Passthrough* para plugins.
- Hilo de chat en streaming con selector de motor/modelo por chat y atribución visual.
- **Tarjeta de Cambios:** diff con Shiki, comando de tests configurable por proyecto, **Aprobar** (commit limpio con identidad del usuario, sin co-autores), **Pedir cambios** y **Descartar**.
- Modos iniciales en UI: **Arquitecto** y **Relámpago** + registro silencioso de eventos de uso y rate-limits en SQLite.

## `v0.2` — Fusión, Modo Equipo, Cuotas y Worktrees
**Objetivo:** entregar la colaboración real entre modelos, el control fino de autonomía y el paralelismo seguro.
- **Recetas de Fusión (3 slots):** `Planifica → Implementa → Revisa`, más override táctico por turno (`@neon`, `@codex`, `@opus`).
- **Handoff Packet determinista** (`.pauta/handoff.md` vía `.git/info/exclude`) y relevo con 1 clic (manual y automático/asistido al detectar cuota agotada).
- **Los 4 Modos de Aprobación completos:** `Plan`, `Arquitecto`, `Relámpago`, `Piloto en Rama` + verificación de permisos por rol (`read_only` vs `worktree_write`).
- **Tarjeta *Second Opinion*:** 2 modelos `read_only` lado a lado dentro del mismo hilo lineal.
- **Panel honesto de Uso y Cuotas:** signos en barra superior, telemetría verificada (5h/7d) y calibración empírica local.
- **Comentarios inline por línea** en Tarjetas de Cambios y **Git Worktrees opt-in** para tareas paralelas en un mismo proyecto.

## `v0.3` — Plugins Unificados y Memoria Compartida
**Objetivo:** visibilidad y control del ecosistema de las 3 apps y continuidad entre sesiones.
- **Drawer de Plugins (Inspector + Switchboard):** catálogo unificado de plugins/MCPs instalados vs activos por proyecto + portabilidad de `SKILL.md`.
- **Local MCP Hub:** proxy agregador con deduplicación de instancias con estado y Policy Gate de aprobaciones.
- **Memoria compartida del proyecto:** decisiones, convenciones y pendientes editables, con puente controlado hacia `AGENTS.md` y `CLAUDE.md`.

## `v1.0` — Inteligencia, Pulido y Ecosistema
**Objetivo:** recomendaciones basadas en datos reales y distribución estable.
- Registro de métricas por tarea (tasa de aprobación, iteraciones, duración) y **recomendador de modelo/receta** basado en historial real + heurísticas locales (sin gastar tokens extra en un router LLM).
- Empaquetado firmado (Windows/macOS), auto-updates y SDK documentado para nuevos adaptadores de la comunidad.

---

## Non-Goals (Fuera de alcance en v1)

- Editor de código completo o resolución visual avanzada de merge conflicts (Pauta no es un IDE).
- Terminal interactiva completa embebida como sustituto de tu shell.
- Cobro por tokens o integración con APIs de pago por uso como flujo principal.
- Scraping de cookies o endpoints web privados para leer cuotas de suscripción.
- Editor visual de grafos/workflows arbitrarios tipo n8n.
- Bases de datos vectoriales opacas para memoria cuando archivos Markdown estructurados + SQLite resuelven el problema con transparencia.
