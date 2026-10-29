# Scalability: measured on the real data and on 10 times the data

**Run on:** 2026-10-29, a Windows 11 laptop, Python 3.12, SQLite, mock AI, one process, one request at a time.
**How:** [`scalability_bench.py`](scalability_bench.py). For "x10" it writes a copy of the dataset into a temp folder
with every delivery (and its SLA penalties) repeated 10 times under new ids. The real data in `data/` is never changed.

```bash
backend/.venv/Scripts/python.exe evidence/scalability_bench.py 1    # the real 48,340 deliveries
backend/.venv/Scripts/python.exe evidence/scalability_bench.py 10   # 483,400 deliveries
```

## Results

| Step | x1: 48,340 deliveries (8.1 MB CSV) | x10: 483,400 deliveries (83.4 MB CSV) |
|---|---|---|
| Loader: CSV into the database (`python -m app.loader`) | 1.8 s | 21.1 s |
| First request after a restart: read DB, tag the 5 causes, fit models (cold cache) | 1.8 s | 20.7 s |
| Peak Python memory for the in-memory dataset (tracemalloc) | 75 MB | 750 MB |
| `GET /api/kpis` | 33 ms | 356 ms |
| `GET /api/causes` | 2 ms | 5 ms |
| `POST /api/simulate` (all 5 fixes at 80%) | 13 ms | 108 ms |
| `POST /api/simulate/late-orders` (replay of every late same-day order) | 34 ms | 271 ms |
| `GET /api/vendor-assessment`, `GET /api/roi` | 2 ms | 5 ms |
| `GET /api/carriers/scorecard` | 44 ms | 200 ms |
| `GET /api/carriers/claims` (penalty recovery) | 36 ms | 236 ms |
| `GET /api/risk-board` (one morning) | 78 ms | 959 ms |
| `GET /api/risk-board/backtest` (Aug-Sep) | 51 ms | 706 ms |
| `POST /api/desk/process-all` (11 emails, mock AI) | 363 ms | 1,495 ms |
| HTTP errors | none (11 of 11 = 200) | none (11 of 11 = 200) |

The live API on AWS (t3.small, real data, Bedrock) answered a GET from a laptop on 2026-10-29 in about 1 to 2 s
including the internet round trip (`/api/health` 1.3 s, `/api/kpis` 1.9 s, `/api/causes` 1.0 s, measured with `curl`).

## What this means

- **At today's size everything is interactive:** every analytics call is under 0.1 s once the data is in memory.
- **At 10 times the data it still works with no code change**, and every answer is still correct (all 200).
  Most calls grow about 5 to 10 times, roughly in line with the data. Nothing is quadratic.
- **What breaks first at 10x** (in order):
  1. **Memory.** The API keeps the whole dataset in memory (pandas). 750 MB at x10 is close to the limit of the
     t3.small server (2 GB RAM, shared with Docker and Caddy). Two worker processes would not fit.
  2. **Cold start.** The first request after a deploy takes about 21 s at x10 (1.8 s today). Browsers and Caddy
     wait, but it feels broken.
  3. **The 08:00 risk board** takes about 1 s per morning at x10.
  4. **AI cost and the rate limit**, not the code: each Order desk email makes about 2 AI calls. At 10 times the email
     volume, the in-memory per-IP rate limit (30 a minute, per process) and the Bedrock bill grow with it.
- **How to fix it** (also in the [roadmap](../docs/12-scalability-and-roadmap.md)):
  1. Pre-compute the cause tags and per-day aggregates in PostgreSQL (a materialised view refreshed at night), so
     the API reads small summary tables, not every row.
  2. Warm the cache in the deploy step (call `/api/kpis` once after restart; the deploy already calls `/api/health`).
  3. Move to a t3.medium (4 GB), or run the API on ECS Fargate with 2+ tasks behind a load balancer.
  4. Move the rate limiter to a shared store (Redis / ElastiCache) or to the proxy; add a daily Bedrock budget alarm.
  5. Order emails: put them on a queue (SQS) and let a worker process them, so a burst of emails cannot slow the website.

## Reuse for another client or use case

Nothing in the code is tied to Halcyon's numbers. What a new client changes:

| To change | Where | Code change? |
|---|---|---|
| The data (any carrier/3PL export with the same columns) | `DATA_DIR` setting, `python -m app.loader --data-dir PATH` | No |
| The cutoff times (grace, hard stop) | `SAME_DAY_GRACE_UNTIL`, `SAME_DAY_HARD_STOP` | No |
| Warehouse time zone | `WAREHOUSE_TZ` | No |
| The sample order inbox | `INBOX_DIR` with its `manifest.json` | No |
| The AI model | `LLM_PROVIDER` (mock, gemini, bedrock), `BEDROCK_MODEL_FAST` / `_SMART` | No |
| Fix effectiveness and costs for the business case | `REALISTIC_EFFECTIVENESS`, `FIX_COST_USD_PER_YEAR` in `analysis/root_cause_analysis.py` | One constant |
| A new cause (for example "weather") | one tag function in `backend/app/analytics/causes.py`; the fair-share maths, simulator and charts take any list of causes | Small |

The x10 run above is itself a reuse test: a different dataset, loaded with `--data-dir`, with no code change.
The same "find the causes, fix each one, prove it" pattern fits any operation with a late/on-time flag and a few
yes/no problem flags, for example field-service visits (first-time fix) or hospital discharges (on time or not).
