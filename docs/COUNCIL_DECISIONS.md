# Decisiones del Council — Pauta

Este documento registra el resultado del proceso de **Council** (Fase 1 de análisis independiente con 3 consejeros especializados + Fase 2 de revisión cruzada ciega y convergencia) para definir el nombre, la arquitectura, la identidad visual, el modelo de permisos y el roadmap de la aplicación.

---

## 1. Elección de Nombre: **Pauta**

Se evaluaron propuestas de los 3 consejeros verificando colisiones reales en GitHub y en el ecosistema de herramientas de IA para desarrollo.

### Candidatos descartados por colisión existente
`Batuta` (`batuta-ai/batuta`, `paiml/batuta`), `Trama` (`NaNhkNaN/trama`, `nicchia-code`), `Torno` (`luisg0nc/torno`), `Skein` (`Balanov/skein`, `tryskein/skein`), `Keel` (`berkayturanci/keel`, `codejunkie99/keel`), `Lintel` (`jokerman89/lintel`, `shakibbinkabir/lintel`), `Cantor` (`CantorAI Inc.`), `Rondel` (`xelfiera-shn/rondel`), `Vireo` (`twitter/vireo`).

### Votación final sobre los 6 nombres limpios
Sistema de puntos: `#1 = 3 pts`, `#2 = 2 pts`, `#3 = 1 pt`.

| Candidato | Consejero 1 (Arquitectura) | Consejero 2 (Diseño) | Consejero 3 (Producto) | Total |
| :--- | :---: | :---: | :---: | :---: |
| **Pauta** | #3 (1 pt) | #1 (3 pts) | #1 (3 pts) | **7 pts (Ganador)** |
| **Trenza** | #1 (3 pts) | — | #3 (1 pt) | **4 pts** |
| **Aplomo** | — | #2 (2 pts) | #2 (2 pts) | **4 pts** |
| **Dovela** | #2 (2 pts) | #3 (1 pt) | — | **3 pts** |
| **Tornel** | — | — | — | 0 pts |
| **Tasto** | — | — | — | 0 pts |

**Por qué ganó `Pauta`:**
- Condensa en 5 letras (sin tildes ni caracteres especiales, limpia en terminal y URLs) las dos metáforas centrales del producto: el pentagrama que coordina múltiples voces/modelos en compás y la retícula editorial de precisión para revisar cambios.
- Encaja de forma natural tanto en español como en inglés y refuerza la estética *«Taller Editorial de Precisión»*.

---

## 2. Veredictos Técnicos y de Producto

### A. Stack de Escritorio
- **Decisión:** **Electron + Core Daemon Local Desacoplado** (Node.js/TypeScript + JSON-RPC 2.0 sobre Named Pipe en Windows / Unix Domain Socket en macOS + SQLite en modo WAL) + micro-helper Win32 (`Job Objects` con `KILL_ON_JOB_CLOSE`) para evitar procesos zombis de CLIs o MCPs hijos.
- **Git:** invocar siempre el binario `git` del sistema con argumentos seguros y entorno sanitizado; prohibido usar `libgit2`/`nodegit` para escritura por problemas históricos con worktrees, firmas y hooks.
- **Alternativa descartada (Tauri v2):** descartado en v1 para evitar doble stack Rust/TS, puente IPC constante con el ecosistema TypeScript/MCP y divergencias de renderizado entre WebView2 y WKWebView en diffs largos. El daemon desacoplado permite cambiar el cascarón en el futuro sin reescribir el motor.

### B. Identidad Visual (Anti-AI-Slop)
- **Decisión:** Filosofía **«Taller Editorial de Precisión»** (*Algodón y Tinta* en claro + *Grafito Cálido y Bermellón* en oscuro), fijada desde `v0.1`.
- **Prohibiciones:** cero gradientes púrpura/neón, cero glassmorphism gratuito, cero emojis cliché (`✨`, `🚀`, `🧠`), cero Lucide default sin criterio ni temas por defecto de `shadcn/ui`.
- **Stack UI:** React 19 + TypeScript + Vite + Tailwind CSS v4 + Base UI/Radix + Shiki (con dos temas propios) + Phosphor Icons + `cmdk`.

### C. Modos de Aprobación
- **Decisión:** **4 modos ortogonales** (`Plan`, `Arquitecto` [default], `Relámpago`, `Piloto en Rama`) bajo un invariante duro aplicado en el daemon (nunca delegado al prompt): **ningún modo escribe en `main` ni ejecuta `git push` sin acción explícita del usuario**, y todo commit generado tras aprobar lleva exclusivamente la identidad `git config` del usuario.
- **Rollout:** arquitectura diseñada para los 4 modos desde el día 1; `v0.1` expone `Arquitecto` y `Relámpago` para acotar QA, y `v0.2` completa `Plan` y `Piloto en Rama`.

### D. Fusión de Modelos
- **Decisión:** **Handles canónicos + Recetas de 3 slots + Handoff Packet determinista** (sin editor visual de DAGs complejos).
- Formato de modelo: `<provider>:<model_id>[:reasoning_effort]` (ej. `antigravity:gemini-4-neon`, `codex:gpt-5-codex`, `claude:opus-4-6`).
- Cada receta asigna 3 roles (`Planifica`, `Implementa`, `Revisa`), admite override inline por turno (`@neon`, `@codex`, `@opus`) y conserva la conversación en un único hilo lineal.
- En `v0.2` se añade la tarjeta embebida **Second Opinion** (2 modelos en modo `read_only` lado a lado dentro del mismo hilo).

### E. Plugins, Skills y MCPs
- **Decisión:** **Cero reimplementación de runtimes propietarios.**
- **Etapas:**
  1. `v0.1`: **Native Passthrough 100%** (los CLIs corren con sus plugins/MCPs ya configurados en el entorno local).
  2. `v0.2–v0.3`: **Drawer Inspector + Switchboard** (inventario unificado de plugins/MCPs + portabilidad de `SKILL.md` entre motores).
  3. `v0.3`: **Local MCP Hub** (proxy agregador con deduplicación de instancias compartidas y Policy Gate para herramientas mutantes).

### F. Tracking de Uso y Cuotas
- **Decisión:** **Transparencia estricta (cero porcentajes inventados, cero scraping de cookies web).**
- Se registra telemetría verificable desde streams/JSONL locales (tokens, caché, turnos, duración, eventos reales de rate-limit/cooldown) en ventanas deslizantes de 5h y 7d.
- En la UI (`v0.2`): 3 signos discretos (`● ■ ◆`) en la barra superior + popover con estado duro (`Disponible` / `Enfriando`), actividad verificada y 4 bloques de presión estimada mediante **calibración empírica local** (cuando ocurre un rate-limit real, el volumen acumulado en esa ventana sirve como techo de referencia).

### G. Alcance de `v0.1`
- **Decisión:** `v0.1` debe incluir el **contrato común para los 3 adaptadores** (Claude Tier 1, Codex Tier 1, Antigravity Tier 1/Beta según capacidades del CLI) para que el producto nazca fiel a su promesa multi-motor y no como otro wrapper de un solo agente. Worktrees paralelos, UI de plugins, comentarios inline y UI de cuotas pasan a `v0.2`–`v0.3`.
