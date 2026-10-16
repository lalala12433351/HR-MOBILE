# Visual system audit — implementation brief

Status: **audit only**. No UI was changed.
Date: 2026-10-01
Product: Pixbe (`hrsolutions/`)
Purpose: restyle the existing app into a quieter, denser enterprise SaaS visual system. A later implementer should follow this file. Do not invent a new layout.

Audited by four read-only passes, then checked against source:

- Shell and tokens — [Shell audit](1ae3df72-efa1-4997-935d-77d18c7a1942)
- Dashboard cards — [Dashboard audit](eea49efc-66de-4ce4-96e4-ae75e5b794ca)
- Tables, calendars, lists — [Data surfaces audit](83d869e1-a731-48d8-b610-729148a9a3cb)
- Remaining modules — [Module audit](0ad4213c-aa45-49e2-a6c8-567ca3aec2b1)

---

## 0. Binding restyle brief

These are the original instructions. They bind the implementer. The findings below say where the current UI misses them. If a finding and this section disagree, this section wins.

Restyle the existing application to follow a premium enterprise SaaS design philosophy inspired by polished workforce-management and operations platforms.

Do **not** copy the reference colors, branding, illustrations, or exact visual styling.

Do **not** change any existing information, features, modules, card structure, page structure, data, business logic, routes, APIs, functionality, or content.

Keep all existing cards and dashboard sections.

The goal is to improve the overall visual system only.

### Focus

- Stronger app-shell hierarchy
- Disciplined sidebar navigation
- Compact top navigation
- Tighter information density
- Consistent alignment
- Restrained visual hierarchy
- Subtle borders
- Minimal shadows
- Consistent typography
- Consistent icon sizing
- Consistent button and dropdown sizing
- Improved spacing rhythm
- Cleaner table and grid presentation
- Quieter neutral surfaces
- One consistent brand accent

### Spacing

Use an 8px-based spacing system. Use approximately:

- 24–32px page padding
- 20–24px section gaps
- 16–20px card padding
- 10–12px card radius
- 1px subtle borders
- Extremely soft shadows only when necessary

### Typography

- Page titles: 24–28px, semibold
- Section titles: 16–18px, semibold
- Card titles: 13–14px, medium
- Main numeric values: 24–30px, semibold
- Body: 13–14px
- Metadata: 11–12px

### Behavior of the restyle

- Keep the existing card layouts. Reduce excessive empty space and improve content hierarchy within each card.
- Remove decorative UI patterns that make the product look like a generic dashboard template, such as strong colored top borders, oversized shadows, excessive rounded containers, and inconsistent spacing.
- Make the navigation more structured and enterprise-like. Keep the existing navigation items and functions.
- Make tables, attendance cells, calendars, task rows, and list items feel more compact and systematic without changing their content.
- Use one brand accent for selected states, active navigation, links, and primary controls. Reserve success, warning, and error colors only for semantic states.
- Add subtle hover, active, focus-visible, selected, and disabled states across interactive elements.
- Use 120–180ms transitions.

### Required page audit

Every page must be checked for:

- Inconsistent padding
- Icon size differences
- Mismatched border radius
- Arbitrary font weights
- Poor alignment
- Excessive shadows
- Unnecessary borders
- Z-index issues
- Overlapping dropdowns
- Responsive inconsistencies

Do not redesign the product into a new layout.

Do not change the existing dashboard cards or information architecture.

The final UI should feel like a mature, expensive B2B SaaS product designed by a senior product designer, while preserving the current application's structure and brand identity.

---

## 1. Non-negotiables

Do **not** change:

- Information, copy, labels, numbers, empty-state text
- Features, modules, routes, APIs, business logic
- Card inventory or dashboard information architecture
- Navigation item lists and their destinations
- Brand identity: Pixbe blue, Plus Jakarta Sans, JetBrains Mono, kite mark

Do change only visual system: spacing, type roles, radius, borders, shadows, icon sizes, control heights, surfaces, accent discipline, and interactive states.

Keep every existing card and section. Tighten space **inside** cards. Do not add or remove cards.

---

## 2. Decision: this brief overrides `DESIGN.md` density

`hrsolutions/DESIGN.md` (v2) and `globals.css` currently encode a **denser, quieter** scale than this restyle:

