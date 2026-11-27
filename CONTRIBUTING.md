# Guía de Contribución — Pauta

¡Gracias por contribuir a **Pauta**! Antes de abrir un Pull Request, revisa estas reglas de flujo y calidad.

---

## Flujo de Ramas

- **`dev` (rama por defecto):** aquí ocurre toda la integración diaria. Crea tu rama desde `dev`:
  - `feat/<area>-<descripcion>`
  - `fix/<area>-<descripcion>`
  - `docs/<descripcion>`
  - `chore/<descripcion>`
- **`main` (rama estable):** refleja únicamente releases etiquetados (`vX.Y.Z`). Solo recibe Pull Requests de release desde `dev` (o `hotfix/*` con back-merge inmediato a `dev`).
- **Estrategia de merge:** `Squash & Merge` hacia `dev`; `Merge commit` limpio de `dev` → `main` para mantener trazabilidad de releases.

---

## Convenciones de Commits

Usamos **Conventional Commits**:
- `feat(adapter-claude): ...`
- `fix(approvals): ...`
- `docs(design): ...`
- `chore(ci): ...`

---

## Reglas Clave de Desarrollo

1. **Tests sin quemar suscripciones:** toda suite de CI y tests unitarios de adaptadores debe correr contra `MockAdapter` y fixtures reales grabados. Nunca hagas depender los tests de credenciales activas en GitHub Actions.
2. **Operaciones Git:** toda operación sobre repositorios en el Core Daemon debe invocar el binario `git` del sistema mediante `GitService`. No introduzcas librerías `libgit2` para escritura.
3. **Sistema de Diseño:** respeta los tokens y prohibiciones de [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md). Evita colores Tailwind crudos (`indigo-*`, `purple-*`, `slate-*`) o estética genérica.
4. **Guardrails de seguridad:** cualquier cambio en adaptadores, MCP o modos de aprobación debe verificar que se mantiene la sanitización de API keys y el bloqueo de escritura en `main`.
