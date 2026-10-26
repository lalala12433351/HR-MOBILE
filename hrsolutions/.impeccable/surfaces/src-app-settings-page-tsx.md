---
version: 1
slug: "src-app-settings-page-tsx"
primary_target: "src/app/settings/page.tsx"
related_targets: ["src/components/modules/SettingsWorkspace.tsx","src/components/modules/AttendanceSettingsView.tsx","src/components/modules/EmployeeSettingsView.tsx","src/components/modules/PayrollSettingsView.tsx","src/components/modules/reports/ReportsSettingsView.tsx"]
---

# Surface: Workspace settings

Mode: Operate

Audience: executives and admins configuring org rules on desktop, reviewing on phone.

Task: open a configuration area, change rules, save.

Constraints: keep existing fields, saves, and data behavior except the controls removed from settings (reports stub, shift roster, student defaulter actions, people probation and task rules, payroll simulator, compliance page, locked currency). DESIGN.md Working Studio. No setup wizard column. No packed dashboard.

## Direction contract

THESIS: Settings is a working studio with one grouped index and a white sheet for the active form.

OWN-WORLD: Quiet Mist canvas, Clean Sheet panels, studio navy actions, measured-blue selection, sage save feedback. Plus Jakarta Sans. 40px controls, 12px labels, 7px radii, 12px cards.

STORY: Choose an area, choose a pane, edit, save. The selected pane stays explicit. Holidays are edited here and linked from Attendance.

FIRST VIEWPORT: Page title left, no subtitle. Desktop: sticky index, area names as labels, 40px pane rows, selected tint and stronger border, no shadow. Right: pane name, primary save, then the form on one white sheet. Phone: horizontal area strip, then that area's panes, then the same sheet.

FORM: Studio rail, user-locked. Seed: settings-studio-rail.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