| Role | Current (`DESIGN.md` + CSS) | This restyle |
|---|---|---|
| Page title | `clamp(15px, 1.8vw, 18px)` / 700 | **24–28px / 600** |
| Section title | mixed `text-sm`–`text-base` / 700 | **16–18px / 600** |
| Card title | 14px / 700 | **13–14px / 500** |
| KPI | `clamp(20px, 2.5vw, 24px)` / 700 | **24–30px / 600** |
| Body | 12px in most tables; DESIGN body-sm is 13px | **13–14px** |
| Metadata | often 9–10px | **11–12px** |
| Page padding | 20px / 24px | **24–32px** |
| Section gap | 16px (`space-y-4`) | **20–24px** |
| Card padding | 16px, sometimes 14px or 24–36px | **16–20px** |
| Metric top stripe | 3px multi-color stripe is **intentional** in DESIGN.md §3 | **Remove.** It is the decorative top-border pattern this restyle forbids |

Preserve from DESIGN.md:

- `--primary-blue: #2563eb`, hover `#1d4ed8`, soft `#eaf2ff`
- Surfaces `#f6f8fc` / `#ffffff` / `#f3f6fb` / `#ebf1f9`
- Borders `#e1e8f1` / `#cbd8e8`
- Text `#0b1220` / `#526176` / `#64748b`
- Plus Jakarta Sans + JetBrains Mono
- 60px icon-only sidebar, 32×32 logo, 8px logo radius, kite mark
- Soft card shadow already in `--card-shadow`
- Drawer-first editing (do not convert drawers to modals)

After the restyle, update `DESIGN.md` so it matches the new scale. Otherwise the next change will revert titles.

Semantic status colors stay status-only (present/late/leave/absent/approved/pending/rejected). Do not use them as card chrome, filter fills, category badges, or month themes.

---

## 3. Target tokens

Add these in `:root` in `hrsolutions/src/app/globals.css` and consume them. Do not leave one-off hex and arbitrary Tailwind sizes as the system.

```css
/* spacing — 8px */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--content-px: 24px;
--content-px-lg: 32px;
--section-gap: 24px;
--card-padding: 16px;

/* type */
--text-page: 1.5rem;      /* 24px; 28px from md */
--text-section: 1.0625rem; /* 17px */
--text-card: 0.875rem;    /* 14px */
--text-body: 0.8125rem;   /* 13px */
--text-meta: 0.75rem;     /* 12px */
--text-kpi: 1.625rem;     /* 26px */

/* radius */
--radius-control: 8px;    /* buttons, inputs, chips that are not pills */
--radius-card: 10px;      /* cards, panels; 12px max */
--radius-overlay: 12px;   /* menus, popovers */

/* elevation */
--shadow-card: 0 1px 2px rgba(11, 18, 32, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06);
--shadow-overlay: 0 8px 24px rgba(15, 23, 42, 0.08);
--duration-ui: 150ms;

/* semantic — status only */
--success: #047857;
--success-soft: #d1fae5;
--warning: #b45309;
--warning-soft: #fef3c7;
--danger: #be123c;
--danger-soft: #ffe4e6;
--neutral-status: #475569;
--neutral-status-soft: #f1f5f9;
```

Interactive accent is **only** `--primary-blue`. Links, selected nav, selected tabs, primary buttons, focus rings.

### Control recipe

| Control | Size |
|---|---|
| Primary / secondary button | height 32px (`py-2` + 13px text), radius 8px, icon 16px |
| Compact toolbar button | height 28–32px, same radius |
| Input | height 32–36px, radius 8px, 13px text |
| Icon button | 32×32, icon 16px |
| Dense row icon | 14px |
| Status pill | height ~20–22px, 11–12px, `rounded-full`, soft semantic fill + 1px border |
| Dropdown menu | radius 10–12px, `--shadow-overlay`, 1px `--border-color` |
| Card | padding 16px (20px only when content needs it), radius 10px, 1px border, `--shadow-card` or none |

### States (every interactive control)

- Hover: background or border shift, 150ms
- Active: no scale bounce except an optional 0.99 press already on `.dash-surface`
- Focus-visible: 2px `--primary-blue` ring, 2px offset. Do not use `:focus` rings that show on mouse click if `focus-visible` can replace them
- Selected: `--primary-blue-soft` fill + primary text, or 1px primary border. Not a second hue
- Disabled: opacity 0.45, no pointer
- Transition: **120–180ms**. Drawer/overlay enter may stay ~240–260ms. Do not use 100ms or 200ms+ on chrome

### Z-index stack (replace ad-hoc 60/70)

| Layer | z |
|---|---|
| Sticky table/gantt chrome | 20 |
| App header | 30 |
| Sidebar rail | 40 |
| Dropdowns portaled above header | 45 |
| Mobile bottom bar | 35 |
| Drawer / local overlay | 50 |
| Command palette | 60 |
| Print studios / full-screen editors | 80 |
| Toasts (Sonner / `AppToaster` only) | above drawers, one system |

Do not set `hover:z-50` on calendar events. Do not mount a second toast at `z-50` / `z-60` / `z-70`.

---

