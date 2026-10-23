# Frontend agent log, 2026-10-23

**Role:** Frontend developer (Frontend Developer agent, Claude Code)
**Task:** Build the DeliveryLens dashboard in `frontend/` for the COO and CFO of Halcyon Logistics.
**Human reviewer:** Dinesh K. The lead commits; the agent ran no git commands.

## What was built

A React 18 + TypeScript (strict) + Vite 5 + Tailwind 3 + React Router 6 + Recharts 2 app. It has nine pages behind a left navigation in three groups: *The decision*, *Operations* and *AI agents*.

| Page | Route | Contents |
|---|---|---|
| Overview | `/` | Headline "On-time delivery is 71%. The benchmark is 94%." followed by the one-sentence answer. The delivery track shows today 71.0%, routing vendor only 78.6%, process fixes 86.7%, all fixed 96.6% and the 94% benchmark. A KPI strip shows 14,019 late deliveries, $872K penalties, $477K redelivery cost and $14.2M at risk. Also a monthly trend and the points each fix is worth. |
| Why deliveries are late | `/why-late` | Waterfall 71% → +6.8 / +5.7 / +5.3 / +4.8 / +3.0 → 96.6% with a benchmark line. Cause table: select a bar or a row (deep link `?cause=`). Sample late deliveries for the selected cause. Delivery drawer with timeline, plain-English explanation and **Draft delay alert**. |
| Vendor decision | `/vendor` | Today, routing vendor only, process fixes and all fixes against the 94% line. $680K against $14.2M. Which of the five causes the vendor reaches. Recommendation card. |
| What-if simulator | `/what-if` | One slider per cause (0–100%) plus presets. Gauge, points gained, late deliveries avoided, penalties and redelivery cost avoided per year, at-risk client projection, points by cause. |
| Carriers | `/carriers` | Carrier × region heatmap with weak lanes, best carrier per region and the recommendation. Scorecard table. |
| At-risk clients | `/clients` | 9 clients with revenue bars, on-time rate, penalties, channel, main-cause chips and totals. |
| Order intake agent | `/order-intake` | The 5 backend sample emails, or paste your own. Shows the extracted order, an address check with missing fields highlighted, the same-day cutoff warning and a drafted follow-up. |
| Ask DeliveryLens | `/ask` | Chat with suggested questions. |
| Agent activity | `/activity` | Agent run log with guardrail flags and status. |

All API code sits in `src/api/types.ts` (UI types) and `src/api/client.ts` (fetch wrapper, fallback, one normaliser per endpoint). If the API cannot be reached, a banner says **Showing sample data**. Pages then use `src/api/mockSnapshot.ts`, which was generated from `analysis/output/findings.json` and the dataset: monthly trend, carrier × region matrix, the 9 at-risk clients, and 8 real late deliveries per cause. The agent fallbacks in `src/api/mockData.ts` are rule-based and labelled as sample data.

The backend was finished while this work was in progress. The agent started it on a spare port, recorded the real response shapes and rewrote the normalisers to match. Every page was then checked against the live API.

## Skills used

- **frontend-design:** wrote a design plan before any code. The plan avoids templated defaults: no all-caps eyebrows, no monospace labels, no cream-and-terracotta palette, no grid of identical cards. It puts the boldness in one signature element.
- **ui-ux-pro-max:** ran `--design-system` for "logistics operations executive dashboard". Kept its Swiss-minimal, high-contrast direction, its accessibility rules (4.5:1 contrast, visible focus, reduced motion, 44px targets) and its pre-delivery checklist. Rejected its generic blue/orange palette and its Fira pairing as defaults.
- **kpi-dashboard-design:** four headline KPIs, each with context (a target, a comparison or a period). Drill-down goes from summary (Overview) to cause (Why late) to a single delivery (drawer). The method is stated on the charts ("Vertical axis starts at 60%", "Calculated by the API" or "Estimate from fair-share points").

