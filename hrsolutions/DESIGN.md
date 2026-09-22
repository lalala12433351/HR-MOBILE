---
name: Modern Corporate Blue
colors:
  canvas-bg: '#f3f3f9'
  canvas-bg-alt: '#f8fafc'
  surface-card: '#ffffff'
  surface-subtle: '#f1f5f9'
  surface-recessed: '#f8fafc'
  border-slate: '#e2e8f0'
  border-slate-soft: '#f1f5f9'
  border-slate-muted: '#e2e8f0'
  text-primary: '#0f172a'
  text-secondary: '#475569'
  text-muted: '#64748b'
  text-faint: '#94a3b8'
  primary: '#2563eb'
  primary-hover: '#1d4ed8'
  primary-soft: '#eff6ff'
  primary-ring: '#93c5fd'
  brand-navy: '#0f172a'
  brand-sky: '#38bdf8'
  ice-blue: '#eff6ff'
  ice-blue-container: '#e0f2fe'
  required-asterisk: '#f43f5e'
  status-success-text: '#047857'
  status-success-bg: '#d1fae5'
  status-warning-text: '#b45309'
  status-warning-bg: '#fef3c7'
  status-error-text: '#b91c1c'
  status-error-bg: '#fee2e2'
  status-absent-bg: '#0f172a'
  status-leave-bg: '#f1f5f9'
  status-leave-text: '#475569'
  overlay-scrim: 'rgba(0, 0, 0, 0.40)'
  overlay-scrim-strong: 'rgba(0, 0, 0, 0.60)'
  dark-canvas: '#0f0f12'
  dark-surface: '#121214'
  dark-surface-subtle: '#18181d'
  dark-border: '#282830'
  dark-text-secondary: '#9e9ea7'
typography:
  display-kpi:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  display-kpi-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  page-title:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.02em
  page-title-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  card-title:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.06em
  micro-caption:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
  mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
rounded:
  sm: 0.5rem
  DEFAULT: 0.75rem
  md: 0.75rem
  lg: 0.75rem
  xl: 0.75rem
  2xl: 1rem
  full: 9999px
spacing:
  space-2xs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.25rem
  space-xl: 1.5rem
  space-2xl: 2rem
  sidebar-width: 4.25rem
  card-padding: 1.25rem
  drawer-padding-x: 2rem
  drawer-padding-y: 1.5rem
  gutter-grid: 1rem
  module-gap: 1.5rem
shadows:
  card: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
  card-hover: '0 1px 3px 0 rgba(15, 23, 42, 0.08)'
  drawer: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
  primary-cta: '0 4px 6px -1px rgba(37, 99, 235, 0.20)'
  popover: '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)'
---

## Brand & Style

This design system documents the **shipped** HR / people-ops UI: a cool-toned corporate blue product on a soft lavender-slate canvas, white elevated cards, and slate structural chrome. It is optimized for dense operational surfaces—attendance, projects, dashboards, and approval workflows—without decorative noise.

### Core Philosophy
- **Operational clarity over ornament:** White cards, thin slate borders, and sapphire CTAs carry hierarchy. Avoid purple glow themes, cream/serif editorial looks, and dashboard clutter in hero regions.
- **Cool-tone ergonomics:** Canvas `#f3f3f9` / `#f8fafc`, slate borders `#e2e8f0`, and ice-blue active fills (`#eff6ff`) keep long sessions readable.
- **One primary action per toolbar:** Page headers pair a segmented view switcher with at most one solid sapphire CTA (e.g. **Add Task**) and optional outlined secondary actions (**Add Project**).
- **Text-first status:** Status is communicated with typography + tinted pill backgrounds. Prefer clean labels over decorative dots, pulsing pips, or stacked micro-tags. (Count badges on sub-nav tabs are functional, not decorative status dots.)
- **Drawer-first create/edit:** Creating or editing operational records (tasks, projects, regularizations, attendance edits) uses a **right slide-over drawer**, not a centered dialog—unless the flow needs a large interactive surface (maps, confirmations).