## 4. Critical trap: global radius remap

`globals.css` lines 472–500 force Tailwind radii with `!important` **and** substring selectors:

| Source class | Forced radius |
|---|---|
| `rounded-3xl` | 14px |
| `rounded-2xl` | 10px |
| `rounded-xl` | 8px |
| `rounded-lg` | 6px |
| `rounded-md` | 4px |

`@theme` (lines 28–36) still declares `--radius-2xl: 12px` through `--radius-4xl: 16px`. Those tokens and the `!important` remap disagree. The remap wins in the browser.

`[class*="rounded-lg"]` also matches the invalid class `rounded-lg-xl`. `PayrollSettingsView.tsx` uses `rounded-lg-xl` **61 times**. It does **not** render square. It accidentally matches the `rounded-lg` rule and renders at **6px**. Replace every `rounded-lg-xl` with an explicit `rounded-[10px]` (surfaces) or `rounded-[8px]` (controls).

Implement the new radius by:

1. Deleting the substring `!important` remap (it fights `rounded-[10px]` whenever both match, and it matches the wrong classes).
2. Setting `@theme` radii to the target: control 8px, card 10px, overlay 12px. Cap at 12px for product surfaces. `rounded-full` stays for pills and avatars only.
3. Not using `rounded-3xl` anywhere in product UI.

---

## 5. What already complies — do not restyle these away

- Brand blues, surfaces, borders, and text tokens in `:root` (lines 46–62)
- `--card-shadow` and `.dash-card` (1px border, 10px radius, soft shadow) at lines 664–669
- Plus Jakarta + JetBrains loading
- 60px sidebar rail and kite logo treatment
- Sidebar active state: blue tint + 3×20 indicator
- MetricCards `focus-visible` + `.dash-surface` 120ms hover (reuse this, do not invent a second pattern)
- CalendarWidget day interactions and ~150ms motion (fix radius and selected glow only)
- Leave status pills on `UserLeavesSummaryCard` (semantic colors are correct)
- `PayslipStudio` / `IdCardStudio`: explicit 8px controls and 10px surfaces — closest reference
- `AnalyticsModule`: uses CSS variables more consistently than other modules
- `app/reports/page.tsx` title at 22px/semibold is the nearest page-title; move it to 24px, keep the weight

---

## 6. Workstream A — tokens and app shell

Files: `globals.css`, `AppShell.tsx`, `Sidebar.tsx`, `Header.tsx`, `MobileBottomBar.tsx`, `CommandPalette.tsx`, `ui/AppToaster.tsx`, `ui/Skeleton.tsx`.

### A1. Quiet the canvas (high)

- `.pixbe-main` (lines 766–770): remove the blue radial gradient. Background is `var(--bg-app)` only.
- `.pixbe-header` (lines 761–764) and `Header.tsx` ~247: solid `var(--bg-surface)` or `var(--bg-app)`, 1px `var(--border-color)`. Remove `backdrop-blur`.
- `.pixbe-mobile-nav` (lines 772–775): solid surface + top border. Remove blur. `MobileBottomBar` also sets `bg-white` and an upward shadow — keep the border, drop the shadow.
- `AppShell.tsx` loading shells use `#f8fafc` and `#f3f3f9`. `globals.css` ~132 sets light body to `#f8fafc !important`, which fights `--bg-app` `#f6f8fc`. Use `--bg-app` only.
- `app/page.tsx` logo `shadow-lg` + `blur-3xl`: flatten.
- `app/register/page.tsx`: indigo / gray / `shadow-lg` / `text-3xl` is off-system. Retoken to primary blue and the type scale. Do not change the form.

### A2. Spacing (high)

- `AppShell` content padding is `px-5 py-5 lg:px-6` (20/24). Change to `px-6 py-6 lg:px-8` (24/32). Keep `max-w-[1600px]`.
- Add the spacing tokens in section 3 and point shell padding at them.

### A3. Sidebar (medium)

Current: 40×40 items, 20px icons, 6px gap, hover fills the tile, color transition 100ms, no focus ring.
DESIGN.md wanted 36×36, 18px icons, 4px gap, hover = color only.

Use this restyle:

- Item 36×36, radius 8px, gap 4px. Update `NAV_ITEM_STEP_PX` in `Sidebar.tsx` (currently `40 + 6`).
- Icon 16px (one shell icon size). 18px is also acceptable if every shell icon matches.
- Inactive hover: text color only, no background. Active: existing blue tint + indicator.
- Add `:focus-visible` ring. Transition 150ms.
- Keep the 60px rail, logo, and every nav item.

### A4. Header (high)

