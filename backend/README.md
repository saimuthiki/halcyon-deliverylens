# DeliveryLens backend

FastAPI service behind the DeliveryLens dashboard. It loads the Halcyon dataset into a database, tags every
delivery with the five causes from `analysis/root_cause_analysis.py`, and serves the analytics, the what-if
simulator, the vendor assessment, three AI agents (order intake, delay alert, ask) and the **Order desk**: the
client's real email order process, end to end, from the shared inbox to a warehouse (WMS) order.

The numbers match `analysis/output/findings.json` exactly, scenarios and money included (everything except
`holdout_check`, which is an analysis-only validation). A test checks this
(`tests/test_analytics.py::test_findings_match_analysis_output_exactly`). Headlines: 71.0% on time today;
routing-only ceiling 80.2%; process-only ceiling 86.7%; all five fixes with realistic effectiveness 90.2%;
ceiling with every fix fully adopted 99.0%.

## Run locally (Python 3.11)

```bash
cd backend
python3.11 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env                 # optional; defaults work offline
.venv/bin/python -m app.loader       # load ../data/halcyon-dataset into sqlite:///./deliverylens.db (about 3 s)
.venv/bin/uvicorn app.main:app --reload --port 8000
curl localhost:8000/api/health
```

Interactive API docs: http://localhost:8000/docs

## Use Google Gemini for real AI answers (local demo)

The default provider is `mock`: offline and deterministic. To let the agents give real, dynamic answers:

