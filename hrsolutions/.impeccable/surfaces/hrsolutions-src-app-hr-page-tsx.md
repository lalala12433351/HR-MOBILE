---
version: 1
slug: "hrsolutions-src-app-hr-page-tsx"
primary_target: "hrsolutions/src/app/hr/page.tsx"
related_targets: ["hrsolutions/src/components/modules/HRMSModule.tsx","hrsolutions/src/components/modules/hrms/EmployeeTableTab.tsx","hrsolutions/src/components/modules/hrms/StaffCardsTab.tsx","hrsolutions/src/components/modules/hrms/EmployeeProfileCardModal.tsx","hrsolutions/src/components/modules/hrms/EmployeePublicProfilePanel.tsx"]
---

# Surface: Employees directory

Mode: Operate

Audience: HR, executives, and managers scanning the roster on desktop; members checking My Team on phone.

Task: find a person, filter the roster, open a profile, add or export people.

Constraints: keep roster logic, filters, grouped/unified views, invites, and directory cards. DESIGN.md Working Studio at the tighter workspace scale. No setup wizard column. No packed dashboard. No subtitle under the page title.

## Direction contract

THESIS: The coworker profile peek is an identity band first — navy owns who they are; facts read as one continuous list. It refuses gray contact cards and a redundant Close brick.

OWN-WORLD: Quiet Mist / Clean Sheet / navy #17324e / ink #172234 / Plus Jakarta / 12px radius. Signature move: avatar overlapping the navy-to-white seam.

STORY: Visitor recognizes the person in one glance, copies email or phone, then dismisses or opens the full profile.

FIRST VIEWPORT: Full-width navy band with 72px avatar overlapping the seam; name and role on the band; X on the band; white body is a continuous labeled field list (email, phone, timezone, department, office, manager); About only when bio exists or is editable; primary View profile / Manage when offered — never a lone Close.

FORM: Identity band (grounded list #1 of 7); seed key 5d4e86c5.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
