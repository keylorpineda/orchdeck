# Sistema de Diseño — Pauta (*Taller Editorial de Precisión*)

Pauta está diseñada como un **instrumento de dirección, lectura y revisión de pruebas**, no como un IDE recargado ni un dashboard futurista.

---

## 1. Manifiesto Anti-AI-Slop (Prohibiciones Estrictas)

Para evitar la estética genérica de plantilla generada por IA, quedan prohibidos en todo el código UI:
1. Gradientes neón púrpura/cian/azul (`from-indigo-500 to-purple-500`, `bg-clip-text`) y fondos oscuros azulados (`#0B0F19`, `#0F172A`).
2. Glassmorphism gratuito (`backdrop-blur-xl` sobre halos de luz o orbes decorativos).
3. Bento-boxes acolchados con sombras gigantes teñidas (`shadow-purple-500/20`).
4. Iconografía cliché de IA (`✨`, `🚀`, `🧠`, varitas mágicas) y uso de `Lucide` default sin personalidad.
5. Animaciones ansiosas (anillos pulsantes, avatares rebotando, efecto máquina de escribir artificial).
6. Sopa de pills `rounded-full` en colores pastel por toda la interfaz.
7. Estados vacíos de marketing (*"¿Qué vamos a construir hoy?"* con 4 tarjetas genéricas).
8. Temas por defecto sin personalizar de `shadcn/ui` o colores crudos de Tailwind (`indigo-*`, `purple-*`, `slate-*`).

**Reemplazo:** separación tonal sutil por luminancia + bordes `1px` nítidos (estilo *Things 3 / Bear*), monocromía disciplinada con color estrictamente semántico (*Linear*), medida editorial de lectura (*iA Writer*) y densidad ergonómica nativa (*Raycast / Zed / Panic Nova*).

---

## 2. Identidad Visual y Tokens de Color

### Filosofía: *Paper & Ink* (Claro) · *Graphite & Vermilion* (Oscuro)

#### Modo Claro — *Algodón y Tinta*
| Token | Hex | Uso |
| :--- | :--- | :--- |
| `--bg-canvas` | `#F6F4EE` | Lienzo principal (papel prensado cálido) |
| `--bg-sidebar` | `#EDEAE2` | Sidebar y barras estructurales |
| `--bg-surface` | `#FCFBF8` | Tarjetas de cambios, composer, popovers |
| `--bg-inset` | `#E6E2D8` | Campos hundidos, código inline |
| `--border-subtle` | `#DFD9CD` | Hairline `1px` estructural |
| `--border-strong` | `#C9C1B2` | Bordes interactivos y hover |
| `--text-primary` | `#1B1916` | Tinta carbón cálida |
| `--text-secondary` | `#5C564D` | Metadata y descripciones |
| `--text-tertiary` | `#8C8478` | Timestamps, placeholders, números de línea |
| `--accent` | `#C4492D` | Bermellón de imprenta (CTA primario, foco) |
| `--accent-hover` | `#A93B22` | Hover del acento |
| `--accent-soft` | `#F4E4DF` | Selección sutil |

#### Modo Oscuro — *Grafito Cálido y Bermellón*
| Token | Hex | Uso |
| :--- | :--- | :--- |
| `--bg-canvas` | `#151412` | Carbón neutro cálido (cero tinte azulado) |
| `--bg-sidebar` | `#100F0D` | Profundidad de navegación |
| `--bg-surface` | `#1D1B18` | Tarjetas y composer (`inset 0 1px 0 rgba(255,248,235,0.05)`) |
| `--bg-inset` | `#12110F` | Bloques de código y campos hundidos |
| `--border-subtle` | `#2B2824` | Separación nítida |
| `--border-strong` | `#3E3933` | Bordes en hover y divisores |
| `--text-primary` | `#ECE8E0` | Marfil descansado |
| `--text-secondary` | `#A39C90` | Texto secundario |
| `--text-tertiary` | `#6E685E` | Metadata y contexto |
| `--accent` | `#DF684B` | Bermellón calibrado (contraste AA) |
| `--accent-hover` | `#EA7A5E` | Hover del acento |
| `--accent-soft` | `#2D1C17` | Tint sutil |

#### Semánticos de Diff y Verificación
- **Añadido / Tests OK:** Light texto `#266644` · bg `#E5F1EA` | Dark texto `#63B888` · bg `#15251D`
- **Eliminado / Tests Fallidos:** Light texto `#B03636` · bg `#F7E6E6` | Dark texto `#E06B6B` · bg `#2A1717`
- **Atención / Modo Auto / Enfriando:** Light texto `#9E6319` · bg `#F6EDE0` | Dark texto `#D99A46` · bg `#282014`