## Design decisions

- **Palette, 5 colours.** Ink `#15212B` for text. Paper `#F3F5F4` for the background, with white surfaces. Route teal `#0E6B63` for fixed and on time. Late amber `#A84F0B` for late and at risk. Slate `#5E6B75` for secondary text and the vendor option. Teal and amber text both pass WCAG AA on white. There is no red/green pair, and every colour also carries a text label.
- **Typeface.** Barlow only. Its letterforms come from road and rail signage, which suits a logistics company. It is bundled with `@fontsource`, so the page makes no external font requests. All numbers use tabular figures.
- **Signature element: the delivery track.** On-time delivery is drawn as a road from 60% to 100%. Each option is a stop on it and the benchmark is a dashed marker. It answers the CFO and COO question in one picture.
- **Page titles state the findings**, for example "The routing vendor fixes the wrong problem" and "Nine clients are deciding whether to stay". A judge can follow the story from the titles alone.
- **Motion.** The only animation is the drawer sliding in, and `prefers-reduced-motion` is respected. Other accessibility work: a skip link, labelled sliders with `aria-valuetext`, an aria-label that describes each chart, and focus returned when the drawer closes.
- **Responsive layout.** At 1024px and wider there is a fixed sidebar; below that, a top bar with a menu drawer. Tables scroll inside their panel. There is no horizontal page overflow at 1280px or 820px.
- **Simulator.** Moving a slider gives an instant local estimate, which the exact `/simulate` result replaces about 350 ms later when the API is live.
- **Offline behaviour.** One shared health probe runs at start-up. When the API is offline, calls go straight to sample data for 30 seconds, which keeps the demo fast. **Try again** re-checks the API and reloads the page if it is back.

## Build and test results

- `npx tsc -b` (strict, `noUnusedLocals`, `noUnusedParameters`): passes with 0 errors.
- `npm test` (Vitest 2.1): 2 files, 12 tests, all passing.
  - Waterfall transform: start and end bars, ordering, stacking.
  - Simulator maths: nothing fixed, everything fixed (96.6%), partial and clamped values.
  - Order-intake parser on all 5 sample emails: complete; missing street, postcode and country; after cutoff and before cutoff; one-line address.
  - `SimulatorResults` rendering: 87.9%, +16.9 pts, 6.1 pts short of the benchmark; benchmark met.
  - `DeliveryTrack` accessible label.
- `npm run build`: passes. The main chunk is 74 KB (20 KB gzip), React 164 KB (54 KB gzip) and Recharts 391 KB (107 KB gzip). Every page except Overview is lazy-loaded.
- Playwright (chromium 1194, with playwright-core in scratch space) against `vite preview`:
  - **Live backend** (FastAPI from `backend/`, `LLM_PROVIDER=mock`): all 9 pages load, plus the cause drill-down, the drawer, the delay alert, the order intake and an Ask question. There are **no console errors or warnings** and no horizontal overflow.
  - **Backend not running:** all pages render with the sample-data banner. The only console entry is the expected `ERR_CONNECTION_REFUSED` from the single health probe.
- Screenshots in `docs/screenshots/`, taken against the live API: overview, why-late, delivery-detail, vendor-decision, what-if, carriers, order-intake.

## Notes and open items

- **Data written to the backend database.** The live check created agent-run rows in `backend/deliverylens.db`, which git ignores. To clear them, run `python -m app.loader`.
- **CORS.** The backend's default `CORS_ORIGINS` allows ports 5173 and 3000. For `vite preview` (port 4173) or Amplify, add that origin.
- **Agent quality without Bedrock.** With `LLM_PROVIDER=mock`, the backend's regex parser expects the labelled email layout used in `backend/sample_emails`. The UI therefore uses those same five samples.
- **Amplify setup.** It needs `VITE_API_URL` set in the console and an SPA rewrite rule. Both are described in `frontend/README.md`.
