---
version: 1
slug: "src-app-settings-page-tsx"
primary_target: "src/app/settings/page.tsx"
related_targets: ["src/components/modules/SettingsWorkspace.tsx","src/components/modules/AttendanceSettingsView.tsx","src/components/modules/EmployeeSettingsView.tsx","src/components/modules/PayrollSettingsView.tsx","src/components/modules/reports/ReportsSettingsView.tsx"]
---

# Surface: Workspace settings

Mode: Operate

Audience: executives and admins configuring org rules on desktop, reviewing on phone.

Task: open a configuration area, change rules, save. Nested tabs stay inside each area.

Constraints: keep existing fields, saves, tabs, and data behavior. DESIGN.md Working Studio. No setup wizard column. No packed dashboard.

## Direction contract

THESIS: Settings is a working studio with a persistent area rail and a white sheet for the active form — not a wizard and not a dense admin grid.

OWN-WORLD: Quiet Mist canvas, Clean Sheet panels, studio navy actions, measured-blue selection, sage save feedback. Plus Jakarta Sans. 40px controls, 12px labels, 7px radii, 12px cards.

STORY: Choose an area, scan nested tabs, edit, save. Selected rail and unsaved-vs-saved state stay explicit.

FIRST VIEWPORT: Page title left, no subtitle. Desktop: left rail of four areas (40px rows, selected tint + stronger border). Right: area heading, primary save, underline tabs, then the form. Phone: horizontal area strip, then the same sheet.

FORM: Studio rail, user-locked. Seed: settings-studio-rail.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