### Visual Style
Corporate modernism: soft app canvas → white modules → slate hairlines → sapphire interaction. Depth comes from borders + restrained shadows (`shadow-xs` / `shadow-card`), not heavy elevation stacks. Icons are Lucide, typically `h-4 w-4` / `h-5 w-5` with stroke weight `1.8`–`2.2`.

---

## Colors

### Brand & Interactive
| Token | Value | Usage |
|---|---|---|
| Primary Sapphire | `#2563eb` (`blue-600`) | Primary buttons, active sub-nav pills, active nav icons, links, selected calendar days |
| Primary Hover | `#1d4ed8` (`blue-700`) | Hover / pressed primary CTAs |
| Primary Soft | `#eff6ff` | Active sidebar nav fill, ice callouts, soft selected states |
| Deep Navy | `#0f172a` | Page titles, KPI numerals, Absent pills, Full-Time bar segment |
| Sky Accent | `#38bdf8` | Secondary chart / employment segments |

### Surfaces & Neutrals
| Token | Value | Usage |
|---|---|---|
| Canvas | `#f3f3f9` (body) / `#f8fafc` (light theme override) | App background behind cards |
| Card | `#ffffff` | Modules, drawers, tables, filter bars |
| Recessed | `#f8fafc` / `#f1f5f9` / `slate-50` | Search fields at rest, inset rows, empty states |
| Border | `#e2e8f0` / `slate-200` | Card edges, inputs, table rules |
| Soft Divider | `slate-100` | Drawer header/footer rules, inner card separators |
| Text Primary | `#0f172a` / `slate-900` | Titles, strong values |
| Text Secondary | `#475569` / `slate-600`–`700` | Body, labels |
| Text Muted | `#64748b` / `#94a3b8` | Captions, placeholders, inactive icons |

### Semantic Status
| Status | Text | Background | Notes |
|---|---|---|---|
| Success / On-Time / Approved | `#047857` | `#d1fae5` | Emerald tint; selected filter may invert to solid fill + ring |
| Warning / Late / Pending | `#b45309` | `#fef3c7` | Amber; pending count chips may use `amber-100` / `amber-800` |
| Leave | `#475569` | `#f1f5f9` | Neutral slate pill |
| Absent / Critical | `#ffffff` | `#0f172a` | High-contrast navy pill |
| Required field marker | `#f43f5e` (`rose-500`) | — | Asterisks on form labels only |
| Destructive CTA | white on `rose-600` | — | Clock-out / destructive confirms |

### Dark Mode (supported)
When `data-theme="dark"` / `.dark`: canvas `#0f0f12`, surfaces `#121214` / `#161619`, borders `#282830`, primary `#3b82f6`. Prefer existing `dark:` class pairs already used on dashboard cards rather than inventing new dark palettes.

---

## Typography

**Plus Jakarta Sans** is the UI face (weights 400–800). **JetBrains Mono** is reserved for codes, IDs, and monospace fields (e.g. project codes).

Global letter-spacing on body is slightly tight (`~-0.011em`); headings use `tracking-tight` / `~-0.02em`.

### Hierarchy in product UI
- **Page title:** `text-xl md:text-2xl font-bold tracking-tight text-slate-900` (e.g. Tasks, Attendance).
- **Dashboard header:** `text-[20px] font-bold text-[#0f172a]`.
- **Card title:** `text-base`–`text-lg font-bold text-[#0f172a]`.
- **KPI numeral:** `text-2xl`–`text-[32px] font-bold tracking-tight`.
- **Metric eyebrow:** `text-[11px] font-bold uppercase tracking-wider text-slate-400`.
- **Form label:** `text-xs font-semibold text-slate-700`.
- **Table header:** `text-[10px]`–`11px` bold uppercase `text-slate-500` on `bg-slate-50`.
- **Helper / count:** `text-xs font-semibold text-slate-400`.

---

## Layout & Spacing