- Height `h-16` (64px) → `h-14` (56px). Horizontal padding `px-6 lg:px-8` → `px-5 lg:px-6`.
- Org chip is `rounded-full` with a shadow. Make it radius 8px, 1px border, no shadow.
- Search and icon buttons: 32×32, radius 8px, icon 16px.
- Notification `animate-ping` (`Header.tsx` ~307): static 6–8px dot. DESIGN.md forbids pulse dots.
- Notification category badges (`getCategoryBadge` ~174–211) use blue, amber, indigo, purple, emerald, sky. Neutral chips. Unread uses primary blue only.
- Dropdowns (~316, ~460): `shadow-xl` + extra ring. Use `--shadow-overlay`, 1px border, radius 12px, padding 16px.
- Search `focus:ring-0 focus:outline-none` removes the focus ring. Restore `focus-visible`.
- Profile name is 12px/700. Use 13px/500–600. Role stays 11–12px.

### A5. Mobile bar (medium)

- Icons are 22px; sidebar icons are 20px. Use 16px.
- `focus:outline-none` without a replacement on every tab. Add `focus-visible`.
- Active indicator `h-[3.5px] rounded-b-full` can stay primary blue; flatten to a 2px bar so it matches the sidebar indicator language.
- `duration-200` → 150ms.

### A6. Command palette and toasts (high)

- `CommandPalette.tsx` ~509: `shadow-2xl`. Soft overlay shadow, radius 12px.
- `AppToaster.tsx` ~27: `shadow-[0_8px_30px_rgba(15,23,42,0.12)]` is too heavy. Use `--shadow-overlay`. Radius 10px.
- Many modules render their **own** fixed toasts (`z-50`, `z-60`, `z-70`) with `shadow-xl` / `shadow-2xl`. Route them through `AppToaster`. Do not change toast copy or when they fire.
  - `HRMSModule.tsx` ~2362
  - `EmployeeDetailView.tsx` ~1156
  - `EmployeeSettingsView.tsx` ~1149
  - `ProjectsModule.tsx` ~2316 (`z-60`)
  - `TimesheetsModule.tsx` ~1090 (`z-70`)
  - `PaySlipModule.tsx` ~462
  - `PayrollSettingsView.tsx` ~824
  - `OrgChartModule.tsx` ~613
  - `AttendanceSettingsView.tsx` ~1258
  - `GanttChart.tsx` ~388
  - `ReportsSettingsView.tsx` ~150

### A7. Focus (high, shell-wide)

No shell control has a real `focus-visible` style. Auth uses `:focus`. Add one global rule for buttons, links, inputs, and `[role="button"]`, then remove local `focus:outline-none` that is not paired with `focus-visible`.

---

## 7. Workstream B — dashboard cards

Keep the grid, the cards, and the data. Files under `src/components/modules/dashboard/` plus `DashboardModule.tsx` and `UserDashboardView.tsx`.

### Layout rhythm (high)

| Location | Current | Change |
|---|---|---|
| `DashboardModule.tsx` ~28–44 | `space-y-4`, `gap-3 sm:gap-4` (12–16px) | `gap-6` / `space-y-6` (24px). 20px (`gap-5`) is the floor |
| `UserDashboardView.tsx` ~51–67 | `space-y-5 sm:space-y-6`, mixed `gap-4`–`gap-6` | Same 24px section gap as admin |
| `UserActionCards.tsx` ~43 | `mb-6` on top of parent gap | Remove the extra margin |

### Typography (high)

| Class / usage | Current | Change |
|---|---|---|
| `.dash-header-title` `globals.css` 729–735 | 15–18px / 700 | 24px, 28px from `md`, weight 600 |
| Card titles (`text-sm font-bold` / `text-base font-bold`) | 14–16px / 700 | 13–14px / 500 |
| `.dash-kpi` 743–749 | 20–24px / 700 | 26px / 600 (stay inside 24–30) |
| Heatmap rate `text-xl font-extrabold` | 20px / 800 | same KPI style |
| `TeamPerformanceChart` `text-[32px]` | 32px | cap at 28–30px / 600. Component is defined but not mounted; still fix it |
| Metadata at `text-[10px]` / `text-[10.5px]` | 10px | 11–12px. Body that is `text-xs` (12px) becomes 13px |

Card title call sites: `SchedulesCard` ~101, `TasksCard` ~50, `EmploymentStatusBar` ~69, `RecentActivitiesCard` ~166, `EmployeeAttendanceTable` ~152 (`text-sm font-bold`); `AttendanceHeatmap` ~221, `UserLeavesSummaryCard` ~54, `TeamPerformanceChart` ~162 (`text-base font-bold`).

### Decorative patterns to remove (high)

