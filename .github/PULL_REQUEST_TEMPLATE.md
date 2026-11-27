## Resumen

Describe brevemente qué resuelve este PR y cómo se conecta con el roadmap de Pauta.

- Issue relacionado: #

## Tipo de cambio

- [ ] `feat` (nueva funcionalidad)
- [ ] `fix` (corrección de bug)
- [ ] `adapter` (cambios en Claude / Codex / Antigravity)
- [ ] `docs` / `chore`

## Checklist de arquitectura y seguridad

- [ ] Si toca el Core Daemon o adaptadores, mantiene la sanitización de variables de API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`).
- [ ] Ningún camino de ejecución permite escritura o `push` directo a `main` / ramas protegidas.
- [ ] Los tests de adaptador corren con `MockAdapter` / fixtures sin consumir cuotas reales.
- [ ] Si modifica UI, respeta los tokens de `docs/DESIGN_SYSTEM.md` (sin colores crudos ni estética genérica).
- [ ] El PR apunta a la rama `dev` (salvo PRs de release hacia `main`).