### Shell
- **Desktop sidebar dock:** Fixed left rail **68px** (`w-[68px]`), white, `border-r border-slate-200/80`, `shadow-xs`. Logo is a `rounded-xl bg-blue-600` squircle with white mark. Active item: left sapphire indicator bar + `bg-[#eff6ff] text-[#2563eb]` on a `rounded-2xl` 44px target.
- **Main canvas:** Content sits to the right of the rail with vertical module rhythm `space-y-5`–`space-y-6` and bottom padding for scroll comfort.
- **Mobile:** Sidebar becomes an overlay drawer; primary navigation is the **bottom bar** (`h-16`, white, top border, safe-area padding). Active tab shows a short sapphire underline pill at the top of the slot.

### Page composition patterns
1. **Header row:** Title left; right cluster = segmented control + secondary outline button + primary solid button.
2. **Filter toolbar:** Full-width white `rounded-xl border border-slate-200 p-3` holding search + selects (`bg-slate-50` at rest → white + `border-blue-500` on focus).
3. **Dashboard grid:** Top 2×2 / 4 KPI cards (`gap-3 sm:gap-4`), then `lg:grid-cols-12` with two equal `col-span-6` columns of cards, then a full-width table card.
4. **Attendance module:** Horizontal **sub-nav pill row** → hero attendance card → optional metric tiles → filter bar → data table.

### Rhythm
- Card padding: typically `p-4`–`p-5` (`1–1.25rem`).
- Inter-card gap: `1rem`–`1.5rem`.
- Icon-to-label gaps: `gap-1.5`–`gap-2`.

---

## Elevation & Depth

| Level | Treatment |
|---|---|
| Canvas | Flat tinted ground, no shadow |
| Cards / filter bars | `border border-slate-200` + `shadow-xs` / `shadow-card` (`0 1px 3px rgba(0,0,0,0.05)`); hover may lift to `shadow-sm` + slightly stronger border |
| Popovers / menus | White + `shadow-lg` / popover shadow |
| Slide-over drawer | Full-height white panel, `border-l border-slate-100`, `shadow-2xl`; scrim `bg-black/40 backdrop-blur-xs` |
| Expanded centered modal (maps) | `rounded-2xl`, `shadow-2xl`, stronger scrim `bg-black/60 backdrop-blur-sm` |

Motion: prefer `animate-in fade-in` for overlays; drawers use `slide-in-from-right duration-300`; mobile sidebar `slide-in-from-left`. Primary buttons may use `active:scale-[0.99]` / `active:scale-95`.

---

## Shapes

| Element | Radius |
|---|---|
| Primary cards / KPI tiles / table shells | `rounded-2xl` (~16px) |
| Drawers | Square against the viewport edge; inner controls use `rounded-xl` |
| Inputs, selects, textareas (in drawers & forms) | `rounded-xl` |
| Buttons (page CTAs, sub-nav pills) | `rounded-xl` (page) or `rounded-lg` (compact attendance actions) |
| Segmented control track | `rounded-xl` track; `rounded-lg` active segment |
| Status / count chips | `rounded-full` |
| Sidebar nav targets | `rounded-2xl`; logo squircle `rounded-xl` |
| Icon close / utility hits in drawers | `rounded-xl` hover wash |
| Map modal chrome buttons | `rounded-full` |

Avoid inventing new radius scales; match neighboring modules.

---

## Components

### 1. KPI / Metric Stat Cards
- White `rounded-2xl`, `border border-slate-200/90`, `shadow-xs`, `p-4 sm:p-5`.
- Uppercase muted eyebrow + large bold numeral in navy.
- Often clickable (`button` / router push) with hover border strengthen.
- Semantic split values (e.g. Approved / Pending) use emerald + amber type side-by-side, not extra badge chrome.

### 2. Module Cards (Tasks, Schedules, Employment, Heatmap)
- Same white `rounded-2xl` + `#e2e8f0` border + `shadow-card`.
- Header: bold title left; meta count + text link (`text-xs font-bold text-blue-600`) right.
- Empty state: dashed `border-slate-200 rounded-xl` with muted copy + text action.

