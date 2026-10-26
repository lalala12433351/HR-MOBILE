---
name: Pixbe Workspace Design System
description: Cool, precise, trustworthy product UI for the Pixbe business operating system.
colors:
  ink: "#172234"
  navy: "#17324e"
  navy-hover: "#285275"
  blue-action: "#2d628e"
  blue-selected: "#f8fbfe"
  blue-focus: "#d8e8f2"
  paper: "#f3f5f7"
  surface: "#ffffff"
  surface-tinted: "#e8eef2"
  border: "#dde4e9"
  field-border: "#c5d0d8"
  text-secondary: "#5e6c7b"
  text-muted: "#687789"
  sage: "#53886b"
  sage-surface: "#eaf1ee"
  error: "#8b3133"
  error-surface: "#faeeee"
typography:
  headline:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(20px, 2vw, 26px)"
    fontWeight: 760
    lineHeight: 1.2
    letterSpacing: "-.028em"
  page-title:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(16px, 1.5vw, 20px)"
    fontWeight: 750
    lineHeight: 1.3
    letterSpacing: "-.02em"
  section-title:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 750
    lineHeight: 1.3
    letterSpacing: "-.02em"
  body:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 650
rounded:
  control: "6px"
  list-item: "8px"
  panel: "8px"
  card: "12px"
  auth-segment: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "20px"
  section: "20px"
  chapter: "32px"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.navy-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.navy}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
---

# Pixbe Workspace Design System

## Overview

**Creative North Star: “The Working Studio.”** Pixbe should feel like a thoughtfully arranged place to get work done: a quiet cool canvas, white working surfaces, crisp ink, and a small number of purposeful color accents. The interface is professional without feeling sterile, confident without being loud.

This is the app-wide direction chosen after the company setup redesign. The company setup flow is the **implemented reference**, not evidence that every existing Pixbe screen already follows it. The dashboard, institute experience, dark theme, and older modules still need gradual migration. Preserve their functionality while adopting this visual language. Workspace screens share setup’s cool palette and control language at a slightly tighter operational scale: readable type, clear section breaks, no wasted chrome. Do not copy the setup wizard's centered column onto data-heavy screens, and do not pack those screens into a dense dashboard.

**Key Characteristics:**

- Cool mist canvas and white working surfaces, with deep navy typography.
- Clear editorial hierarchy: an assertive task heading, then direct controls. No lede or subtitle under the title.
- Restrained blue interaction states and sage confirmation; semantic red only for errors.
- Custom, consistent line illustrations for meaningful choices; utility icons only where they speed scanning.
- Explicit state and validation: a selection, save, invitation, or launch must never look complete before it is.

**Implementation reference:** Light-theme color lives in `src/app/globals.css` (`:root` / `[data-theme="light"]`). The dashboard on Quiet Mist + Clean Sheet is the approved canvas pairing. Setup layout and illustration still live in `src/components/modules/setup/workspace-setup.css`, `SetupWorkplaceStep.tsx`, `WorkspaceSetupWizard.tsx`, and `public/pixbe-workspace-plan.png`.

**CSS tokens:** `--bg-app` = Quiet Mist, `--bg-surface` = Clean Sheet, `--bg-surface-subtle` / `--bg-surface-hover` = Tinted Panel, `--border-color` / `--border-strong` = Structure.

## Colors

The palette is cool-neutral first. Blue marks actions and selection, not every card or label. Warm beige, linen, cream sheets, and optical-white-on-ivory are rejected: they read dated against this product.

- **Primary:** Deep Ink (`ink`) for content; Studio Navy (`navy`, `navy-hover`) for brand and primary actions; Measured Blue (`blue-action`, `blue-selected`, `blue-focus`) for interactive states.
- **Secondary:** Quiet Sage (`sage`, `sage-surface`) for success and confirmation. Precise Error (`error`, `error-surface`) for actionable failures.
- **Neutral:** Quiet Mist (`paper`) for canvas, Clean Sheet (`surface`) for working surfaces, Tinted Panel (`surface-tinted`) for explanation, Structure (`border`, `field-border`) for boundaries, Supporting Ink (`text-secondary`, `text-muted`) for lower-emphasis text.