#### Señales Geométricas por Motor (`7px`, nunca burbujas pintadas)
- `●` **Claude:** `#C46B48` (ocre terracota)
- `■` **Codex:** `#3F7D68` (verde pino técnico)
- `◆` **Antigravity:** `#55698F` (azul pizarra)

---

## 3. Tipografía, Densidad y Radios

- **UI y conversación:** `IBM Plex Sans` (`14px / 1.58` en lectura, `12.5px / 1.35` en chrome).
- **Código, diffs, rutas, ramas y contadores:** `IBM Plex Mono` (`11.5px`) con `font-variant-numeric: tabular-nums`.
- **Toque editorial puntual:** `Newsreader` (serif) reservada exclusivamente para títulos de proyecto en vista de inicio o cabeceras de resumen.
- **Grilla y radios arquitectónicos:** base estricta de `4px`; ventanas/modales `10px`, tarjetas/composer `8px`, botones/inputs `6px`, fichas técnicas/badges `4px` (rectangulares, sin `rounded-full`).

---

## 4. Componentes Clave

1. **Layout (2 columnas + Drawer bajo demanda):**
   - Barra de título unificada (`40px`): colapsar sidebar, breadcrumb `repo / rama`, signos discretos de cuotas (`● ■ ◆`) y toggle del drawer derecho de Plugins/Inspector.
   - Sidebar (`236px`, `Cmd+\`): proyectos con rama actual en mono y chats ordenados por actividad; pie fijo con accesos a Recetas, Plugins y Ajustes.
   - Lienzo central (`740px` lectura / `800px` tarjetas).
2. **Tarjeta de Cambios (*Hoja de Revisión*):**
   - Cabecera (`38px`): título semántico, `git diff --stat` en mono tabular y sello clicable de tests (`✓ 14/14 · 1.2s` / `✕ 1 fallo`).
   - Cuerpo progresivo: tabla limpia de archivos con micro-barra de 5 segmentos `+`/`-`; clic o `Espacio` despliega diff unificado con **Shiki** (temas propios *Paper & Ink* / *Graphite & Vermilion*). En `v0.2` se añaden comentarios inline anclados a línea.
   - Pie: **Aprobar y commitear** (`Cmd+Enter`), **Pedir cambios** y **Descartar** (con respaldo temporal en stash/reflog).
3. **Selector Único de Modelo y Fusión (`Cmd+M`):** un solo trigger compacto en el composer (`● Opus` o `◫ Receta: Trío Core`) con pestaña *Individual* y pestaña *Recetas (Planifica / Implementa / Audita)*. En Modo Equipo el hilo sigue siendo 100% lineal con una bitácora colapsable de relevos.
4. **Trigger de Modos de Aprobación (`Shift+Tab`):** selector limpio en el composer con línea superior periférica de `2px` en ámbar para *Relámpago* y bermellón + chip de rama para *Piloto en Rama*, más pie fijo: *«Ningún modo escribe en `main`»*.
5. **Tarjeta *Second Opinion* (`v0.2`):** tarjeta embebida de `800px` con 2 columnas `read_only` lado a lado (`● A` | `■ B`) y pie de resolución (`Seguir con A`, `Seguir con B`, `Sintetizar ambos`).
6. **Drawer de Plugins (`Cmd+Shift+P`, `v0.2–v0.3`):** panel derecho de `340px` con filtros `Todos · Claude · Codex · Antigravity · MCP` y separación clara entre *Instalados* y *Activos en este repo*.
7. **Widget Honesto de Uso/Cuotas (`v0.2`):** en reposo 3 signos neutros en la barra superior (ámbar con cuenta regresiva solo si un CLI reporta enfriamiento); al hacer clic, popover con estado duro, contadores verificados (`tabular-nums`) y 4 bloques de presión estimada (*Calibración local*).

---

## 5. Stack de UI

- **Core:** React 19 + TypeScript + Vite + Tailwind CSS v4 (`@theme` con tokens semánticos; regla de lint prohibiendo colores crudos).
- **Primitivas:** Base UI (`@base-ui-components/react`) o Radix UI Primitives sin estilos pre-cocinados.
- **Atajos y Command Palette:** `cmdk` + `tinykeys` (`Cmd+K`, `Cmd+M`, `Cmd+Enter`, `Cmd+\`, `Shift+Tab`).
- **Diffs y Markdown:** `Shiki` + visor virtualizado de diffs + `react-markdown` + `remark-gfm`.
- **Iconos y Movimiento:** `Phosphor Icons` (`weight="regular"`, `1.5px`) + marcas geométricas propias; transiciones secas (`120ms cubic-bezier(0.2, 0, 0, 1)`), sin rebotes elásticos.