### 3. Buttons & Actions
| Variant | Spec |
|---|---|
| **Primary** | `bg-blue-600 hover:bg-blue-700 text-white font-semibold/bold rounded-xl`, optional `shadow-md shadow-blue-600/20` |
| **Secondary / Outline** | White, `border-slate-200`, `text-slate-700`, hover `bg-slate-50` |
| **Ghost / Utility** | Transparent or `bg-slate-100`, muted text |
| **Destructive** | `bg-rose-600 hover:bg-rose-700 text-white` |
| **Sub-nav pill (active)** | `bg-blue-600 text-white shadow-sm shadow-blue-500/20` |
| **Sub-nav pill (idle)** | White + `border-slate-200/80` + slate text |

Icon + label CTAs use `gap-1.5`, icons ~16px.

### 4. Segmented View Switcher
Used on Projects (Board / List / Overview):
- Track: `bg-slate-100/90 p-1 rounded-xl`.
- Active segment: `bg-white text-blue-600 shadow-xs rounded-lg text-xs font-bold`.
- Idle: `text-slate-600 hover:text-slate-900`.

### 5. Filter / Search Toolbar
- Container: white `rounded-xl border border-slate-200 p-3 shadow-2xs`.
- Search: left Lucide icon, `bg-slate-50 border-slate-200 rounded-xl text-xs`, focus → white + `border-blue-500`.
- Selects match the same recessed → focus treatment.

### 6. Navigation Dock
- 68px icon rail; tooltips via native `title`.
- Active: sapphire left tick (`w-1.5 h-6 rounded-r-md bg-[#2563eb]`) + ice fill.
- Inactive icons: `text-slate-400`, hover `bg-slate-50 text-slate-700`.

### 7. Right Slide-Over Drawer (canonical create/edit)
**Reference implementations:** Add Task / Add Project (`ProjectsModule`), Apply Regularization / Edit Attendance (`KekaAttendanceModule`).

Structure:
1. **Scrim:** `fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs`.
2. **Panel:** `w-full sm:max-w-lg md:max-w-xl h-full bg-white border-l border-slate-100 shadow-2xl flex flex-col`, `slide-in-from-right` (~200ms, not 300ms+).
3. **Header:** `p-4 sm:p-6 sm:px-8 border-b border-slate-100` — title `text-xl sm:text-2xl font-bold text-slate-900` + square close control (`rounded-xl hover:bg-slate-100 active:scale-[0.97]`).
4. **Body:** Scrollable `p-4 sm:p-6 sm:px-8 space-y-4 sm:space-y-5` with `custom-scrollbar`.
5. **Footer:** Sticky `border-t border-slate-100` with equal-width **Cancel** (outline) + **Submit** (primary), `gap-3`, often `flex-1` each; press feedback `active:scale-[0.97]` ~150ms ease-out.

**Form field recipe (drawer):**
- Label: `text-xs font-semibold text-slate-700 mb-1.5/mb-2`; required `* ` in `text-rose-500`.
- Control: `w-full rounded-xl border border-slate-200 bg-white px-3.5/px-4 py-2.5/py-3 text-sm font-medium text-slate-800`.
- Focus: `focus:border-slate-400 focus:ring-1 focus:ring-slate-300` (drawer forms intentionally use slate focus, not sapphire).
- Read-only assignee chip: `bg-slate-50` with muted uppercase micro-label (`text-[10px] tracking-wider`).

Do **not** reinvent centered small modals for these flows—match the drawer pattern.

### 8. Centered Expanded Modal
For map / multi-step confirmations (e.g. Confirm Punch Location):
- Stronger scrim (`bg-black/60`), centered `max-w-5xl` panel, `rounded-2xl`, symmetrical header with circular back/close buttons and centered title.
- Content may use recessed `#f1f5f9` map well or centered confirmation copy stack.

### 9. Data Tables
- Shell: white card, often `overflow-x-auto`, `rounded-xl`–`2xl`, border + light shadow. Prefer `ATT_TABLE_SHELL` from `modules/attendance/attendanceUi.ts`.
- Head: `bg-slate-50`, uppercase micro labels, bottom border (`ATT_TABLE_HEAD`).
- Rows: `divide-y divide-slate-100`, hover `bg-slate-50`, comfortable `p-3.5` cells, strong name column in `font-bold text-slate-900`.
- Status pills via `AttendanceStatusPill` (no leading dots):
  - On-Time / Present → emerald soft
  - Late → amber soft
  - On-Leave → slate soft
  - Absent → navy solid / white text
  - Approved / Rejected → solid emerald / rose