**The One Accent Rule.** A screen may have semantic states, but only one color should read as its primary interaction accent. Avoid rainbow navigation, multi-colored cards, and decorative gradients. Dashboard figures are the exception recorded in the file: attendance uses teal (`#0b6e64` / `#e5f5f0`), people violet (`#6946b8` / `#f1ecfc`), leave rose (`#ad425b` / `#fcecf1`), and projects indigo (`#4555ad` / `#eef0fd`). Those colors identify the figure. They are not navigation colors.

**The Legibility Rule.** Never put muted blue-gray text on a dark fill. On dark surfaces use near-white text with tested contrast; never communicate state by color alone.

## Typography

**Display and body:** Plus Jakarta Sans, already loaded in the app. **Technical identifiers:** JetBrains Mono only for code-like data.

Type is readable first. Setup headings used to sit at 29–39px and drowned workspace screens; they now top out at 26px. Everyday modules use a smaller page title than setup, not a cramped one.

- **Setup headline** (`headline`): one question per setup step, `clamp(20px, 2vw, 26px)`.
- **Page title** (`page-title`): workspace modules (payroll, reports, settings, HR). `clamp(16px, 1.5vw, 20px)` — never the setup hero size.
- **Section title** (`section-title`): 15px divisions inside a page.
- **Body** (`body`): 13px, preferably under about 70 characters per line.
- **Label** (`label`): 12px field labels and actions; sentence case.
- **Microcopy:** 12px for secondary metadata only. Never drop UI copy to 11px except true captions (timestamps, table column codes).

**The Answer-First Rule.** Titles state the task, not an abstract module name. Do not add an eyebrow/kicker above the heading, and do not add a subtitle, lede, or restating sentence under it. Lines such as “Attendance, leave, and projects as of Wednesday, Oct 14. Open a figure to act on it.” are banned: they repeat the page, add a date the UI already shows, and tell the user how to click. Put dates, counts, and instructions on the figures themselves.

## Layout

- Workspace modules fill the remaining canvas inside the app shell (sidebar + 56px header). Cap content at 1600px. Give the canvas normal page padding (`xl` / `section`, about 20px; 24px on large screens). Do not wrap data pages in a 1280px onboarding column, and do not hug the edges with 8px gutters.
- Fill-canvas pages (payroll, chat) own the leftover height: chrome stays put, the table or thread scrolls inside. Do not page-scroll a short header away from a long table.
- Setup remains a flow pattern: centered frame up to 1440px, a guidance rail, flexible content. That layout is **not** the dashboard shell, but its spacing rhythm (group, then rest) **is**.
- Hierarchy: 10–14px inside components and form groups, 14–20px between related blocks, about 20px between sections, about 32px for major transitions. Related items sit closer than unrelated ones; never use one tight gap everywhere.
- Tables stay a little tighter than forms, not cramped: 10px vertical and 14px horizontal cell padding, 13px body in cells. Do not use 6–8px cell padding as a default.
- Place decisions before dependent fields, labels with controls, and feedback next to the action that caused it.
- Use asymmetric grids when content demands it. Avoid equal columns just for symmetry.
- The workspace rail is a fixed 232px column. It does not collapse on hover.
- Stack at phone widths; keep primary actions reachable above the mobile nav. Avoid horizontal page scrolling; **40px is the default control height**. Icon-only hits stay at least 32×32px.

**The Comfortable Work Rule.** Everyday operations screens must be easy to scan and interact with for hours. Hierarchy and alignment do the work — not packing more rows into the first viewport, and not padding every block like a marketing page.

## Elevation & Depth

Borders and tonal layers define most surfaces. A slight ambient shadow is reserved for a current step, selected choice, or truly elevated overlay. Static cards should not look like floating tiles.

- **Current step:** `0 5px 15px rgba(26,46,62,.06)`.
- **Selected choice:** `0 9px 22px rgba(26,58,84,.09)`, always paired with a stronger border so the state remains clear without shadow.

**The Almost-Flat Rule.** No deep blur, glow, or heavy elevation as general decoration. Meaningful state and surface contrast do the work.

## Shapes

Controls are gently crisp (`control`); list rows use `list-item`; callouts use `panel`; large choice cards use `card`. This is a controlled range, not a mandate that every surface be a rounded rectangle. Dividers are thin and opaque. Circles are reserved for step numbers, radio marks, small status markers, and map pins.

Illustrations and choice icons use simplified architectural or operational linework: consistent stroke, open negative space, no emoji, no clip-art, and no decorative icon beside every heading. The setup artwork supports the form rather than competing with it.

