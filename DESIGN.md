---
name: Halcyon DeliveryLens
description: Decision and operations tool that shows why Halcyon's deliveries are late and fixes each cause.
colors:
  ink: "#15212B"
  ink-soft: "#3A4852"
  paper: "#F3F5F4"
  surface: "#FFFFFF"
  line: "#D9DFDD"
  slate: "#5E6B75"
  slate-light: "#E7ECEA"
  route: "#0E6B63"
  route-dark: "#0A524C"
  route-tint: "#E3F1EE"
  late: "#A84F0B"
  late-tint: "#FBEEE2"
  ai: "#5B47B0"
  ai-tint: "#EEEBF9"
  data: "#2C5D8F"
  data-tint: "#E5EEF7"
  guard: "#8A2F4E"
  guard-tint: "#F8E8EE"
typography:
  page-title:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  page-title-mobile:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
  lede:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.625
  section-title:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
  kpi:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
rounded:
  sm: "6px"
  md: "8px"
  full: "9999px"
spacing:
  panel: "20px"
  panel-wide: "24px"
  stack: "24px"
components:
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "24px"
  button-primary:
    backgroundColor: "{colors.route}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    height: "40px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.route-dark}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "40px"
  badge-ai:
    backgroundColor: "{colors.ai-tint}"
    textColor: "{colors.ai}"
    rounded: "{rounded.full}"
  badge-rule:
    backgroundColor: "{colors.route-tint}"
    textColor: "{colors.route-dark}"
    rounded: "{rounded.full}"
  badge-data:
    backgroundColor: "{colors.data-tint}"
    textColor: "{colors.data}"
    rounded: "{rounded.full}"
  badge-guardrail:
    backgroundColor: "{colors.guard-tint}"
    textColor: "{colors.guard}"
    rounded: "{rounded.full}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
---

# DeliveryLens design system

Source of truth: `frontend/tailwind.config.js`, `frontend/src/index.css` and the shared components in
`frontend/src/components/`. This file describes them so people and AI agents building new screens stay
on-brand. If the code and this file disagree, the code wins; update this file.

## Overview

An operations tool for a logistics company's leaders and customer-success team, used at a desk during the
working day. It has to be trusted at a glance, so it is calm, light and dense with real numbers. Expression
lives in meaning, not decoration: **orange is the problem, teal is the fix, purple is AI.** Every page
opens with a heading that states its finding in plain English ("On-time delivery is 71%. The benchmark is
94%."), followed by a "What am I looking at?" key.

Mode: Operate (dashboards, the Order desk) and Read (How it works). There are no marketing surfaces.

## Colors

- **Neutrals.** `paper` is the page, `surface` is panels, `line` is borders, `ink` and `ink-soft` carry
  text and `slate` is secondary text. `slate-light` fills empty tracks and skeletons.
- **Meaning colours. Never use them as decoration.**
  - `late` (orange): today's situation, lateness, money lost, warnings.
  - `route` (teal): fixes, rules, the realistic plan, primary actions and focus rings.
  - `ai` (purple): anything an AI agent did (the AI badge, Order Intake and Client Reply Agent steps).
  - `data` (blue): data lookups. `guard` (wine): the safety screen.
- Each meaning colour has a `-tint` for chip and callout backgrounds. Text on a tint uses the full colour,
  or the `-dark` variant for teal.
- Text selection is `#cfe6e1` and the focus outline is 2px `route`, both set globally in `index.css`.

## Typography

One family: **Barlow** (400, 500, 600, 700, self-hosted via `@fontsource/barlow`) for headings, labels, body
and data. Numbers use `tabular-nums lining-nums` (the `.num` class) so columns and KPIs line up.

- Page title 34px bold (28px on phones), tight tracking, `text-wrap: balance`.
- Lede 17px in `ink-soft`, at most about 760px wide.
- Section titles 18px semibold. Body text 15px. Meta, table headers and notes 14px in `slate`.
- KPI values 26 to 28px bold, coloured by meaning (orange for today, teal for the plan).

## Layout

- Fixed left sidebar on desktop, grouped as *Start here*, *The decision*, *Operations* and *AI agents*,
  with the AI badge under the logo. On phones it becomes a top bar with a Menu button and a drawer.
- Content column: page header, then the help key, then panels stacked with a 24px gap. Two-column grids
  appear only at `lg`.
- Panels are padded 20px (24px from `sm`). Tables scroll sideways inside their panel and never widen
  the page.

## Elevation & Depth

Flat. Panels are separated by a 1px `line` border on `paper`, not by shadows. Shadows are reserved for
things that float above the page: the mobile drawer, the AI badge tooltip, the selected segment of a
toggle. No glass, glow or gradient fills; the only gradients are the dashed tracks on the Overview chart.

## Shapes

`rounded-md` (6px) for buttons and fields, `rounded-lg` (8px) for panels, and fully rounded for chips,
actor badges and step numbers. Icons are Lucide, 16px, at one stroke weight.

## Components

- **Buttons:** `.btn-primary` (teal, white text, at least 40px tall), `.btn-secondary` (white with a line
  border) and `.btn-quiet` (teal text). One primary action per panel.
- **Panels:** `.panel` plus `.panel-pad`, titled with the shared `SectionTitle` and a right-aligned note.
- **Actor badges** (`components/Actor.tsx`): AI agent, Rule, Data lookup and Guardrail, each with its own
  icon and tint. Use them wherever the UI says who did something.
- **Pipeline trace** (Order desk): a numbered vertical list. The step dot takes the actor colour, the
  status is Passed, Warning, Blocked or Skipped, and details open inline. A run plays step by step: an
  envelope moves down the rail (`components/DeskAnimation.tsx`), each step's dot fills with its actor colour
  as it finishes, the stock and carrier steps show a small one-shot trip, and the Decision card waits until
  the run ends.
- **Trip drawings** (`components/TripArt.tsx`): warehouse, client building and a truck that drives a road.
  Teal = the right trip, orange = the problem trip; buildings are neutral.
- **States:** skeleton blocks while loading (`animate-pulse` on `slate-light`), an inline error with a Retry
  button, and an amber "Sample, API offline" notice whenever offline data stands in for live data.
- **Help key:** `HelpPanel`, closed by default, remembers being opened, on every page.
- **Fields:** `.field`, with a visible label or an `sr-only` one. Never use a placeholder as the only label.

## Do's and Don'ts

**Do**
- State the finding in the page title, using the real number.
- Keep colour semantic: if something is not late, a fix or AI, it is neutral.
- Label who acted (AI agent, rule, data lookup, guardrail) and show the evidence behind each decision.
- Keep routine motion at 150 to 250ms. Longer motion is only for the explainers (Order desk run, Stock & routes
  trucks, the 08:00 clock): it shows a process, plays when on screen, and pauses or stops when off screen. Count-ups and bar growth ease out (`EASE_OUT`). Everything goes through
  `lib/motion.ts`, so `prefers-reduced-motion` shows the final state with no movement.
- Mark sample or estimated numbers as such.

**Don't**
- Don't add a second typeface, gradient text, glass effects, or purple outside AI.
- Don't use cards as decoration, nest cards, or add coloured left borders above 1px (the KPI rule lines
  in How it works are the one existing exception).
- Don't put shadows on panels at rest, or use bouncing or pulsing attention effects.
- Don't invent numbers. Every figure traces back to the dataset or a stated estimate.
