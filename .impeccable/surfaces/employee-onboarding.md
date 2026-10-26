---
version: 1
slug: "employee-onboarding"
primary_target: "employee-onboarding"
related_targets: ["hrsolutions/src/components/modules/EmployeeOnboardingView.tsx","hrsolutions/src/app/employee-onboarding/page.tsx"]
---

# employee-onboarding

mode: Operate
audience: New hire completing invite-based profile setup on desktop or phone
job: Set password (optional), enter required profile data, upload only HR-configured documents, confirm and enter workspace
constraints: Inherit Working Studio / company-setup visual system; no default document slots; omit documents step when none configured; no banned subtitles under headings

## Direction contract

THESIS: A setup-matched Operate checklist — left stage rail, right form — that only asks for fields HR configured, never invents document chores.
OWN-WORLD: Quiet Mist canvas, Clean Sheet panels, Studio Navy stage markers and primary actions, Quiet Sage for completed stages, Plus Jakarta Sans at setup flow scale.
STORY: The hire sees clear stages, fills one task at a time, skips documents when HR added none, and finishes with an accuracy confirmation.
FIRST VIEWPORT: Left rail with Pixbe brand and numbered stages (Password, Personal, Address, Banking if enabled, Documents if any, Review). Right: task heading then form controls; Back + Continue under the form.
FORM: Setup-matched rail (optionId setup-rail); surface confirmation seed onboarding-layout.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