## Components

### Buttons

- **Primary:** navy fill, white label, 6px radius, 40px height. Use one dominant next action per area.
- **Secondary:** white fill, navy border and label; use for additive actions such as “Add workplace.”
- **Hover and focus:** subtle color shift or 1–2px movement; visible blue focus outline. A disabled appearance must reflect real validation.
- **Copy:** action plus object where possible (“Add workplace,” “Continue to structure,” “Launch workspace”).

### Inputs and fields

- White fill, field border, 6px radius, 40px height. Keep a visible label above the field; placeholders are examples, not labels.
- Focus uses a blue border and soft ring. Errors appear near the field, explain the fix, and preserve typed values.
- Use real controls for constrained values and validate again on the server.

### Choice cards

- Use when options change the following workflow. Each card has a custom semantic illustration, clear title, one-sentence consequence, and radio indicator.
- Selected state has a stronger blue border and quiet tint. Radio and accessible `aria-checked` must agree. On mobile, cards become horizontal rows.
- Do not assign a generic Lucide icon to every choice. Draw or reuse a coherent Pixbe icon family when imagery genuinely helps.

### Progress navigation

- Distinguish current, completed, and upcoming stages. The active stage gets a white surface; completed stages get a restrained sage marker.
- Do not imply “saved” when data exists only as a draft. Step labels describe user tasks, not backend entities.
- On phones, compress to a short horizontal stage strip instead of squeezing desktop descriptions into tiny columns.

### Cards, messages, and status

- White working surfaces on Quiet Mist (`#f3f5f7`) are the default. Use tinted panels for explanation, not filler. Do not put cream or linen fills on cards.
- Status text states what happened or remains, with a corrective action when relevant. Success and error combine text and surface color.
- Destructive controls have explicit labels. Draft-only removal must not remove a persisted record.

### Images and icons

Person avatar fallbacks share the chat palette across the app: `--avatar-3-surface` and `--avatar-3-foreground`, applied through `.person-avatar`. Use the same pair for initials and anonymous profile icons, including task assignees and activity feeds. Uploaded profile photos keep their original appearance. Department and group marks remain separate from person avatars.

- Brand and domain artwork should be original, with precise linework and limited navy/blue/sage color. `public/pixbe-workspace-plan.png` is the first reference asset.
- Lucide is acceptable for small utility actions (back, close, upload, delete), not as the visual identity and not on every heading or card.
- Informative icons need accessible text or an adjacent label; purely decorative art should be hidden from assistive technology.

## Do's and Don'ts

### Do:

- **Do** use the setup flow as the visual reference for color, type, and controls, at the tighter workspace scale, while keeping workspace pages full-width.
- **Do** use real content states, clear validation, and accurate save and launch language.
- **Do** pair Quiet Mist canvas (`#f3f5f7`), Clean Sheet white (`#ffffff`), deep ink, measured blue, and quiet sage.
- **Do** test desktop and phone layouts, keyboard use, focus, and contrast.
- **Do** give company and institute workflows equal care while preserving their distinct terminology.

### Don't:

- **Don't** seed a new workspace with fake offices, people, departments, or roles.
- **Don't** decorate with a wall of generic Lucide icons, gradients, glow, oversized shadows, or multi-colored cards.
- **Don't** mark a step complete or show a save confirmation before data is persisted.
- **Don't** put a muted subtitle under a page or section title. The heading is enough.
- **Don't** transpose the onboarding layout wholesale onto a dashboard or table, or use setup hero type (20–26px) as a workspace page title.
- **Don't** specify or implement tightly packed UI: 6px gutters, 11px labels, 32px cramped controls, or 6px table cells as the product default.
- **Don't** use warm paper, linen, taupe, or cream card fills. Those were tried and rejected.
- **Don't** assume the dark theme already matches this guide; migrate and test it deliberately.


## Mobile v2 reference

For phone layouts at 767px and below, use the Mobile v2 section (323:12254) in the HR Solutions Figma file and the implementation map in design-system/mobile-v2.md. Its white canvas, flat rows, 64px header, 48px form controls, 8px control radius, and Home / Work / Time / Chat / More navigation supersede the earlier mobile interpretations. Preserve existing data, permissions, validations, and actions. The desktop rules above continue to apply at larger widths.
