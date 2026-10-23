# DeliveryLens backend

FastAPI service behind the DeliveryLens dashboard. It loads the Halcyon dataset into a database, tags every
delivery with the five causes from `analysis/root_cause_analysis.py`, and serves the analytics, the what-if
simulator, the vendor assessment and three AI agents (order intake, delay alert, ask).

The numbers match `analysis/output/findings.json` exactly. A test checks this
(`tests/test_analytics.py::test_findings_match_analysis_output_exactly`).

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

The loader is idempotent: each run replaces the data tables in one transaction. `--if-empty` skips the
load when data is already there (the deploy script uses it). `--data-dir PATH` points at another CSV folder.

## Test

```bash
.venv/bin/python -m pytest
```

Tests use a throwaway SQLite file and `LLM_PROVIDER=mock`, so they need no network and no AWS.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./deliverylens.db` | SQLAlchemy URL. For RDS use `postgresql+psycopg://user:pass@host:5432/deliverylens` (`postgres://` and `postgresql://` are converted to psycopg 3) |
| `DATA_DIR` | `../data/halcyon-dataset` | Folder with the CSVs |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Comma-separated allowed origins |
| `LLM_PROVIDER` | `mock` | `mock` (offline and deterministic) or `bedrock` |
| `AWS_REGION` | `us-east-1` | Bedrock region |
| `BEDROCK_MODEL_FAST` | placeholder | Model or inference-profile ID for extraction, routing and delay alerts |
| `BEDROCK_MODEL_SMART` | placeholder | Model or inference-profile ID for `/agents/ask` answers |
| `LLM_TIMEOUT_SECONDS` | `30` | Bedrock read timeout (3 retries, standard mode) |
| `LOG_JSON` | unset | `true` logs one JSON line per log record (CloudWatch) |

The Bedrock model IDs default to the placeholder `SET-ME-bedrock-model-id`. A call that uses the placeholder
fails with a clear error and returns HTTP 502.

## Endpoints (all under `/api`)

| Method | Path | What it returns |
|---|---|---|
| GET | `/health` | status, `db_ok`, deliveries loaded, LLM provider |
| GET | `/kpis` | deliveries, on-time rate, late, by month, SLA penalties, redelivery cost, at-risk clients and revenue, complaints by category, customer success hours |
| GET | `/causes` | one row per cause (deliveries, on-time rate, share of late, points if fixed alone, fair-share points, SLA penalties) and the scenarios |
| GET | `/causes/{cause}/deliveries?limit=50` | sample late deliveries with that cause |
| GET | `/deliveries/{delivery_id}` | full row, timeline, causes, plain-English explanation |
| GET | `/carriers/scorecard` | per carrier: rate, on-time, redelivery rate, API, preferred; carrier x region matrix; best carrier per region (tie goes to the cheaper one) |
| GET | `/clients/at-risk` | the 9 clients threatening to leave: revenue, tier, channel, on-time, cause rates, complaints |
| POST | `/simulate` | body `{"fixes": {"incomplete_address": 1.0, "weak_carrier_lane": 0.5}}`: projected on-time, points per cause, at-risk projection, yearly penalties and redelivery cost avoided |
| GET | `/vendor-assessment` | routing-only ceiling vs process vs all fixed, $680K budget, $14.2M at risk, recommendation |
| POST | `/agents/order-intake` | body `{"email_text": "...", "received_at": "YYYY-MM-DD HH:MM"?}`: extraction, address and cutoff checks, follow-up email draft |
| POST | `/agents/delay-alert` | body `{"delivery_id": "D000002"}`: proactive client message built on facts from the data |
| POST | `/agents/ask` | body `{"question": "..."}`: answer from fixed analytics tools, with the numbers it used |
| GET | `/agents/runs?limit=50` | recent agent runs: agent, provider, model, latency, tokens, guardrail flags |

Every error has the same shape: `{"error": {"code": "...", "message": "...", "details": ...}}`.
Codes: `not_found` 404, `validation_error` 422, `guardrail_blocked` 400, `not_delayed` 409,
`llm_error` 502, `data_not_loaded` 503.

Sample order emails for the demo are in `sample_emails/`.

## How the analytics work

- `app/analytics/causes.py` holds the cause rules, copied from the analysis script.
- `app/analytics/combos.py` holds the combo method. A delivery whose causes are fixed takes the observed
  on-time rate of deliveries with the remaining causes. Fair share is the Shapley value over the five causes.
  Bitmasks make it fast (all findings in about a second, against about 50 seconds for the original
  script), with the same results.
- `app/analytics/simulator.py` handles partial fixes. A cause with effectiveness `e` is removed from a share
  `e` of the deliveries. With one cause the result moves in a straight line between today and fully fixed.
  With several causes the combo method is averaged over every possible set of fixed causes. Points per cause
  are Shapley values of that. Money avoided is the penalty and redelivery cost of the late deliveries that
  become on time. The data covers six months, so it is multiplied by 2 for a year.
- Data is read once into pandas and cached in the process. Running the loader resets the cache.

## AI agents and guardrails

- `app/agents/llm_client.py` sends calls to `mock` or to Bedrock (`bedrock-runtime` Converse API). It logs
  every call to `agent_runs` with redacted input and output, tokens, latency and flags.
- The mock provider gives realistic output. Order extraction is a regex parser, which is also used as a
  fallback when the model does not return valid JSON.
- `app/guardrails.py` redacts emails and phone numbers before logging. It blocks prompt-injection phrases and
  inputs over 20,000 characters (HTTP 400, and the attempt is logged with status `blocked`).
- Output checks: the order-intake checks are fixed rules, not AI. A delay alert must contain the promised
  and expected dates, or they are added. An ask answer must quote at least one number from the tool results,
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