- Summary filter chips above tables may invert to solid fill + ring when selected.

### 9b. Attendance module (TeamHub-inspired, sapphire)
**Reference:** `KekaAttendanceModule`, shared primitives under `modules/attendance/`.

Layout recipes (keep brand sapphire `#2563eb` — do not use TeamHub teal):
1. **Sub-nav pills:** `ATT_SUBNAV_BASE` + `ATT_SUBNAV_ACTIVE` / `ATT_SUBNAV_IDLE`; press `active:scale-[0.97]`; no enter animation on tab switch.
2. **Summary KPI row:** `AttendanceStatCards` — Present (soft sapphire), On Leave (solid primary), Absent (slate-900). Optional breakdowns under a hairline divider.
3. **Overview chart:** `AttendanceOverviewChart` stacked bars (Present / On Leave / Absent) using chart kit sapphire series.
4. **Filter toolbar:** `AttendanceFilterToolbar` — white recessed card, search + selects (DESIGN §5).
5. **Punch hero:** `ATT_CARD` with shift meta, live timer, primary Punch In / rose Punch Out.
6. **Settings:** `AttendanceSettingsView` sticky header + Save (`ATT_BTN_PRIMARY`) + same pill sub-nav; section bodies on `ATT_CARD`.

Shared tokens live in `modules/attendance/attendanceUi.ts`.

### 10. Employment / Progress Segments
- Track `h-3`–`h-3.5 rounded-full` with contiguous navy / sapphire / sky / slate segments.
- Legend: bold percentages + short labels; swatches match segment colors.

### 11. Calendar & Heatmap
- Selected day: solid sapphire circle, white type.
- Today / soft highlight: ice fill + sapphire type.
- Heatmap cells: stepped slate → ice → sky → navy densities; small `rounded-md` blocks inside a white card with range dropdown.

### 12. Toasts & Notices
- Success toast: emerald solid, `rounded-xl`, top-right, bold `text-xs`.
- Permission / error notice: dark rose panel, border, dismissible.

### 13. Forms outside drawers
Page-level compact controls (attendance clock actions, toolbar selects) may use `rounded-lg` and sapphire focus (`focus:border-blue-600` / `focus:border-blue-500`). Prefer local consistency with the surrounding module.

---

## UX Patterns & Guidelines

1. **Match existing modules before inventing:** New create/edit UIs should clone the Add Task drawer chrome (header / body / dual footer CTAs / field styling).
2. **Keep first viewport calm:** Module pages open with title + controls + primary data—not stacked promo cards or redundant KPI strips unless the dashboard itself.
3. **Responsive:** Drawers go full-width on small screens; toolbars stack (`flex-col` → `sm:flex-row`); tables scroll horizontally; mobile uses bottom bar, not a persistent expanded sidebar.
4. **Institution vs company:** Labels and nav items adapt (Students / Staff & Faculty vs Employees / Projects)—visual language stays identical.
5. **Accessibility:** Icon-only controls need `title` / `aria-label`; required fields marked with rose asterisk + `required`; maintain contrast on status pills.
6. **Badge hygiene:** Functional count badges on tabs are OK. Do not add decorative status dots, pulse animations inside pills, or redundant “Status:” prefixes when a single pill already states the condition.

---

## Implementation Notes

- Tokens live in `src/app/globals.css` (`:root` / `[data-theme]` CSS variables) and Tailwind utility classes in components.
- Fonts: Plus Jakarta Sans + JetBrains Mono (+ Material Symbols Rounded where already used).
- Prefer Lucide icons for new work to match Attendance, Projects, and shell navigation.
- When updating UI, align with `DashboardModule` card language, `ProjectsModule` drawer language, and `KekaAttendanceModule` sub-nav + table language so the product feels like one system.
