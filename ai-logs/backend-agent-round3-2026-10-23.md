# Backend agent log, round 3, 2026-10-23

**Role:** Backend developer (Backend Architect agent, Claude Code)
**Task:** The team lead found the app too abstract. Make the client's real email order process visible end to end
(the "Order desk"), and let the AI give real, dynamic answers through Google Gemini, while staying local-only
(SQLite, no AWS).
**Skills used:** `test-driven-development` (every feature started from a failing test), `find-docs` (Context7 quota
was exhausted, so the `google-genai` API was checked against the installed SDK source instead),
`agent-workflow-designer` (pattern choice: a sequential pipeline with an early stop, AI only where language is read
or written).
**Human reviewer:** Sai M. The lead commits. The agent ran no git commands and did not edit `frontend/`
(a frontend agent works in parallel against the API contract below).

## What changed

- **Gemini provider (Part A).**
  - `LLM_PROVIDER=gemini` next to `mock` and `bedrock` in `app/agents/llm_client.py`, with the official
    `google-genai` SDK (pinned `google-genai==2.33.0`). `GEMINI_API_KEY`, `GEMINI_MODEL` (default
    `gemini-2.5-flash`), timeout from `LLM_TIMEOUT_SECONDS`.
  - `generate(..., json_output=True)` turns on Gemini's JSON mode (`response_mime_type=application/json`); the
    order intake, delay alert, ask-router and both Order desk agents use it.
  - Errors become the existing HTTP 502 `llm_error`. The key is kept out of the settings' printed form and
    removed from any error text; a missing key fails with a clear "Set GEMINI_API_KEY" message.
  - `/api/health` now returns `llm_provider`, `llm_model` and `llm_ready`.
- **Order desk (Part B).**
  - `data/sample-inbox/`: 12 synthetic client emails (`.eml`, varied layouts: labelled, free text, one-line
    address, text table, reply thread, CSV purchase order attachment, a prompt-injection attempt, a vague order),
    from real Email-channel client ids (C055, C190 and C263 are at-risk clients), plus `manifest.json`.
  - Tables `inbox_messages` and `wms_orders`; `python -m app.loader` also loads the inbox (idempotent).
  - `app/desk/pipeline.py`: 10 steps (receive, guardrail, extract, identify_client, address_check, promise_check,
    stock_check, carrier_choice, decision, client_message), each returned in the trace with actor, status, a
    plain-English summary, details and duration. AI only at steps 3 and 10.
  - `app/desk/rules.py`: state to region map, warehouses by distance, deterministic simulated stock (12% out,
    HX-4410 never at W5), promise dates with the same offsets as the dataset (same-day +1, next-day +2, standard
    +4 days from the received date) and the 08:00 cutoff, carrier choice (cheapest vs best on-time, never a weak
    lane).
  - Endpoints: `GET /api/desk/inbox`, `GET /api/desk/inbox/{id}`, `POST /api/desk/process/{id}`,
    `POST /api/desk/process-all`, `GET /api/desk/wms-orders`, `POST /api/desk/reset`. The POSTs get the same rate
    limit and demo-token check as `/api/agents/*`.
  - The WMS order and the message status are written in one transaction at the end, so a failed model call leaves
    nothing half done.
- **Docs (Part C).** `backend/README.md`: how to switch to Gemini, the Order desk table, and "How the agents
  work". `.env.example` has the Gemini block. Dockerfile and its dockerignore include the sample inbox.

## Decisions and why

- Promise dates follow the dataset (every row: same-day promised for the day after receipt, next-day two days,
  standard four). The desk's dates then match the 48,340 deliveries the analysis is based on.
- The stock hash uses a fixed salt chosen so the other sample orders are in stock at their nearest warehouse; only
  case 08 shows cause 4. Across all SKUs about 12.7% of SKU-warehouse pairs are out, close to the 12% in the data.
- The carrier step warns whenever the spreadsheet's pick (always Carrier F, cheapest) is a weak lane, which is
  true for the Northeast and Southeast; the decision stays `accepted` because the advisor's pick replaces it.
- After `on_hold` or `needs_review`, steps 6 to 8 are shown as `skipped` with the reason, and a blocked email
  skips everything after the guardrail, so the trace always has 10 steps for the UI.

## Evidence

- Tests: 148 passed (`.venv/bin/python -m pytest`): 106 before this round, plus 10 in `tests/test_gemini.py`
  (fake Gemini client, no network) and 32 in `tests/test_order_desk.py` (including a test that all 12 emails meet
  their expected decision under mock).
- Live run: uvicorn on SQLite, `POST /api/desk/process-all` returned `processed 12, matches_expected 12`,
  counts accepted 8, on_hold 2, needs_review 1, blocked 1; 11 WMS orders; `/api/health` showed
  `llm_provider mock, llm_model mock-fast, llm_ready true`.
- Not verified: a real Gemini call (no key in this environment). The fake client follows the SDK's
  `models.generate_content(model, contents, config)` signature, checked against the installed package.