- **Metric top stripes.** `MetricCards.tsx` ~89–90 plus `.dash-stat-accent::before` (`globals.css` 695–708). Colors `#2563eb`, `#059669`, `#d97706`, `#7c3aed`. Delete the stripe. Leave the four metric cards and their numbers.
- **User action icon wells** (`UserActionCards.tsx` ~17–38): blue / indigo / sky / emerald. Neutral wells. Brand color on hover and focus only.
- **Activity badges** (`RecentActivitiesCard.tsx` ~71–120): emerald, indigo, blue, amber, teal, purple, sky, plus `shadow-2xs` on a 32px `rounded-xl` chip. Neutral 28–32px wells, radius 8px, icon 16px, no shadow.
- **Employment bar** (`EmploymentStatusBar.tsx` ~39–63): primary, purple, cyan `#06b6d4`, slate. One primary + neutrals, or strongly desaturated category tints. Not four brand hues. Transition is 200ms → 150ms.
- **Heat cells** (`AttendanceHeatmap.tsx` ~210–314): `#1e3a8a`, `#38bdf8`, `#e0f2fe`, `#f1f5f9` at `h-8 rounded-lg`. Keep a density scale (it encodes data) but mute it so it does not compete with the brand accent. Cell radius 6px. `font-medium` not bold.

### Inside-card density (high / medium)

- `.pixbe-quick-action` `min-height: 9.25rem` (~148px) at `globals.css` 777–778. Lower to about 104–112px. Keep the two-zone layout. Title `text-sm font-medium`.
- `UserLeavesSummaryCard`: `p-5`, title `text-base font-bold`, chips `rounded-xl`, values `text-lg font-bold`. Card padding 16px, title 14px/500, values on the KPI scale, chip radius 8px.
- `RecentActivitiesCard` ~182: `space-y-3` **and** `divide-y` **and** `pt-3`. Use one rhythm (`gap-2` or divide + `py-2`).
- Metric cards `p-3.5` (14px) on small screens → `p-4`.

### Calendar widget (medium)

`globals.css` `.cal-w` ~822: radius **14px**, custom shadow. Selected day ~1077 uses hardcoded `#3B82F6` and `box-shadow: 0 2px 8px rgba(37,99,235,0.18)`, and the circle shrinks 36→32.
Set radius to 10px, selected fill `var(--primary-blue)`, no glow, stable size. Picker shadow ~926 is heavy; use `--shadow-overlay`.

### Dropdowns on cards (medium)

Same menu, three recipes:

| Card | Trigger | Menu |
|---|---|---|
| Heatmap ~230 | `px-3 py-1.5`, chevron 14px | `shadow-xl`, `duration-100`, no focus ring |
| Schedules ~107 | `px-2.5 py-1`, chevron 12px | same heavy menu |
| TeamPerformance ~169 | token-ish trigger | still `shadow-xl`, `duration-100` |

One trigger: 28–32px height, 8px radius, 14px icons, 150ms, `focus-visible`. One menu: `--shadow-overlay`. Selected item: primary soft fill, weight 500.
`SchedulesCard` link `#1a73e8` (~192) → `var(--primary-blue)`.

### Attendance table filters (high)

`EmployeeAttendanceTable.tsx` ~157–215 and pills ~297–316:

- Filter chips are `rounded-full` with full status fills. Absent idle is `bg-[#0f172a]` (looks selected when it is not).
- Filters become neutral. Selected filter uses primary soft fill or a 1px primary border. Status color stays on the **row pill**, not the filter.
- One pill recipe, shared with `AttendanceStatusPill.tsx` (that file uses a different emerald/amber/slate-900 set). See workstream C.
- Search uses `focus:ring-1` not `focus-visible`. Pagination buttons have no duration.

---

## 8. Workstream C — tables, attendance, calendars, lists

### One table recipe

Current cell padding is `py-2.5 px-4` (dashboard), `p-3.5` (Keka and reports), `py-2.5 px-3.5` (holiday list).

Use `py-2 px-3` (8×12), body 13px, header 11–12px medium, `divide-y` with `--border-color`, row hover `--bg-surface-subtle`, `focus-visible` on clickable rows.

Container radius 10px. These shells are 16px (`rounded-2xl` before remap, and `ATT_*` utilities aim at 16px):

- `attendanceUi.ts` `ATT_CARD` / `ATT_TABLE_SHELL` (source of `rounded-2xl`)
- `AttendanceStatCards.tsx` ~56
- `AttendanceOverviewChart.tsx` ~59
- `KekaAttendanceModule.tsx` table shell ~3595

`AttendanceStatCards` has a `tone` prop that does not affect className. Do not add colored card fills. If tone is wired later, it belongs on the delta text only.

### Status language (high)

Three systems today:

