# Design System — Orchdeck (*Precision Editorial Workbench*)

Orchdeck is designed as an **instrument for directing, reading, and proofing changes**, not a cluttered IDE or futuristic SaaS dashboard.

---

## 1. Anti-AI-Slop Manifesto (Strict Prohibitions)

The following visual clichés are banned across the entire UI codebase:
1. Neon purple/cyan/blue gradients (`from-indigo-500 to-purple-500`, `bg-clip-text`) and blue-tinted dark backgrounds (`#0B0F19`, `#0F172A`).
2. Gratuitous glassmorphism (`backdrop-blur-xl` stacked over glowing orbs or halos).
3. Padded bento-boxes with oversized tinted shadows (`shadow-purple-500/20`).
4. Cliché AI icons (sparkles, rocket, brain, magic wands) and generic unstyled `Lucide` icon defaults.
5. Anxious animations (pulsing rings, bouncing avatars, artificial typewriter delays).
6. Pastel `rounded-full` pill soup scattered across every panel.
7. Marketing empty states (*"What are we building today?"* with 4 identical prompt cards).
8. Untouched `shadcn/ui` default themes or raw Tailwind palette utilities (`indigo-*`, `purple-*`, `slate-*`).

**What replaces it:** subtle luminance separation with crisp `1px` borders (*Things 3 / Bear*), disciplined monochrome with strictly semantic color (*Linear*), editorial reading measure (*iA Writer*), and native desktop ergonomics (*Raycast / Zed / Panic Nova*).

---

## 2. Visual Identity & Color Tokens

### Aesthetic Philosophy: *Paper & Ink* (Light) · *Graphite & Vermilion* (Dark)

#### Light Mode — *Paper & Ink*
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `--bg-canvas` | `#F6F4EE` | Primary canvas (warm cotton paper) |
| `--bg-sidebar` | `#EDEAE2` | Sidebar and structural bars |
| `--bg-surface` | `#FCFBF8` | Change Cards, composer, popovers |
| `--bg-inset` | `#E6E2D8` | Recessed inputs and inline code |
| `--border-subtle` | `#DFD9CD` | `1px` structural hairlines |
| `--border-strong` | `#C9C1B2` | Interactive borders and hover states |
| `--text-primary` | `#1B1916` | Warm charcoal ink |
| `--text-secondary` | `#5C564D` | Metadata and descriptions |
| `--text-tertiary` | `#8C8478` | Timestamps, placeholders, line numbers |
| `--accent` | `#C4492D` | Printer's vermilion (primary CTA, active focus) |
| `--accent-hover` | `#A93B22` | Accent hover |
| `--accent-soft` | `#F4E4DF` | Subtle active tint |

#### Dark Mode — *Graphite & Vermilion*
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `--bg-canvas` | `#151412` | Warm neutral charcoal (zero blue tint) |
| `--bg-sidebar` | `#100F0D` | Navigation depth |
| `--bg-surface` | `#1D1B18` | Cards & composer (`inset 0 1px 0 rgba(255,248,235,0.05)`) |
| `--bg-inset` | `#12110F` | Code blocks and recessed inputs |
| `--border-subtle` | `#2B2824` | Crisp dividers |
| `--border-strong` | `#3E3933` | Hover borders and key splits |
| `--text-primary` | `#ECE8E0` | Rested ivory text |
| `--text-secondary` | `#A39C90` | Secondary text |
| `--text-tertiary` | `#6E685E` | Metadata and diff context |
| `--accent` | `#DF684B` | Calibrated vermilion (AA contrast) |
| `--accent-hover` | `#EA7A5E` | Accent hover |
| `--accent-soft` | `#2D1C17` | Subtle tint |

#### Semantic Diff & Verification Tokens
- **Added / Tests Pass:** Light text `#266644` · bg `#E5F1EA` | Dark text `#63B888` · bg `#15251D`
- **Removed / Tests Fail:** Light text `#B03636` · bg `#F7E6E6` | Dark text `#E06B6B` · bg `#2A1717`
- **Attention / Express Mode / Cooldown:** Light text `#9E6319` · bg `#F6EDE0` | Dark text `#D99A46` · bg `#282014`

