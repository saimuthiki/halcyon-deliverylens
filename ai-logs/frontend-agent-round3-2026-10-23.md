# Frontend agent, round 3 (23 Oct 2026)

**Agent:** Frontend Developer agent (Claude Code), skills `frontend-design` and `ux-researcher-designer`.
**Brief:** The team lead found the app too high-level. They could not see the client's process, where emails come in, how the WMS fits, where the AI agents act, or what each number means.
**Scope:** `frontend/` and `e2e/` only. No git commands. `backend/` was not edited; a backend agent built the `/api/desk/*` endpoints at the same time.

## What changed

| Area | Change |
|---|---|
| New landing page | `/how-it-works`. `/` and unknown routes now redirect here, and it is the first nav item under "Start here". It has: the problem in one sentence with 71% / 94% / $14.2M (from `/kpis`, with the saved analysis as fallback); a 10-step horizontal map of the order journey, grouped into 4 phases (order comes in, warehouse, transport, after delivery); a **Today / With DeliveryLens** switch; and amber markers that show the points each of the 5 causes costs at the step where it hits (6.9 / 5.4 / 4.9 / 7.7 / 3.1). With DeliveryLens adds badges for Safety check (Guardrail), Order Intake Agent (AI), Address check (Rule), Promise check (Rule), Stock check (Data), Carrier advisor (Rule), Delay Alert Agent (AI) and Ask DeliveryLens (AI), and each badge links to the page that shows it. A dashed bracket marks the only step the $680K routing tool changes (the drive). Below the map: a legend explaining why the work is split (AI handles language; rules and data are deterministic and auditable) and a numbered "Start here" path of 9 pages. |
| Overview moved | `/overview` (lazy-loaded now). |
| New page | `/order-desk` "Order desk (live)", first under AI agents. Layout: the inbox list (scenario, "Expect:" chip, New/Done status with a match tick) next to the selected email (headers, the scenario explanation, body, attachments shown as text), with **Run DeliveryLens on this email** and **Run all 12**. Below that, a vertical pipeline trace: step number in the actor colour, title, actor badge with agent name, a pass/warn/fail/skipped icon and word, summary, duration, and a **Details** toggle with a friendly key/value view (nested objects and arrays, Yes/No, "none"). Next to the trace: the decision card (accepted / on hold / needs review / blocked, reason, "Matches expected" or "Expected X") and the reply to the client marked **DRAFT — needs approval**. At the bottom: the **Warehouse system (WMS) — orders created** table and **Reset demo**. The header shows which LLM answered (taken from the process response, or from `/health` before the first run). |
| Help on every page | `PageHeader` renders a **What am I looking at?** panel for the current route (content in `src/lib/help.ts`, 12 pages). It is closed by default, and its open state is remembered per page in `localStorage`, wrapped in try/catch. Each element gets one plain-English line, with a concrete example from the data. |
| AI badge | `AiBadge` in the sidebar, the mobile top bar and the mobile menu, driven by `/api/health` (the health result is now stored when the app probes the API). It shows `AI: Mock (canned)`, `AI: Gemini <model>`, `AI: Bedrock` or `AI: API offline`. When `llm_ready` is false, the badge turns amber and gets a hover/focus tooltip: "Add GEMINI_API_KEY to backend/.env". |
| Offline | `src/api/deskFixtures.ts` holds 12 sample emails (same scenarios and expected decisions as the backend) and a deterministic, pre-computed 10-step trace per email, built from a fixed answer key. It also keeps an in-tab WMS so that Run, Run all and Reset all work offline. The page shows a **Sample — API offline** note and, before any run, the pre-computed trace for the selected email. The fixtures load on demand (a 22 kB chunk), not in the main bundle. Desk calls fall back to the fixtures on network errors and on 404 (endpoints not deployed). Any other API error is shown as an error. |
| Design tokens | `ai` (violet), `data` (blue) and `guard` (wine) colours in `tailwind.config.js`; Rule reuses the existing route teal. Each actor also has its own icon, so colour is not the only cue. Everything else uses the existing system (Barlow, ink/paper/route/late, panels). |

## Contract differences found against the live backend (handled in the normalisers)

- `client_email_draft` is an object `{kind, to, subject, body}`, not a string. The UI accepts either, and shows To/Subject when present.
- WMS `status` can carry a suffix, e.g. `on_hold_missing_address`. Chips match on the prefix and show the suffix underneath ("missing address").
- Step `agent_name` can be `null`; the actor label is shown instead.
- `received_at` is `"2026-10-23 06:45"` (space, not `T`); the time parsing handles both.
- `/desk/reset` returns `{wms_orders_cleared, status}`, not `{ok:true}`; only an explicit `ok:false` counts as a failure.
- Message ids are `M01`–`M12`; the offline fixtures use the same ids.

## Verification

- `npm run typecheck`: clean.
- `npx vitest run`: 27/27 pass. New tests: `desk.test.tsx` covers the fixtures (12 ids and decisions; every trace has the 10 keys in order and matches its expected decision; scenario behaviour for 04/08/09/10; process-all gives 11 WMS orders and reset empties them), normalisers (string and object draft, zip/quantity aliases), the AI label, Trace/Details, DecisionCard, KeyValues, HelpPanel (closed by default, remembered, content for every page). `howitworks.test.tsx` covers 10 steps, 5 causes, 1 routing bracket, and badges only in With mode.
- `npm run build`: OK.
- Playwright against the live API (mock LLM, scratch copy of the SQLite DB) and `vite preview`: **30/30 pass**. New files: `howitworks.spec.ts` (journey, toggle, badge link, help panel remembered, AI badge) and `desk.spec.ts`. The desk tests run serially, because they share desk state on the API. They cover one email (10 steps in contract order, details expand, On hold, draft, 1 WMS row), Run all (12 of 12 match, 11 WMS rows, 8 ready, 1 needs review), the injection email being blocked, and Reset. Existing tests now open `/overview` instead of `/`. Smoke covers the 2 new pages, checks that the help panel is closed on every page, and checks that `/` redirects. The offline test also covers the Order desk sample mode.
- Visual review of the e2e screenshots at 1366 px. That review led to a fix: long carrier reasons were stretching the WMS rows, so they are now clamped to 2 lines with the full text on hover, and the ids, dates and lines no longer wrap.

## Open points

- The process map scrolls sideways below about 1530 px wide, and a hint says so. Ten readable columns do not fit next to the sidebar on a laptop.
- After **Run all**, the per-email trace is not loaded (`process-all` returns only decisions). The trace panel says so and offers a re-run.
- `Run all` shows `matches_expected of processed` exactly as the API returns it. If some emails were already processed, the API counts only the new ones (seen: 11 of 11).