1. `EmployeeAttendanceTable` hex pills, Absent = near-black on white text
2. `AttendanceStatusPill.tsx` ~19–30 Tailwind (`emerald`, `amber`, `slate-900`, `sky`, `rose`)
3. Keka geo badges `rounded-md` next to full pills

Unify on `AttendanceStatusPill` tokens from section 3. Absent is danger-soft or neutral-soft, not `#0f172a`. Pill geometry: `px-2 py-0.5`, 11px, full radius, 1px border. Geo chips may stay 6px radius if they are location chips, not status.

Holiday months (`HolidayCalendarView.tsx` ~41–75, ~819, ~934, ~1059) cycle blue / amber / pink / indigo onto chips and date blocks. That is decoration. Neutral date chrome. Emerald and amber only for Approved and Pending.

`AttendanceReportsSection` colors present/late/leave numbers in the cell (~1545). Either a pill or muted numerals plus one status column. Not both styles.

Overview chart fills (`#86efac`, `#7dd3fc`, `#cbd5e1`) can stay as series colors. Do not copy them onto card chrome.

### Lists (medium)

| List | Current | Change |
|---|---|---|
| Tasks | `space-y-2.5`, `p-2.5`, `rounded-lg` (6px after remap) | `gap-2`, padding 8px, row radius 8px |
| Schedules | `space-y-3`, same inner pad, slate-50 rows | same row recipe; token colors |
| Activities | `space-y-3` + `pt-3` + 12px icon radius | same row recipe |

Skeleton radii in Tasks/Schedules are `0.75rem` while rows are smaller. Match skeletons to the live radius (`DashboardPageSkeleton`, `TabsTablePageSkeleton` too).

### Calendars and gantt (medium / low)

- Heatmap cells: no hover or focus. If they are not interactive, do not add a fake button. If they are clickable, add `focus-visible`.
- Gantt (`GanttChart.tsx`) is a dark island (`#121214` / `#282830`) shared with `GoogleCalendarTimesheet.tsx`. Map surfaces to the light tokens (`--bg-surface`, `--border-color`, `--text-*`). Keep bar color as status. `bg-purple-600` (~348) and indigo gradients are extra accents — map special statuses to semantic or neutral.
- Gantt row `h-12` and bar `h-7` can stay. Labels at 9–10px → 11px minimum.
- Sticky gantt panel `shadow-md` → 1px border.

### Toolbars (medium)

`AttendanceFilterToolbar.tsx` (`rounded-xl`, `p-3`, `shadow-2xs`) and the reports filter (`p-4`, mixed radius, `shadow-xs`) should be one bar: padding 12px, radius 10px, 1px border, no shadow, controls 32px tall.

---

## 9. Workstream D — module pages

Apply the same tokens. Do not restructure pages. Page titles that are `text-lg` / `text-xl` / `text-2xl font-bold` / `font-extrabold` all become 24px (28px from `md`) weight 600.