#### Geometric Engine Marks (`7px`, never full painted bubbles)
- `●` **Claude:** `#C46B48` (terracotta ochre)
- `■` **Codex:** `#3F7D68` (technical pine green)
- `◆` **Antigravity:** `#55698F` (slate blue)

---

## 3. Typography, Grid & Radii

- **UI & Conversation:** `IBM Plex Sans` (`14px / 1.58` reading, `12.5px / 1.35` chrome).
- **Code, Diffs, Paths, Branches & Counters:** `IBM Plex Mono` (`11.5px`) with `font-variant-numeric: tabular-nums`.
- **Editorial Accent:** `Newsreader` (serif) reserved exclusively for project titles on home/session summaries.
- **4px Grid & Architectural Radii:** windows/modals `10px`, cards/composer `8px`, buttons/inputs `6px`, technical chips/badges `4px` (rectangular file-tab style, never `rounded-full`).

---

## 4. Key Components

1. **2-Column Layout + On-Demand Drawer:**
   - Unified titlebar (`40px`): sidebar toggle, `repo / branch` breadcrumb, quiet quota marks (`● ■ ◆`), and right Plugins/Inspector drawer toggle.
   - Left sidebar (`236px`, `Cmd+\`): linked repositories with monospace branch name and activity-sorted chats; fixed footer for Recipes, Plugins, and Settings.
   - Central workbench (`740px` reading column / `800px` cards).
2. **Change Card (*Review Sheet*):**
   - Header (`38px`): semantic change title, tabular `git diff --stat`, and clickable test seal (`✓ 14/14 · 1.2s` / `✕ 1 failing`).
   - Progressive body: clean file table with 5-segment `+`/`-` micro-bar; clicking or pressing `Space` expands an inline unified **Shiki** diff (custom *Paper & Ink* / *Graphite & Vermilion* themes). `v0.2` adds line-anchored inline review comments.
   - Action bar: **Approve & Commit** (`Cmd+Enter`), **Request Changes**, and **Discard** (backed by temporary stash/reflog safety net).
3. **Unified Model & Fusion Picker (`Cmd+M`):** single compact trigger in the composer (`● Opus` or `◫ Recipe: Core Trio`) switching between *Single Engine* and *Team Recipes (Plan / Implement / Review)*. Team Mode stays in a single linear thread with a collapsible handoff log.
4. **Approval Mode Trigger (`Shift+Tab`):** compact composer selector with peripheral signaling (`2px` amber top border for *Express*; `2px` vermilion border + isolated branch chip for *Branch Pilot*) and fixed footer: *"No mode writes to `main`"*.
5. **Second Opinion Card (`v0.2`):** `800px` embedded card with 2 `read_only` columns (`● A` | `■ B`) and resolution bar (`Continue with A`, `Continue with B`, `Synthesize both`).
6. **Plugins Drawer (`Cmd+Shift+P`, `v0.2–v0.3`):** `340px` right drawer with `All · Claude · Codex · Antigravity · MCP` filters and explicit separation between *Installed* and *Active in this repo*.
7. **Honest Usage/Quota Widget (`v0.2`):** quiet neutral `● ■ ◆` marks in rest state (turning amber with a real countdown only when a CLI reports cooldown); popover displays hard status, verified `tabular-nums` counters, and 4 *Local Calibration* pressure blocks.

---

## 5. UI Stack

- **Core:** React 19 + TypeScript + Vite + Tailwind CSS v4 (`@theme` semantic tokens; lint rule blocking raw palette colors).
- **Primitives:** Base UI (`@base-ui-components/react`) or unstyled Radix UI Primitives.
- **Shortcuts & Command Palette:** `cmdk` + `tinykeys` (`Cmd+K`, `Cmd+M`, `Cmd+Enter`, `Cmd+\`, `Shift+Tab`).
- **Diffs & Markdown:** `Shiki` + virtualized diff viewer + `react-markdown` + `remark-gfm`.
- **Icons & Motion:** `Phosphor Icons` (`weight="regular"`, `1.5px`) + custom geometric marks; crisp transitions (`120ms cubic-bezier(0.2, 0, 0, 1)`), zero bouncy springs.
