# Backend agent log, 2026-10-23

**Role:** Backend developer (Backend Architect agent, Claude Code)
**Task:** Build the DeliveryLens API in `backend/`, using the same logic as `analysis/root_cause_analysis.py`.
**Human reviewer:** Sai M. The lead commits; the agent ran no git commands.

## What was built

- **Data layer:** SQLAlchemy 2 models for the 8 CSVs plus `agent_runs`. `python -m app.loader` loads all
  rows in about 3 seconds. Each run replaces the data in one transaction, so it can be run again safely.
  `--if-empty` (used by `infra/scripts/07-deploy.sh`) skips the load when data is already there. The SQL
  is portable: it uses the SQLAlchemy Core `select`/`insert`/`delete`, with no raw SQL strings. It runs on
  SQLite locally and on PostgreSQL in production with psycopg 3, which matches the `postgresql+psycopg://`
  URL that infra writes.
- **Analytics (`app/analytics/`):**
  - Cause tagging is copied from the analysis script.
  - The combo method uses bitmasks. Shapley fair share is computed on top of it.
  - Findings are rebuilt from the database and match `findings.json` exactly.
  - The simulator handles partial effectiveness with a multilinear blend: a straight line for one cause,
    and the same combo method averaged over every set of fixed causes for several. It reports points per
    cause (Shapley), the projection for at-risk clients, and penalties and redelivery cost avoided (x2 for
    a year).
  - Also: vendor assessment, carrier scorecard with a best carrier per region (tie goes to the cheaper
    one), at-risk clients, and a delivery timeline with a fixed-template explanation.
- **Agents (`app/agents/`):**
  - `llm_client.py` supports mock and Bedrock (Converse API, with retries and a timeout) and logs every
    call to `agent_runs`.
  - Order intake: AI extraction, then fixed-rule checks. A missing address field produces a follow-up
    email; a same-day order received after 08:00 gets a warning and a next_day suggestion.
  - Delay alert: the facts come from the data and the AI only writes the wording.
  - Ask: the agent picks from six fixed tools (no free SQL), and the answer must cite their numbers.
- **Guardrails:** email and phone numbers are redacted in logs. Prompt-injection phrases and oversized input
  are blocked (HTTP 400, logged as `blocked`). Output checks re-add missing facts and numbers. Invalid LLM
  JSON falls back to the regex parser.
- **API:** 14 endpoints under `/api` with one error shape (`{"error":{code,message,details}}`). CORS
  origins come from `CORS_ORIGINS`. Optional JSON logs via `LOG_JSON`, which infra sets.
- **Packaging:** Dockerfile (python:3.11-slim, non-root uid 10001, uvicorn, HEALTHCHECK). It is built from
  the repository root, as CI and infra do, and includes the dataset. Also `.env.example`, `README.md`, and
  5 sample emails.

## Skills used

- **test-driven-development:** the tests were written first: analytics parity, API happy paths, order
  intake on sample emails, guardrails. The suite failed at collection (`ModuleNotFoundError`) before any
  code existed, then each module was built until its tests passed. Bedrock-path tests and infra-contract
  tests were added the same way.
- **api-and-interface-design:** one error format across all endpoints, validation only at the boundary
  (pydantic request models; unknown causes and effectiveness outside 0..1 return 422), a capped `limit` on
  list endpoints, and additive response shapes. Fields are snake_case to match `findings.json` and the
  brief.
- **find-docs:** tried Context7 for the Bedrock Converse API, but the monthly quota was exhausted. The
  request and response shape (`modelId`, `system`, `messages`, `inferenceConfig`;
  `output.message.content`, `usage.inputTokens/outputTokens`) was checked against the installed botocore
  service model instead (`operation_model('Converse')`).

## Test results

