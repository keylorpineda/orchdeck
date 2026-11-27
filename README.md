# Pauta

> Una sola mesa de trabajo de escritorio para dirigir **Claude Code**, **Codex** y **Antigravity** juntos en tus repositorios locales, usando tus propias suscripciones y sin pagar por token.

---

### Estado de ramas y desarrollo

- **Rama por defecto (`dev`):** desarrollo activo diario e integración vía Pull Requests (`Squash & Merge`).
- **Rama estable (`main`):** refleja únicamente releases estables etiquetados desde `dev`.
- **Estado actual:** `Fase 0 — Diseño, Arquitectura y Spike de CLIs`.

---

## El problema

Trabajar con **Claude Code**, **Codex CLI** y **Antigravity** hoy implica tres ventanas separadas, tres historiales aislados y tres límites de cuota independientes. Si quieres que un modelo planifique y otro implemente o audite, terminas copiando y pegando contexto entre terminales y revisando diffs a mano sin memoria compartida del proyecto.

## La solución

**Pauta** es una app de escritorio centrada en la conversación —**no es un IDE**— donde tú diriges el trabajo y los agentes editan directamente tus repositorios locales a través de sus **CLIs oficiales** y tus sesiones ya autenticadas:

- **Proyectos y chats como en Claude:** sidebar con tus repositorios locales vinculados y su historial persistente de hilos en SQLite.
- **Selector y Fusión de Modelos (Recetas):** elige un modelo específico por turno (`antigravity:gemini-4-neon`, `codex:gpt-5-codex`, `claude:opus-4-6`) o activa una **Receta de 3 slots** (*Planifica → Implementa → Revisa*) con menciones inline (`@neon`, `@codex`, `@opus`) y tarjeta *Second Opinion* lado a lado.
- **4 Modos de Aprobación con protección dura de `main`:** `Plan`, `Arquitecto` (default), `Relámpago` y `Piloto en Rama`. Ningún agente puede hacer `commit` ni `push` a `main` sin tu aprobación explícita.
- **Tarjetas de Cambios (sin editor):** cada entrega aparece como una hoja de revisión con archivos modificados, diff con Shiki, resultado de tests configurables y 3 acciones: **Aprobar** (commit limpio con tu identidad git, sin co-autores), **Pedir cambios** o **Descartar**.
- **Plugins y Skills multi-app por etapas:** ejecución nativa inmediata en v0.1 (*Native Passthrough*), *Drawer Inspector + Switchboard* y portabilidad de `SKILL.md` en v0.2, y *Local MCP Hub* con deduplicación y Policy Gate en v0.3.
- **Radar honesto de Uso y Cuotas:** 3 signos discretos (`● ■ ◆`) en la barra superior + popover con estado duro (`Disponible` / `Enfriando`), telemetría local verificada (ventanas 5h/7d) y presión estimada por calibración empírica (cero porcentajes inventados ni scraping).
- **Paralelismo seguro y memoria del proyecto:** aislamiento en `git worktrees` por tarea paralela, memoria compartida por repo (`AGENTS.md` / `CLAUDE.md`) y relevo con 1 clic mediante *Handoff Packet* determinista cuando cambia el modelo o se agota una cuota.

---

## Matriz de soporte de motores

| Marca | Motor | CLI oficial | Estado objetivo |
| :---: | :--- | :--- | :--- |
| `●` | **Claude** | `claude` (Claude Code) | Tier 1 — `v0.1` |
| `■` | **Codex** | `codex` (OpenAI Codex CLI) | Tier 1 — `v0.1` |
| `◆` | **Antigravity** | `agy` (Antigravity CLI) | Tier 1 / Beta — `v0.1` |

---

## Documentación del proyecto

- [Decisiones del Council](docs/COUNCIL_DECISIONS.md) — Acta completa de arquitectura, diseño, alcance y elección del nombre **Pauta**.
- [Arquitectura](docs/ARCHITECTURE.md) — Electron + Core Daemon desacoplado, `ProviderAdapter`, modos de aprobación, fusión, plugins y telemetría.
- [Sistema de Diseño](docs/DESIGN_SYSTEM.md) — Identidad *«Taller Editorial de Precisión»*, manifiesto anti-AI-slop, tokens light/dark y especificaciones de UI.
- [Roadmap](docs/ROADMAP.md) — Fases desde `Fase 0` hasta `v1.0` y lista explícita de *Non-Goals*.
- [Seguridad](SECURITY.md) — Sanitización de API keys, aislamiento de ramas y política de no-scraping.
- [Guía de Contribución](CONTRIBUTING.md) — Flujo `feat/* → dev → main`, Conventional Commits y tests con `MockAdapter`.
