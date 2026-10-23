# Frontend agent log, round 2, 2026-10-23

**Role:** Frontend developer (Frontend Developer agent, Claude Code), skills `frontend-design` and `kpi-dashboard-design`.
**Task:** Bring the dashboard in line with the corrected analysis (`analysis/output/findings.json`) and the review in `ai-logs/reality-check-2026-10-23.md`: honest ceiling vs realistic framing, Carrier D everywhere, a business case, the missing stock and route views, clearer agent fallbacks, and updated tests.
**Scope:** `frontend/` and `e2e/` only. No git commands. `backend/`, `analysis/`, `docs/`, `deck/` untouched (a backend agent was changing `backend/` in parallel).

## What changed

| Area | Change |
|---|---|
| Offline snapshot | New `frontend/scripts/generate_snapshot.py` regenerates `src/api/mockSnapshot.ts` from `findings.json` and the dataset, reusing the tagging in `analysis/root_cause_analysis.py`. Before regenerating, it reproduced the old monthly, carrier and at-risk blocks exactly, so only the analysis changes moved. New exports: `COMBOS` (the 30 cause combinations with on-time rate, at-risk count and late-delivery money), `ROI`, `STOCK_PLACEMENT`, `ROUTE_DEVIATION` and `CAUSE_DELAY_DAYS`. |
| Simulator maths | The linear "fair-share × effectiveness" estimate is gone. `lib/calc.ts` now has `simulateExact`, a TypeScript port of `expected_on_time` and `yearly_savings` plus a Shapley split, so the simulator and its offline fallback give the API's numbers. Unit tests check it against every scenario in `findings.json`: 71.0 / 80.2 / 86.7 / 90.2 / 99.0, and the realistic penalties and redelivery figures within $2. |
| Honest framing | Overview headline: realistic 90.2%, with 99.0% described as "the ceiling if every cause were fully removed, not a forecast". The delivery track has five stops (today, vendor only, process fixes only, all five realistic, ceiling) plus the benchmark. Labels alternate above and below the road so the close stops do not collide. The ceiling is drawn dashed and faint, and the realistic effectiveness for each cause is listed under the track. Why-late: "Five causes account for 28 of the 29 points lost", "associated with" wording, a waterfall ending in a dashed "Ceiling, all removed" bar, and the realistic 90.2% stated beneath it. |
| Vendor page | Five bars (today, vendor only, process fixes, realistic, ceiling). "Each fix must work ~84% of the time to reach 94%." "What the vendor actually adds": route deviation (~3.1 pts) is its only unique contribution, and carrier switching needs no software (~$84K/yr of higher rates, estimate). A **Business case** table from `GET /api/roi` shows on-time, penalties avoided/yr, redelivery avoided/yr, cost/yr (estimate), net/yr and net using penalties only, with an assumptions disclosure. The recommendation fallback now starts "Do not sign as scoped". |
| Carriers | Title "Carrier D is weak in every region. E and F are weak on three lanes."; lede computed (7 lanes, 7.7 pts); legend and preferred-supplier sentence updated. |
| New page | `/stock-routes` "Stock & routes" (nav: Operations), built from `GET /api/stock/placement` and `GET /api/routes/deviation` with sample fallbacks. Each with-vs-without comparison is drawn as a dumbbell. The page is honest about what the data shows: stock-outs (12–13%) and deviation (5–7%) are spread evenly across warehouses, carriers and regions, so the fix is a rule, not one site. |
| Agents | Every agent result from the offline stand-in carries "Sample response — API offline" (order intake, delay alert, each Ask answer). Agent calls now fall back only when the API is unreachable; an agent 4xx/5xx is shown as an error (review finding #12). `VITE_DEMO_TOKEN` is sent as `X-Demo-Token` on `POST /api/agents/*`. 401/403 and 429 errors get plain messages. The delay alert drawer shows `predicted_delay_days`, `predicted_date` and `basis`. The offline stand-in also forecasts (median days late for the delivery's worst cause) and no longer claims actions nobody took (review finding #10). |
| Copy | Mock Ask answers and agent-run summaries updated (new numbers, Carrier D, stock, a business-case answer). Order intake no longer calls addresses "the largest single cause". |
| Layout fix | `.overflow-x-auto { position: relative }`: screen-reader-only spans inside scrolling tables were widening the page on phones (pre-existing on /why-late and /carriers). |
| Tests | Unit tests rewritten for the new numbers and model (15 pass). Playwright: new numbers in overview, why-late and offline; a delay-forecast check; new tests for the business-case table (exact values from `findings.json` scenarios) and the Stock & routes page; smoke list updated; `E2E_DEMO_TOKEN` support. |

## Verification

- `npm run typecheck`: clean. `npx vitest run`: 15/15 pass. `npm run build`: OK (the new page is a 11.6 kB lazy chunk).
- `npx tsc -p e2e`: clean. The e2e suite was **not** run, because the backend is mid-change.
- Offline visual check with Chromium at 1366, 800 and 390 px on every changed page, plus the agent flows (order intake, delay alert drawer, Ask). There is no horizontal page scroll at 390 px. The only console output is the existing Recharts `defaultProps` dev warnings.

## Assumptions and open points

- **84% is rounded.** `effectiveness_needed_for_94_benchmark` is 0.84, but at exactly 84% on every fix the model gives 93.9%. The true threshold is about 84.4%. The UI says "~84%" as requested. The unit test asserts that 85% clears 94% and 83% does not.
- **Shapes are as briefed, not yet seen live.** The normalisers accept the agreed shapes (`/roi`, `/stock/placement`, `/routes/deviation`, `scenarios.realistic`, delay-alert forecast fields) plus a few aliases. They have not been run against the new backend. Re-run the e2e suite once the backend lands.
- **Stock fallback definitions are mine.** Warehouse = the nearest warehouse. Worst clients = clients with at least 50 deliveries, ranked by stock-out rate. Deviation = more than 20% beyond the planned km, and missing actual km counts as not deviated. If the backend defines these differently, live values will differ slightly from the fallback. The e2e test checks structure and the stock-out < stocked ordering, not exact values.
- **ROI is not recomputed.** The business-case table shows the API's figures. The fallback is `findings.json` `scenarios[]` verbatim. Costs are labelled as estimates everywhere.
- `late_deliveries_avoided` in the simulator covers the 6-month data window, as before. Money is per year.