1. Get a Gemini API key from Google AI Studio (https://aistudio.google.com/apikey).
2. Put it in `backend/.env` (this file is gitignored; never put a key in `.env.example` or in code):

   ```bash
   cd backend
   cp -n .env.example .env          # only if you have no .env yet
   # then edit backend/.env so it contains:
   LLM_PROVIDER=gemini
   GEMINI_API_KEY=paste-your-key-here
   GEMINI_MODEL=gemini-2.5-flash    # optional; this is the default
   ```

   Remove or comment out the `LLM_PROVIDER=mock` line. Values already exported in your shell win over `.env`,
   so `unset LLM_PROVIDER` if you set it there.
3. Restart the API (settings are read once at start-up): stop uvicorn with Ctrl+C and run
   `.venv/bin/uvicorn app.main:app --reload --port 8000` again.
4. Check it: `curl localhost:8000/api/health` should show
   `"llm_provider": "gemini", "llm_model": "gemini-2.5-flash", "llm_ready": true`. `llm_ready` is `false`
   when the key is missing; agent calls then fail with HTTP 502 `llm_error` and a message saying to set
   `GEMINI_API_KEY`.
5. Try it: `curl -X POST localhost:8000/api/desk/process/M06` (or the Order desk screen). The trace shows
   `"llm_provider": "gemini"`, and `/api/agents/runs` lists each call with its latency and tokens.

To go back to offline mode set `LLM_PROVIDER=mock` and restart. With Gemini the wording (and sometimes what
the model reads from an email) can vary between runs; the decisions after the reading step are fixed rules.
The key is never logged: it is excluded from the settings' printed form and removed from any error message.
Uses the official `google-genai` SDK (`google-genai==2.33.0`), JSON mode for the agents that need JSON, and
`LLM_TIMEOUT_SECONDS` as the request timeout.

The loader is idempotent: each run replaces the data tables in one transaction. `--if-empty` skips the
load when data is already there (the deploy script uses it). `--data-dir PATH` points at another CSV folder.

## Test

```bash
.venv/bin/python -m pytest
```

Tests use a throwaway SQLite file and `LLM_PROVIDER=mock`, so they need no network and no AWS.

To run the same suite on PostgreSQL (CI does this in the `backend-postgres` job with a `postgres:16` service),
point `TEST_DATABASE_URL` at a scratch database. The loader replaces the data tables there.

```bash
TEST_DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/deliverylens_test .venv/bin/python -m pytest
```

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./deliverylens.db` | SQLAlchemy URL. For RDS use `postgresql+psycopg://user:pass@host:5432/deliverylens` (`postgres://` and `postgresql://` are converted to psycopg 3) |
| `DATA_DIR` | `../data/halcyon-dataset` | Folder with the CSVs |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Comma-separated allowed origins |
| `LLM_PROVIDER` | `mock` | `mock` (offline and deterministic), `gemini` (Google Gemini, local demo) or `bedrock` |
| `GEMINI_API_KEY` | empty | Gemini API key (put it in `backend/.env` only; never logged) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model for every agent |
| `AWS_REGION` | `us-east-1` | Bedrock region |
| `BEDROCK_MODEL_FAST` | placeholder | Model or inference-profile ID for extraction, routing and delay alerts |
| `BEDROCK_MODEL_SMART` | placeholder | Model or inference-profile ID for `/agents/ask` answers |
| `LLM_TIMEOUT_SECONDS` | `30` | Model call timeout: Bedrock read timeout (3 retries, standard mode) and Gemini request timeout |
| `INBOX_DIR` | `../data/sample-inbox` | Order desk sample emails and `manifest.json` (loaded by `python -m app.loader`) |
| `LOG_JSON` | unset | `true` logs one JSON line per log record (CloudWatch) |
| `WAREHOUSE_TZ` | `America/Chicago` | Warehouse-local time zone for the order-intake 08:00 cutoff check when the request has no `received_at` |
| `AGENT_RATE_LIMIT_PER_MIN` | `30` | Requests per minute per client IP on `/api/agents/*` and the `POST /api/desk/*` routes (in memory, per process; `0` turns it off) |
| `DEMO_TOKEN` | empty | When set, `POST /api/agents/*` and `POST /api/desk/*` need header `X-Demo-Token` with this value (401 otherwise) |
| `S3_BUCKET` | empty | When set, order-intake input and result are archived there, with emails and phone numbers redacted |

The Bedrock model IDs default to the placeholder `SET-ME-bedrock-model-id`. A call that uses the placeholder
fails with a clear error and returns HTTP 502.

## Endpoints (all under `/api`)

| Method | Path | What it returns |
|---|---|---|
| GET | `/health` | status, `db_ok`, deliveries loaded, `llm_provider`, `llm_model`, `llm_ready` (false if the provider lacks its key or model ID) |
| GET | `/kpis` | deliveries, on-time rate, late, by month, SLA penalties, redelivery cost, at-risk clients and revenue, complaints by category, customer success hours |
| GET | `/causes` | one row per cause (deliveries, on-time rate, share of late, points if fixed alone, fair-share points, SLA penalties, realistic effectiveness, fix cost) and the scenarios (`today`, `all_fixed` 0.99, `routing_only`, `process_only`, `realistic` 0.9024, `no_problem_rate`) |
| GET | `/causes/{cause}/deliveries?limit=50` | sample late deliveries with that cause |
| GET | `/deliveries/{delivery_id}` | full row, timeline, causes, plain-English explanation |
| GET | `/carriers/scorecard` | per carrier: rate, on-time, redelivery rate, API, preferred; carrier x region matrix; best carrier per region (tie goes to the cheaper one) |
| GET | `/clients/at-risk` | the 9 clients threatening to leave: revenue, tier, channel, on-time, cause rates, complaints |
| POST | `/simulate` | body `{"fixes": {"incomplete_address": 1.0, "weak_carrier_lane": 0.5}}`: projected on-time, points per cause, at-risk projection, yearly penalties, redelivery cost and late deliveries avoided. The realistic preset gives 0.9024 |
| GET | `/roi` | `assumptions` (realistic effectiveness and yearly fix cost per cause, note), the four `scenarios` (on-time, points, savings, cost, net benefit with and without redelivery), `effectiveness_needed_for_94_benchmark` |
| GET | `/stock/placement` | `by_warehouse` (nearest warehouse: stock-out rate, on-time when stocked vs stock-out) and `worst_clients` (top 10 by stock-out rate, 50+ deliveries) |
| GET | `/routes/deviation` | `by_carrier` and `by_region`: deviation rate, on-time with vs without deviation, missing actual-km rate per carrier |
| GET | `/vendor-assessment` | routing-only 80.2% vs process 86.7% vs realistic 90.2% vs ceiling 99.0%, the vendor's unique part (route deviation, about 3 points), $680K budget, $14.2M at risk, recommendation |
| POST | `/agents/order-intake` | body `{"email_text": "...", "received_at": "YYYY-MM-DD HH:MM"?}`: extraction, address and cutoff checks, follow-up email draft |
| POST | `/agents/delay-alert` | body `{"delivery_id": "D000002"}`: at-dispatch draft warning with `predicted_delay_days`, `predicted_date`, `basis`, `subject`, `message` (a draft for Customer Success to approve) |
| POST | `/agents/ask` | body `{"question": "..."}`: answer from fixed analytics tools, with the numbers it used |
| GET | `/agents/runs?limit=50` | recent agent runs: agent, provider, model, latency, tokens, guardrail flags |
| GET | `/desk/inbox` | `{"messages": [{id, from_name, from_email, client_id, subject, received_at, scenario, expected_decision, what_it_demonstrates, has_attachment, status, decision}]}` |
| GET | `/desk/inbox/{id}` | the same fields plus `body` and `attachments` `[{filename, content_type, text}]` |
| POST | `/desk/process/{id}` | runs the 10-step pipeline on one email: `{message_id, decision, decision_reason, steps[], wms_order, client_email_draft, llm_provider, llm_model, expected_decision, matches_expected}` |
| POST | `/desk/process-all` | runs every `new` email: `{processed, matches_expected, counts{accepted,on_hold,needs_review,blocked}, results[{message_id, decision, expected_decision, matches_expected, decision_reason, wms_order_id}], llm_provider, llm_model}` |
| GET | `/desk/wms-orders` | `{"orders": [{wms_order_id, message_id, client_id, client_name, ship_to{}, lines[], commitment_type, requested_date, promised_date, destination_region, nearest_warehouse_id, fulfilment_warehouse_id, carrier_id, carrier_reason, status, pick_list_date, created_at}]}` |
| POST | `/desk/reset` | clears `wms_orders` and every email's decision (all back to `new`) |

Every error has the same shape: `{"error": {"code": "...", "message": "...", "details": ...}}`.
Codes: `unauthorized` 401, `not_found` 404, `validation_error` 422, `guardrail_blocked` 400, `not_delayed` 409,
`rate_limited` 429 (with `Retry-After`), `llm_error` 502, `data_not_loaded` 503.

All `/api/agents/*` routes are rate limited per client IP, and the POSTs need `X-Demo-Token` when `DEMO_TOKEN` is
set. The limiter is in memory: with several worker processes or instances the effective limit multiplies, so
put a shared limiter (proxy or Redis) in front beyond a single-instance demo.

Sample order emails for the order-intake agent are in `sample_emails/`. The Order desk inbox (12 client
emails in different layouts, one with a CSV purchase order) is in `../data/sample-inbox/`, described by its
`manifest.json`.

## The Order desk: the client's real intake process

Today staff read each email order (14 different client layouts) and type it into the warehouse system; a
carrier is picked from a rate card. The Order desk runs that process with agents and rules and shows each step.
`POST /api/desk/process/{id}` returns the trace; every step is
`{step, key, title, actor, agent_name, status: pass|warn|fail|skipped, summary, details, duration_ms}`.

| # | Step | Actor | What it does | Cause it targets |
|---|---|---|---|---|
| 1 | receive | Data lookup | Reads the email from the shared order inbox (sender, subject, received time, attachments) | |
| 2 | guardrail | Guardrail | Prompt-injection screen; a hit stops everything (decision `blocked`). Personal data is masked in logs | |
| 3 | extract | AI agent: Order Intake Agent | Reads client, lines (SKU, qty), ship-to, requested date, commitment, confidence; attachments included. No clear SKU/number or confidence below 0.6 gives `needs_review` | |
| 4 | identify_client | Data lookup | Sender domain (`client-055.example`) or client name to the clients table: tier, region, at-risk flag | |
| 5 | address_check | Rule | Street, city, state, postcode required (country defaults to US). Missing gives `on_hold` | 2 incomplete address |
| 6 | promise_check | Rule | 08:00 warehouse-local cutoff: before it, today's pick list, else tomorrow's. Same-day after the cutoff is re-promised as next-day. Promised date = received date + 1 (same-day), 2 (next-day) or 4 (standard) days, as in the dataset | 3 same-day after 08:00 |
| 7 | stock_check | Data lookup | Region from the ship-to state, nearest warehouse by distance; simulated stock (deterministic hash, about 12% out, HX-4410 never at W5). Ships from the next nearest warehouse with stock and warns | 4 stock not at nearest |
| 8 | carrier_choice | Rule | Old spreadsheet (cheapest rate, always Carrier F) against the advisor (best on-time to that region from the scorecard, never one of the 7 weak lanes) with the reason | 1 weak carrier lane |
| 9 | decision | Rule | `accepted` (WMS status `ready_for_pick_list`), `on_hold` (`on_hold_missing_address`), `needs_review`, or `blocked` (no WMS order) | |
| 10 | client_message | AI agent: Client Reply Agent | Drafts the confirmation (with the promised date) or the follow-up (asking for the missing fields). A draft only, for a person to approve | |

Under the mock provider all 12 sample emails reach their `expected_decision`
(`tests/test_order_desk.py`). With Gemini the reading step may differ; steps 4 to 9 are always the same
rules. The WMS order is written, and the email marked processed, in one transaction at the end, so a failed
model call (HTTP 502) leaves nothing half done. Reprocessing an email replaces its WMS order.

## How the agents work

- **Framework:** our own lightweight Python orchestration, not LangChain or another agent framework. There
  are two parts: one provider-agnostic LLM client (`app/agents/llm_client.py`: `mock`, `gemini` or `bedrock`,
  each call logged to `agent_runs` with redacted text, tokens and latency) and plain Python functions as the
  steps and tools. The Order desk is a fixed sequence of those functions (`app/desk/pipeline.py`); the Ask
  agent lets the model choose from a fixed list of analytics tools (`app/agents/ask.py`).
- **What is AI:** reading language and writing language. The Order Intake Agent turns a free-form email (any
  layout, attachments included) into fields; the Client Reply Agent, the Delay Alert agent and the Ask agent
  write plain-English text from facts they are given.
- **What is rules and data:** everything that decides an outcome or produces a number: the guardrail, client
  lookup, the address check, the 08:00 cutoff and promise dates, stock and warehouse choice, carrier choice,
  the decision, the delay prediction and every analytics figure.
- **Why:** numbers and rules must give the same answer every time and be easy to check against the data;
  a model is good at reading messy text and writing clear text, not at being the source of a number. So the
  model never sets a date, a carrier, a warehouse or a decision, and its output is checked: invalid JSON falls
  back to the parser or a template, and key facts (promised date, missing fields, quoted numbers) are added
  if the model leaves them out. Every client message is a draft for a person to approve.

## How the analytics work

- `app/analytics/causes.py` holds the cause rules, copied from the analysis script.
- `app/analytics/combos.py` holds the combo method. A delivery whose causes are fixed takes the observed
  on-time rate of deliveries with the remaining causes. Fair share is the Shapley value over the five causes.
  Bitmasks make it fast (all findings in about a second, against about 50 seconds for the original
  script), with the same results.
- `app/analytics/roi.py` holds the money side, the same maths as the script: savings per scenario (a late
  delivery in cause group k turns on time with probability (expected rate after the fix - today's rate) /
  (1 - today's rate)), the carrier-switch cost from the rate card (weak-lane shipments priced at the other
  carriers' average rate in that region, x2), and the effectiveness needed for the 94% benchmark (bisection,
  12 steps, rounded up to 2 decimals).
- `app/analytics/simulator.py` handles partial fixes. A cause with effectiveness `e` is removed from a share
  `e` of the deliveries. With one cause the result moves in a straight line between today and fully fixed.
  With several causes the combo method is averaged over every possible set of fixed causes. Points per cause
  are Shapley values of that. Money avoided is the penalty and redelivery cost of the late deliveries that
  become on time. The data covers six months, so it is multiplied by 2 for a year.
- Data is read once into pandas and cached in the process. Running the loader resets the cache.

## AI agents and guardrails

- `app/agents/llm_client.py` sends calls to `mock`, to Google Gemini (`google-genai`, JSON mode where the agent
  needs JSON) or to Bedrock (`bedrock-runtime` Converse API). It logs
  every call to `agent_runs` with redacted input and output, tokens, latency and flags.
- The mock provider gives realistic output. Order extraction is a regex parser, which is also used as a
  fallback when the model does not return valid JSON.
- `app/guardrails.py` redacts emails and phone numbers before logging and before archiving to S3. It screens for
  prompt injection after normalising case, whitespace and zero-width characters (ignore/disregard previous
  instructions, system prompt, "you are now", developer mode, reveal, role tags, long base64 blocks) and blocks
  inputs over 20,000 characters (HTTP 400, and the attempt is logged with status `blocked`). This is basic
  screening, not a security boundary; the outcomes that matter are fixed by rules.
- Order intake: country is optional (missing means `US`, listed in `checks.assumptions`). The 08:00 cutoff
  uses `received_at` from the request, else the email's Sent/Date header (read as warehouse-local time), else
  the current time in `WAREHOUSE_TZ`; `checks.cutoff` says which source and time zone were used. The mock
  parser also reads a free-text one-line address ("500 Main St, Dallas TX 75201").
- Delay Alert works as if it were dispatch time (`shipped_ts`): it predicts the delay as the median days late
  of other late deliveries with the same cause combination (fallback when fewer than 5: all late deliveries
  with any cause), rounded up, and gives `predicted_date` = promised date + that delay. It never uses the
  delivery's own outcome (returned separately as `actual_outcome` for checking). The message states the
  causes and the estimate, claims no actions (a model reply that does is replaced by the template), and ends
  with "DRAFT: for Customer Success to review and approve before sending." It refuses (409) only a delivery
  that was on time and had none of the five causes.
- Output checks: the order-intake checks are fixed rules, not AI. A delay alert must contain the promised
  and predicted dates, or they are added. An ask answer must quote at least one number from the tool results,
  or the numbers are appended.

## Docker

The build context is the repository root, so the image includes the dataset for the loader:

```bash
docker build -f backend/Dockerfile -t deliverylens-api .
docker run -p 8000:8000 deliverylens-api                        # SQLite inside the container
docker exec <container> python -m app.loader --if-empty
```

The container runs as a non-root user (uid 10001) and serves uvicorn on port 8000.
`backend/Dockerfile.dockerignore` limits the context to the files the image needs.
