# Mobile v2 implementation

The base phone reference is [12 · Mobile · Rebuilt experience](https://www.figma.com/design/3WBnpJRZWuIwgDDSOWLQ5A/HR-Solutions-App?node-id=323-12254). It supersedes the earlier mobile frames listed in `mobile-layouts.md`. The approved card and alignment refinements below supersede its flat treatments on dashboard and work screens. Desktop guidance in DESIGN.md still applies above 767px. These refinements are recorded in code and this guide; the linked Figma frames have not been updated by this change.

Use 390px as a fluid spacing reference, with 20px content gutters, a 64px header, white canvas, 20px section gaps, 14–15px medium row titles, 12px secondary copy, 48px form controls, and 8px control corners. Dashboard sections and work records use bordered cards; related items inside a section use dividers. Status text has no pill background. Preserve device safe areas without drawing OS status bars or home indicators.

## Approved cards and alignment — 30 October 2026

Use these patterns for new mobile changes and gradual migration of existing screens. Keep existing business behaviour, permissions, validations, and navigation.

| Pattern | Specification |
| --- | --- |
| Canvas and surfaces | White page canvas; mist `--bg-app` inside detail drawers; white `--bg-surface` panels with a 1px `--border-color` outline. No decorative shadows. |
| Cards and panels | 16px padding; 10px radius for records and detail groups; 12px radius for dashboard sections. 12px between related cards; 20px between sections. Use divided rows within a single card for related metadata. |
| View buttons | My tasks / Projects / Board are content-width, left-aligned, with vertically centered labels, 40px minimum height, 8px gap and 8px radius. Active: navy fill, white label. Inactive: white fill, border and supporting ink. Do not stretch them across the page. |
| Fields and filters | Visible labels, 48px height, 1px field border, 8px radius, white fill. Expanded filters have an enclosing bordered panel with 16px padding and 12px gaps. Stack fields at narrow widths. Keep the closed filter disclosure visible and tappable. |
| Task cards | Title and status align at the top; project is secondary; due date and priority share a divided footer. Titles wrap. Overdue uses rose; active work uses indigo. Always include a text status. |
| Project cards | Consistent title, status, lead, completed/total task count, progress bar and due date. All projects share one record layout. |
| Dashboard | Preserve the compact attendance shift card and coloured shortcuts. My tasks / My schedule / Upcoming holidays share a bordered section pattern. Use published holidays and real task/schedule metadata. |
| Attendance landing | Keep the main workday/punch section and weekly summary visible at the top. Below it, group compact horizontal action buttons in bordered panels under Your records and Time off. Each row has a quiet navy line icon, 14px title and 12px supporting text, with a divider between rows. Use 16px inner gutters and 10px panel corners. Apply leave is a compact primary button beside Time off. Avoid the reference's tall two-column tiles and coloured icon badges. Logs, corrections, leave forms, balances and history open their existing views. Show team attendance only for authorized roles. Keep published holidays below the actions. |
| Project details | Fixed header and safe-area footer; only the body scrolls. Project titles wrap. White panels group work hours, description, information, permission-gated billing, and project tasks. Use 12px labels and 13px values; client and lead names wrap without truncation. |
| Project hours | Align Allocated and Logged in two columns. Use app typography with tabular numerals, a thin progress bar and explicit no-budget copy. Do not imply a configured budget when none exists. |
| Actions | Footer buttons stay at least 44px tall. Preserve Edit, Save, Add task, Close and permission-gated Delete. Keep visible focus and honour reduced motion. |

Attendance subpages use `mobile-attendance-pages.module.css`: 13px record titles, 12px supporting copy, 14px section headings, content-width 40px actions, bordered summaries/records, and readable 44px form fields. History supports date selection and previous/next periods without navigating into future dates. Leave balances, requests, corrections, team/class registers, holidays, and leave/correction forms share these patterns.

Task creation/editing, task detail, project detail/editing, regularization and leave application drawers share `common/mobile-drawers.module.css`. Use a full viewport panel with no header offset, a fixed 16px-title header and visible 36px close control, a separately scrolling body with 20px gutters, and a safe-area footer with content-width 40px actions. Inputs use 13px type, 44px height and visible borders. Detail sections use white bordered panels. Keep nested drawers independent and preserve existing save behaviour. `useDrawerFocus` supplies Escape, focus trapping and focus restoration for the custom project and attendance panels; TaskPanel retains its own equivalent lifecycle.

The profile drawer uses `layout/mobile-account-drawer.module.css`: a right-side panel with a fixed header and logout footer, and a separately scrolling body. A bordered identity card shows the person's name, designation and organisation, with a compact Switch action. Account and role-filtered workspace links sit in separate outlined groups with 13px labels and 46px rows. Keep native dialog focus handling, Escape/backdrop dismissal, focus restoration, safe areas and the existing slide animation.

Announcements use `modules/mobile-announcements.module.css`: white bordered feed cards, 16px padding, 15px titles, 13px content and compact reaction/comment controls. Search and category/priority filters share an outlined panel with small All / Pinned / Unread buttons. Show each pinned post once, ahead of unpinned posts. Keep the creation drawer's fields bordered and its actions compact; preserve publishing permissions.

Timesheets use `modules/mobile-timesheets.module.css`: content-width Day / Week / Month / List controls, always-visible date navigation, a controlled bordered filter panel, bordered summaries and entry cards, compact review/export actions, and visible team selection for authorized reviewers. Keep project, time range, hours and status readable on every entry. Log, edit and scheduling forms share the full-height drawer pattern, with 13px fields, 44px controls and compact footer actions. Keep permissions, duration calculations and approval rules unchanged.

Shared tokens live on `.pixbe-app` in `src/app/mobile-v2.css` below 768px:

| Token | Value |
| --- | --- |
| `--mobile-page-gutter` | 20px |
| `--mobile-section-gap` | 20px |
| `--mobile-card-gap` | 12px |
| `--mobile-card-padding` | 16px |
| `--mobile-card-radius` | 10px |
| `--mobile-panel-radius` | 12px |
| `--mobile-control-radius` | 8px |
| `--mobile-compact-height` | 40px |
| `--mobile-field-height` | 48px |

Scoped implementations: `mobile-dashboard.module.css`, `mobile-attendance-home.module.css`, `mobile-project-overview.module.css`, `modules/mobile-workspace.module.css`, and `modules/mobile-project-details.module.css`. Reuse these patterns instead of adding conflicting global overrides.

| Feature | Reference nodes | Implementation |
| --- | --- | --- |
| Shared header and account drawer | 316:9858, 385:15910 | MobileHeader; native modal dialog handles focus trapping, Escape, and backdrop dismissal |
| Home / Work / Time / Chat / More | 315:9874 and navigation variants | MobileBottomBar; active families include nested routes |
| Home and team overview | 316:9854, 316:9941, 355:12289, 355:12453 | MobileDashboard; existing dashboard data and attendance actions |
| Attendance and history | 316:10021, 316:10165 | KekaAttendanceModule; Overview / History / Team with live sessions |
| Location, camera, punch confirmation | 316:10105, 356:13280, 358:15199 | WorkdayPunchDialogs and attendance module's existing punch flow; mobile confirmation offers no Retake |
| Work, project list, board and task forms | 318:10306-318:10670 | ProjectsModule; compact view buttons, bordered filters, task/project cards, grouped project details; creation action appears in shared header |
| Timesheets and time entry | 318:10757–318:10900 | TimesheetsModule; compact Day/Week/Month/List controls, bordered entries and filters, and shared log/edit/scheduling drawers |
| Conversations and chat | 319:10705–319:10912 | Existing functional chat workspace with Mobile v2 spacing and controls |
| People and employee details | 319:10987, 319:11260, 320:11637 | Existing roster and profile modules with flat mobile records |
| More | 319:11162 | /more; destinations follow existing workspace permissions |
| Reports | 320:11227 | ReportsWorkspace; mobile landing uses live metrics and existing report views and export |
| Settings | 320:11308 | SettingsWorkspace; Personal and Workspace administration link to existing settings panes |
| Payroll and invoices | 319:11346, 320:11859, 357:15119–357:15585 | Existing finance workflows receive Mobile v2 flat records and controls |
| Authentication and verification | 321:11770–321:11831 | Existing authentication handlers, mobile header, field styles and pinned primary action |
| Setup and onboarding | 321:11857–321:12080 | Existing setup flows with Mobile v2 form styles |

All SVGs in public/mobile-v2 are original Figma exports saved locally. Profile photographs, maps, camera images and business records remain dynamic. Do not use Figma screenshots as screen assets or persist temporary asset URLs.

Workspace switching currently supports the active workspace and signing in with another account; this change does not add multi-tenant session switching. Google sign-in is not implemented by the current authentication service, so no inert Google button has been added.

## Validation

Use local synthetic fixtures; do not mutate production tenants.

```powershell
node scripts/mobile-preview.cjs --build
node scripts/mobile-check.cjs
node scripts/mobile-interactions.cjs
$env:MOBILE_WIDTH = '320'
node scripts/mobile-check.cjs dashboard projects timesheets attendance more reports settings login signup otp
npx tsc --noEmit --incremental false
npm run build
```

Screen checks inspect runtime errors, horizontal page overflow and locally rendered Figma SVGs. Interaction checks cover the account drawer, work views and filters, task creation, time-entry views and forms, profiles, reports, settings, timetable, chat, and verification inputs. Screenshots and results are under test-results/mobile.

These checks are functional and visual review aids, not proof that every one of the 170 Figma states has pixel-level parity. Secondary workflows retain existing content and business rules.

### People and public profiles

People and employee lists use compact bordered person cards, visible status text, 36px content-width view buttons and a 44px bordered search field. Employee details group label/value rows in white bordered sections with 16px padding. Public profiles use a left-aligned avatar and identity header, labelled Email/Call actions, About, Workplace and Team cards, and a Contact & work tab. Only existing public work information is displayed; private employee records remain in the employee detail view. Desktop public profiles use two columns; mobile uses one column.

### Settings and dark appearance

Personal settings and workspace settings use bordered groups, compact navigation buttons, and labelled controls. Dark appearance is a device preference, saved independently of workspace sync. The root data-theme and native color-scheme update together. Mobile surfaces use semantic colour tokens rather than fixed white fills; primary navy buttons retain white labels. Dark navigation keeps the translucent treatment with a dark surface.

### Punch location refinement

The mobile punch-location step uses a contained map (up to 240px), one short GPS or geofence status, office name, address and subdued GPS accuracy. Omit the large clock, repeated status/address, privacy paragraph and next-step caption. Keep one 44px Continue action at the bottom, with safe-area padding. GPS failures and office-boundary rules remain actionable.