```
$ .venv/bin/python -m pytest -rA
  PASSED tests/test_analytics.py::test_loader_loads_every_csv
  PASSED tests/test_analytics.py::test_loader_is_idempotent
  PASSED tests/test_analytics.py::test_findings_match_analysis_output_exactly
  PASSED tests/test_analytics.py::test_headline_scenarios
  PASSED tests/test_analytics.py::test_fair_shares_add_up_to_total_gain
  PASSED tests/test_analytics.py::test_simulator_full_fix_equals_all_fixed
  PASSED tests/test_analytics.py::test_simulator_routing_only
  PASSED tests/test_analytics.py::test_simulator_half_effectiveness_is_linear_blend
  PASSED tests/test_analytics.py::test_simulator_no_fix_changes_nothing
  PASSED tests/test_analytics.py::test_simulator_cost_avoided_full_fix_is_bounded
  PASSED tests/test_analytics.py::test_vendor_assessment_recommends_reshape
  PASSED tests/test_api.py::test_health
  PASSED tests/test_api.py::test_cors_header
  PASSED tests/test_api.py::test_kpis
  PASSED tests/test_api.py::test_causes
  PASSED tests/test_api.py::test_cause_deliveries
  PASSED tests/test_api.py::test_unknown_cause_is_404_with_error_shape
  PASSED tests/test_api.py::test_delivery_detail
  PASSED tests/test_api.py::test_delivery_not_found
  PASSED tests/test_api.py::test_carrier_scorecard
  PASSED tests/test_api.py::test_at_risk_clients
  PASSED tests/test_api.py::test_simulate
  PASSED tests/test_api.py::test_simulate_rejects_bad_input
  PASSED tests/test_api.py::test_vendor_assessment
  PASSED tests/test_api.py::test_order_intake_agent
  PASSED tests/test_api.py::test_order_intake_blocks_injection
  PASSED tests/test_api.py::test_delay_alert_agent
  PASSED tests/test_api.py::test_ask_agent_includes_numbers
  PASSED tests/test_api.py::test_agent_runs_logged_and_redacted
  PASSED tests/test_guardrails.py::test_redacts_email_and_phone
  PASSED tests/test_guardrails.py::test_redaction_leaves_postcodes_and_dates_alone
  PASSED tests/test_guardrails.py::test_blocks_prompt_injection
  PASSED tests/test_guardrails.py::test_allows_normal_order_email
  PASSED tests/test_guardrails.py::test_blocks_oversized_input
  PASSED tests/test_infra_contract.py::test_postgres_urls_use_psycopg3
  PASSED tests/test_infra_contract.py::test_loader_if_empty_skips_when_loaded
  PASSED tests/test_llm_client.py::test_bedrock_converse_request_and_usage
  PASSED tests/test_llm_client.py::test_order_intake_falls_back_to_parser_on_bad_llm_json
  PASSED tests/test_llm_client.py::test_order_intake_uses_llm_json
  PASSED tests/test_llm_client.py::test_ask_appends_numbers_when_model_omits_them
  PASSED tests/test_llm_client.py::test_placeholder_model_id_is_refused
  PASSED tests/test_order_intake.py::test_complete_address_email_extracts_everything
  PASSED tests/test_order_intake.py::test_incomplete_address_email_gets_follow_up
  PASSED tests/test_order_intake.py::test_same_day_after_cutoff_warns_and_suggests_next_day
  PASSED tests/test_order_intake.py::test_same_day_before_cutoff_is_fine
45 passed in 8.10s
```

`bandit -q -r app -ll` (the CI security gate) finds nothing. A live server answered `/api/health`
(`{"status":"ok","db_ok":true,"deliveries_loaded":48340,"llm_provider":"mock"}`) and `/api/causes` (same
numbers as findings.json), and the other endpoints were smoke-tested with curl.

## Decisions

1. **Parity first.** The cause logic is copied, not rewritten. The faster combo code is exact: it gives the
   same rounded numbers, and the whole `findings.json` is checked for equality, not just the headlines.
   The original script was also re-run under pandas 3.1 and gives byte-identical output.
2. **In-process cache.** 48k rows fit easily in memory. Each analytics request is a dictionary lookup
   (under 10 ms). The loader clears the cache.
3. **Partial fixes = probability a cause is removed.** This gives exactly the requested straight line for
   one cause, stays consistent with the combo method for several causes, and reaches the all-fixed figure
   (96.63%) when every cause is set to 1.
4. **Money avoided:** each late combination's penalty and redelivery cost, multiplied by the share of its
   late deliveries that become on time.
5. **Rules where the outcome matters.** Address completeness, the cutoff warning and the follow-up email
   are fixed rules, not model output, so the demo cannot drift into wrong behaviour. The model only extracts
   and writes wording.
6. **psycopg 3 instead of psycopg2,** because `infra/scripts/05-secrets-rds.sh` writes
   `postgresql+psycopg://` URLs.
7. **httpx2 instead of httpx** for TestClient, because the installed starlette marks httpx as deprecated.
   This keeps the test output free of warnings.

## Not done / open

- No Docker daemon in the sandbox, so `docker build` was not run (the Dockerfile has not been built).
- `DEMO_PASSWORD` and `S3_BUCKET` are in the infra secret but were not in the backend brief. There is no
  auth or S3 use yet.
- Bedrock has only been tested with a stub client. Real model IDs must be set in
  `BEDROCK_MODEL_FAST/SMART`.
- The delay-alert wording treats the delivered date as the "expected" date, because the dataset is
  historical.
