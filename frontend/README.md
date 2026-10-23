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

The API does not need to be running. If it cannot be reached, a banner says **Showing sample data** and every page uses the saved analysis in `src/api/mockSnapshot.ts` (generated from `analysis/output/findings.json` and the dataset). Agent pages fall back to rule-based stand-ins.

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

## Pages

| Route | Page |
|---|---|
| `/` | Overview: on-time 71% vs 94% benchmark, the delivery track (today / vendor only / process fixes / all fixed), cost KPIs, monthly trend |
| `/why-late` | Waterfall 71% → 96.6%, cause table, sample late deliveries, delivery drawer with timeline, explanation and **Draft delay alert** (`?cause=` deep-links a cause) |
| `/vendor` | Routing vendor only vs process fixes vs all fixes against the benchmark, $680K vs $14.2M, recommendation |
| `/what-if` | Slider per cause, projected on-time gauge, points per cause, late deliveries and penalties avoided |
| `/carriers` | Carrier × region heatmap with recommended carrier per region, carrier scorecard |
| `/clients` | The 9 at-risk clients with revenue, on-time rate, penalties and main causes |
| `/order-intake` | Order intake agent: extracted order, address check with missing fields highlighted, same-day cutoff warning, drafted follow-up |
| `/ask` | Ask DeliveryLens chat with suggested questions |
| `/activity` | Agent run log |

## Aligning with the backend

All API knowledge sits in two files:

- `src/api/types.ts`: every response shape. Rates are fractions (0.71), points are percentage points (6.8), money is whole dollars.
- `src/api/client.ts`: endpoint paths, timeouts, the sample-data fallback, and one `normalise*` function per endpoint that maps the backend response to the UI type.

The normalisers were written against the FastAPI backend in `backend/` and checked against a running instance on 23 Oct 2026 (every page loads live with no console errors). Notable mappings: `/kpis` `by_month`/`late`; `/causes` `share_of_late`/`points_if_fixed_alone`; `/deliveries/{id}` nested `delivery` and `causes[{cause,label}]`; `/carriers/scorecard` `matrix` as `{region: {carrier: rate}}`, `recommended_by_region`, `weak_lanes`; `/clients/at-risk` `cause_rates` (top two become the cause chips); `/simulate` annual `annual_sla_penalties_avoided_usd`; `/vendor-assessment` `routing_only_ceiling`/`budget_usd`/`routing_causes`; `/agents/order-intake` `extraction` + `checks`; `/agents/delay-alert` `message`; `/agents/runs` `latency_ms`/`created_at`/`status: ok|blocked`. Each normaliser also accepts the UI's own field names. API errors in the backend's `{"error": {"message"}}` shape are shown to the user.

To try against a local backend: run it with `CORS_ORIGINS=http://localhost:5173` on port 8000, then `npm run dev`.

Fallback rules: network errors, timeouts, 404 and 5xx fall back to sample data; 4xx validation errors are shown to the user. After a failed connection the app serves sample data for 30 seconds before trying again; **Try again** in the banner re-checks immediately.

## Hosting on AWS Amplify

`amplify.yml` at the repository root builds with `appRoot: frontend` and publishes `dist/`. In the Amplify console:

1. Set the environment variable `VITE_API_URL` to the deployed API URL.
2. Add a rewrite so client-side routes load the app: source `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>`, target `/index.html`, type `200 (Rewrite)`.
3. Allow the Amplify domain in the API's CORS settings.

## Layout

```
src/
  api/        types.ts, client.ts, mockData.ts (fallback logic), mockSnapshot.ts (generated data)
  components/ Layout, DeliveryTrack, Waterfall, Gauge, KpiStrip, Drawer, States, ...
  lib/        calc.ts (waterfall + simulator maths), causes.ts, format.ts, useApi.ts
  pages/      one file per route (lazy-loaded except Overview)
  __tests__/  vitest tests
```
