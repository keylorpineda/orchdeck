# Política de Seguridad — Pauta

Pauta orquesta agentes de CLI locales que leen código, ejecutan comandos en repositorios y operan sobre tus suscripciones autenticadas. La seguridad se diseña como **controles técnicos en el Core Daemon**, nunca como simples instrucciones en un prompt.

---

## Modelo de Amenazas y Controles Obligatorios

1. **Cero cobro inesperado por tokens (Sanitización de entorno):**
   - Antes de lanzar cualquier subproceso CLI (`claude`, `codex`, `agy`), el Daemon elimina del entorno variables de facturación por API como `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY` (y una lista extensible por el usuario).
2. **Protección dura de `main` y ramas protegidas:**
   - Ningún agente ejecuta ediciones sobre `main` (o ramas protegidas configurables). Toda escritura ocurre en una rama de tarea (`agent/<slug>`) o en un `git worktree` aislado.
   - `git push` y `git checkout` hacia ramas protegidas se bloquean en el `git shim` del `PATH` del subproceso.
3. **Separación de roles y verificación post-turno:**
   - Los roles de planificación y revisión (`Planner`, `Reviewer`) corren en modo `read_only`. Si un proceso en rol de solo lectura modifica archivos del árbol de trabajo, el Daemon aborta el turno y revierte el cambio.
4. **Limpieza de procesos hijos:**
   - En Windows, cada CLI corre dentro de un `Job Object` (`KILL_ON_JOB_CLOSE`) para evitar procesos zombis de servidores MCP o comandos en segundo plano al cancelar o cerrar la app.
5. **Protección de credenciales y cero scraping:**
   - Pauta **no** lee cookies del navegador, **no** realiza scraping de endpoints web privados de cuotas y **no** almacena secretos resueltos de configuraciones MCP en SQLite (solo referencias a variables/archivos).

---

## Reportar una Vulnerabilidad

Si encuentras un fallo que permita saltar el bloqueo de ramas protegidas, filtrar variables de entorno/secretos o ejecutar comandos no autorizados en modo `Plan` / `Arquitecto`, **no abras un issue público**.

Abre un **GitHub Security Advisory** privado en el repositorio `keylorpineda/pauta` con los pasos de reproducción, versión del sistema operativo y CLI afectado.