| Module | Highest-priority visual fixes |
|---|---|
| `HRMSModule.tsx` | Title ~1225 is 18–20px/700 and hardcoded `#0f172a`. Buttons ~1242 mix `shadow-2xs` and `shadow-sm`, icon 14px. Leave KPI bars use blue/emerald/purple/amber as decoration. Drawer ~2037 `shadow-2xl`, inputs `py-3.5`, focus ring is slate. Local toast ~2362. |
| `EmployeeDetailView.tsx` | `rounded-3xl` → 14px and `p-6 sm:p-7` at ~1185, ~1446, ~1517. Card padding 16–20, radius 10. Actions menu `shadow-xl` can overlap sticky tabs. |
| `EmployeeSettingsView.tsx` | Cards `rounded-xl` (effective 8px) with `p-6 sm:p-7`. Page title `text-xl`. Button heights `py-2.5` vs `py-2`. |
| `EmployeeOnboardingView.tsx` | Title `text-2xl sm:text-3xl font-extrabold` ~754. Panels `rounded-3xl` and `p-6 sm:p-8 md:p-9` ~853. Inputs `py-3`. CTA `hover:scale` and `shadow-md` ~837. Dark hex `#121214` / `#282830` beside the light app. |
| `AddEmployeeModal.tsx` | `shadow-2xl` ~407. Inputs `rounded-xl` + `py-3` + slate focus. Close icon `h-5`. Nested `rounded-2xl` blocks. |
| `ProjectsModule.tsx` | Title ~2255 `text-xl md:text-2xl font-bold`. Selected card `shadow-md` + ring ~2426 — 1px primary border is enough. Kanban `rounded-xl` vs backlog `rounded-2xl`. Toast `z-60`. Icons `h-3` / `h-3.5` / `h-4` in one toolbar. |
| `TimesheetsModule.tsx` | Toast `z-70`. Event blocks `hover:z-50` + `hover:shadow-md` fight sticky `z-20`/`z-30` ~1479. Badges `text-[9px]`. |
| `GoogleCalendarTimesheet.tsx` | Full dark UI ~621–940. Category swatches may stay as **event data colors**. Chrome (panels, buttons, text) uses the light tokens. Panels are `rounded-lg` (6px). |
| `PaySlipModule.tsx` | Net pay `border-2`, `text-3xl font-extrabold` ~858. 1px border, KPI scale. Local toast. |
| `PayrollSettingsView.tsx` | Replace 61× `rounded-lg-xl`. Early sections use real `rounded-xl`; later sections do not. |
| `StudentDirectoryModule.tsx` | Empty state `rounded-3xl` + `p-12` ~629. Tab `shadow-blue-500/20` ~587. CTA `shadow-md shadow-blue-600/20` ~639. Link `text-teal-700` ~765 → primary. |
| `StudentProfileCardModal.tsx` | Inputs mix `rounded-2xl` and `rounded-xl`. Footer buttons colored shadow. Avatar `ring-4` → `ring-1`. |
| `OrgChartModule.tsx` | Shell `rounded-3xl` ~620. Node `hover:shadow-lg` and `scale-105` ~486. Dept chips indigo/purple/violet. Tree `gap-16` overflows on small screens — reduce gap under `sm` without changing node content. |
| `AnalyticsModule.tsx` | Best token usage. Drop `shadow-sm` on every KPI if the border is there. Title icon `h-6` → 16 or 20. `text-sky-600` velocity → primary or a semantic color. |
| `OpsOverview.tsx` | `p-4 sm:p-6 lg:p-7` stacks on shell padding. Use section gap only. |
| `app/reports/page.tsx` ~90 | Negative margins `-mx-3.5 sm:-mx-6 md:-mx-10 -mb-20` cause overflow. Remove the magic bleed; keep the report content. |
| `AttendanceSettingsView.tsx` | Sticky bar custom shadow ~1265. Panels `rounded-lg` (6px) vs inputs `rounded-xl` (8px). Badges `text-[9px]`. |
| `AuthOnboardingView.tsx` | Wizard headings `font-extrabold`. Focus ring is 4px. Input fills `#f8fafc` and `#F5F8FC` — one subtle token. |
| `MasterAdminDashboard.tsx` | KPI icon `bg-purple-50 text-purple-600` ~846. Tabs `py-1.5`. |
| `StudentLoginView.tsx` | Title `font-extrabold`. Error radius is already 10px. |
| `WorkspaceSetupWizard.tsx`, `EmployeeSetupWizard.tsx`, `StudentSetupWizard.tsx` | Same extrabold / large-radius patterns as onboarding. Sweep with the onboarding rules. Not line-audited. |

### Referenced in verification, not fully line-audited

Apply the same recipes when touching these. Do not skip them:

- `AnnouncementsModule.tsx`, `NotificationsModule.tsx`, `DocumentsModule.tsx`, `ProductivityModule.tsx`, `ClientPortalModule.tsx`
- `EmployeeTableTab.tsx`, `StaffCardsTab.tsx`, `EmployeeProfileCardModal.tsx`
- `StudentTimetableModule.tsx`, `StudentAttendanceModule.tsx`, `StudentAttendanceLogModal.tsx`, `StudentOnboardingPasswordModal.tsx`
- `AttendanceReportsModal.tsx` (`rounded-3xl`, `shadow-2xl`)
- `AutomationModule.tsx` dark modal `#161d2e`
- `WorkspaceSocialHub.tsx` coral gradient banner
- `GmailComponent.tsx`, `GoogleSheetsComponent.tsx`, `GoogleDriveComponent.tsx`, `GoogleMeetComponent.tsx`, `EmployeeTimePanel.tsx` (Google embeds can keep Google's own colors **inside** the embed; the surrounding chrome follows Pixbe)
- `AIAssistantModal.tsx`
- `app/setup/page.tsx` (`bg-gray-50`), `app/impersonate/page.tsx`

---

## 10. Cross-app inconsistency matrix

| Dimension | What exists now | Target |
|---|---|---|
| Radius | 2, 4, 6, 8, 10, 12, 14, 16px, plus invalid `rounded-lg-xl`, plus `rounded-full` on filters | 8 controls, 10 cards, 12 overlays, full only for pills and avatars |
| Shadow | `2xs` through `2xl`, colored `shadow-blue-600/20`, toast `0 8px 30px`, drawer `0 25px 50px` | Card: `--shadow-card` or none. Overlay: `--shadow-overlay`. No colored shadows |
| Button height | `py-1`, `py-1.5`, `py-2`, `py-2.5`, `py-3`, plus `active:scale-95` | 32px primary/secondary. One press style. No hover scale |
| Icons | 10, 12, 14, 16, 17, 18, 20, 22, 24px in the same bars | 16 toolbar, 14 dense meta |
| Type weight | `medium`, `semibold`, `bold`, `extrabold` on the same role | 600 page/section/KPI, 500 card titles, 400 body |
| Accent | `#2563eb`, `blue-600`, `var(--primary-blue)`, indigo on register, purple/violet/sky/teal/cyan in chrome | Primary token only, except status |
| Focus | Often missing; sometimes `outline-none`; sometimes `ring-1` or `ring-4`; sometimes slate | `focus-visible` 2px primary |
| Duration | 100, 120, 150, 160, 200, 220, 260, 280, 300ms | 150ms chrome; drawer ~260ms |

---

## 11. Implementation order

1. **Tokens and the radius remap.** Nothing else will stick until the `!important` substring rules are gone and spacing/type/semantic tokens exist. Update `DESIGN.md` in the same change.
2. **Shell.** Gradient, frosted header, header height, dropdown elevation, focus rings, sidebar metrics, mobile bar, ping dot, category colors.
3. **Shared recipes.** One `Button`, one `IconButton`, one `Menu`, one `StatusPill`, one `Card` class (or a single set of class strings). Point modules at them instead of restyling each file by hand. Do not change component APIs in a way that changes behavior.
4. **Dashboard.** Section gaps, titles, KPI scale, remove metric stripes, shrink quick actions, unify the three dropdowns, fix attendance filters and pills.
5. **Attendance / Keka / holiday / reports tables** onto the table and pill recipes.
6. **Module sweep** in the table in section 9, including the “not line-audited” list. Replace local toasts last so z-index settles once.
7. **Dark islands** (Gantt, Google Calendar timesheet, onboarding dark hex, Automation modal) onto the same surface tokens.

### Per-file checklist

Run this on every page, not only the files named above. It is the required page audit from section 0.

- Inconsistent padding — 8px steps only (4 / 8 / 12 / 16 / 20 / 24 / 32). Page 24–32, section gap 20–24, card 16–20
- Icon size differences — 16px in toolbars, 14px in dense rows. No mixed sizes in one control
- Mismatched border radius — 8px controls, 10–12px cards and overlays, full radius only for pills and avatars
- Arbitrary font weights — semibold for page titles, section titles, and main numbers; medium for card titles; regular for body
- Poor alignment — shared left edge for titles, values, and row content; controls in a row share one height and one baseline
- Excessive shadows — `--shadow-card` or none on surfaces; `--shadow-overlay` on menus and drawers; no colored shadows
- Unnecessary borders — one 1px `--border-color` where a region needs separation. Do not stack border + ring + shadow on the same card
- Z-index issues — only the stack in section 3
- Overlapping dropdowns — menus portal or sit above sticky bars, cards, and the mobile nav; they do not clip inside `overflow-hidden` cards
- Responsive inconsistencies — the same padding, type, and control height at desktop and ~390px. No negative margins that overflow. No hover-only actions that disappear on touch without a tap equivalent
- Hover, active, focus-visible, selected, and disabled — all present, all subtle
- Transition 120–180ms (150ms default). Drawer enter may be ~260ms
- No colored top border, gradient chrome, or pulse
- Tables, attendance cells, calendars, task rows, and list items are compact and systematic. Content of each cell and row stays the same

---

## 12. Out of scope

- New cards, new nav groups, new pages, new empty states
- Changing dashboard column structure, card structure, or page structure
- Changing existing information, features, modules, data, business logic, routes, APIs, functionality, or content
- Rewriting chart types or data
- Dark mode as a new theme. Existing `[data-theme="dark"]` tokens can stay; do not design a second dark product. Dark-only modules should join the light token set
- Copying any reference product’s colors, branding, illustrations, exact visual styling, or layout

---

## 13. Verification the implementer owes

After the visual pass, walk every route against the page audit in section 0 (padding, icons, radius, weights, alignment, shadows, borders, z-index, overlapping dropdowns, responsive behavior). Then exercise these in the browser (desktop and a ~390px width):

- Dashboard admin and user views: every current card still present, no overlap, dropdowns escape the card
- Header notifications menu and profile menu open above the mobile bar and do not clip
- Sidebar tooltips / mobile drawer
- One table page (attendance), one calendar (holiday), one settings page (payroll — confirm corners are 10px, not 6px)
- One drawer (add employee) and one toast
- Keyboard: Tab through header, sidebar, a card dropdown, and a table row; focus ring visible
- Reduced motion still respected (`globals.css` ~785)
