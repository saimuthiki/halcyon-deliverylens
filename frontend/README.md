# DeliveryLens frontend

The web app for Halcyon DeliveryLens: why deliveries are late, what each fix is worth, and the AI agents that fix the causes.

React 18, TypeScript (strict), Vite 5, Tailwind CSS 3, React Router 6, Recharts 2. One typeface (Barlow, bundled through `@fontsource`, so no external font requests).

## Run it

```bash
cd frontend
npm install
cp .env.example .env        # optional; defaults to http://localhost:8000
npm run dev                 # http://localhost:5173
```

The API does not need to be running. If it cannot be reached, a banner says **Showing sample data** and every page uses the saved analysis in `src/api/mockSnapshot.ts` (generated from `analysis/output/findings.json` and the dataset by `scripts/generate_snapshot.py`). Agent pages fall back to rule-based stand-ins, and every such result is labelled **Sample response — API offline**.

To regenerate the snapshot after the analysis changes (from the repository root): `backend/.venv/bin/python frontend/scripts/generate_snapshot.py` (needs pandas).

## Build, preview and test

```bash
npm run build      # tsc -b (strict) + vite build -> dist/
npm run preview    # serves dist/ on http://localhost:4173
npm test           # vitest: waterfall transform, simulator maths, order-intake parser, component rendering
npm run typecheck
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | Base URL of the DeliveryLens API. The app calls `${VITE_API_URL}/api/...`. Set at build time. |
| `VITE_DEMO_TOKEN` | empty | If set, sent as the `X-Demo-Token` header on `POST /api/agents/*`. A 401/403 or 429 from the agents is shown as a plain message (missing token, too many requests). |

## Pages

| Route | Page |
|---|---|
| `/` | Redirects to `/how-it-works` (the landing page) |
| `/how-it-works` | How it works: the problem in one sentence with 71% / 94% / $14.2M; a 10-step map of the client's order journey with a **Today / With DeliveryLens** switch (badges link to the page that shows each agent or rule), the five causes with points lost at the step they hit, the $680K routing tool bracket on the road only; legend (AI agent / Rule / Data lookup / Guardrail) and a numbered "Start here" path |
| `/order-desk` | Order desk (live): inbox of 12 sample client emails (`/desk/inbox`), selected email with attachments, **Run DeliveryLens on this email** / **Run all 12**, a 10-step pipeline trace (actor colour, status, summary, friendly details, duration), decision card with "matches expected", the drafted reply (DRAFT — needs approval), the **WMS orders** table (`/desk/wms-orders`) and **Reset demo**. Shows which LLM is answering. Offline it shows the sample inbox and pre-computed traces from `src/api/deskFixtures.ts`, labelled **Sample — API offline** |
| `/overview` | Overview: on-time 71% vs 94% benchmark. Headline is the realistic case (90.2%); the delivery track shows today 71.0%, routing vendor only 80.2%, process fixes only 86.7%, all five realistic 90.2%, the ceiling 99.0% ("if every cause were fully removed") and the benchmark. Cost KPIs, monthly trend |
| `/why-late` | Waterfall 71% → 99.0% ceiling (bars = points each cause costs today; realistic 90.2% stated below), cause table, sample late deliveries, delivery drawer with timeline, explanation and **Draft delay alert** with forecast delay, date and basis (`?cause=` deep-links a cause) |
| `/vendor` | Today / vendor only / process fixes / realistic / ceiling against the benchmark; "each fix must work ~84% of the time"; what the vendor really adds (route deviation ~3 pts; carrier switching needs no software); **Business case** table from `/roi`; recommendation |
| `/what-if` | Slider per cause (starts at the realistic plan), projected on-time gauge computed with the same cause-combination model as the API, points per cause, late deliveries and penalties avoided |
| `/carriers` | Carrier × region heatmap (7 weak lanes: D everywhere, E to West, F to Northeast/Southeast), recommended carrier per region, carrier scorecard |
| `/stock-routes` | Stock & routes: stock-out rate per warehouse with on time stocked vs stock-out, worst 10 clients by stock-out, route deviation by carrier and by region (`/stock/placement`, `/routes/deviation`) |
| `/clients` | The 9 at-risk clients with revenue, on-time rate, penalties and main causes |
| `/order-intake` | Order intake agent: extracted order, address check with missing fields highlighted, same-day cutoff warning, drafted follow-up |
| `/ask` | Ask DeliveryLens chat with suggested questions |
| `/activity` | Agent run log |

Every page has a **What am I looking at?** panel under the title (closed by default, open state remembered per page in `localStorage`); the text is in `src/lib/help.ts`. The sidebar shows which AI provider the API is using, from `/api/health` (`AI: Mock (canned)`, `AI: Gemini <model>`, `AI: Bedrock`); when `llm_ready` is false the badge turns amber with a tooltip telling you to add `GEMINI_API_KEY` to `backend/.env`.

## Aligning with the backend

All API knowledge sits in two files:

- `src/api/types.ts`: every response shape. Rates are fractions (0.71), points are percentage points (6.8), money is whole dollars.
- `src/api/client.ts`: endpoint paths, timeouts, the sample-data fallback, and one `normalise*` function per endpoint that maps the backend response to the UI type.

The normalisers were written against the FastAPI backend in `backend/` and checked against a running instance on 23 Oct 2026 (every page loads live with no console errors). Round 2 added `/roi`, `/stock/placement`, `/routes/deviation`, `scenarios.realistic` on `/causes` and the delay-alert forecast fields (written against the agreed shapes while the backend was being changed; not yet checked against a running instance). Notable mappings: `/kpis` `by_month`/`late`; `/causes` `share_of_late`/`points_if_fixed_alone`; `/deliveries/{id}` nested `delivery` and `causes[{cause,label}]`; `/carriers/scorecard` `matrix` as `{region: {carrier: rate}}`, `recommended_by_region`, `weak_lanes`; `/clients/at-risk` `cause_rates` (top two become the cause chips); `/simulate` annual `annual_sla_penalties_avoided_usd`; `/vendor-assessment` `routing_only_ceiling`/`budget_usd`/`routing_causes`; `/agents/order-intake` `extraction` + `checks`; `/agents/delay-alert` `message`; `/agents/runs` `latency_ms`/`created_at`/`status: ok|blocked`. Each normaliser also accepts the UI's own field names. API errors in the backend's `{"error": {"message"}}` shape are shown to the user.

To try against a local backend: run it with `CORS_ORIGINS=http://localhost:5173` on port 8000, then `npm run dev`.

Fallback rules: for analytics, network errors, timeouts, 404 and 5xx fall back to sample data; 4xx validation errors are shown to the user. Agent calls fall back only when the API cannot be reached at all; an agent's 4xx/5xx (for example a model error) is shown as an error, never replaced by a stand-in. After a failed connection the app serves sample data for 30 seconds before trying again; **Try again** in the banner re-checks immediately.

## Hosting on AWS Amplify

`amplify.yml` at the repository root builds with `appRoot: frontend` and publishes `dist/`. In the Amplify console:

1. Set the environment variable `VITE_API_URL` to the deployed API URL.
2. Add a rewrite so client-side routes load the app: source `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>`, target `/index.html`, type `200 (Rewrite)`.
3. Allow the Amplify domain in the API's CORS settings.

## Layout

```
src/
  api/        types.ts, client.ts, mockData.ts (fallback logic), mockSnapshot.ts (generated data), deskFixtures.ts (offline Order desk, loaded on demand)
  lib/calc.ts also holds the cause-combination model (simulateExact) used by the simulator and its offline fallback
  components/ Layout, DeliveryTrack, Waterfall, Gauge, KpiStrip, Drawer, States, ...
  lib/        calc.ts (waterfall + simulator maths), causes.ts, format.ts, useApi.ts
  pages/      one file per route (lazy-loaded except HowItWorks, the landing page)
  __tests__/  vitest tests
```
