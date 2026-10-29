# Bad inputs: what the app does with empty, malformed, oversized and large input

**Run on:** 2026-10-29, on commit `390ce98` plus the small validation change below. Mock AI, SQLite, the real
48,340 deliveries.
**How:** [`bad_inputs.py`](bad_inputs.py) sends 33 requests to the API in-process (FastAPI TestClient) and prints
what came back. The full, unedited output is in [`bad-inputs-output.txt`](bad-inputs-output.txt).
Anyone can repeat it:

```bash
backend/.venv/Scripts/python.exe evidence/bad_inputs.py     # Windows
backend/.venv/bin/python evidence/bad_inputs.py             # macOS / Linux
```

## Result in one line

**33 inputs, 0 server errors (no HTTP 5xx), no crash, no silent wrong result.** Every bad input gets a readable
message in the same shape: `{"error": {"code", "message", "details"}}`. The website shows that message on screen.

## What was sent, and what came back

| ID | Input | Answer | Why this is the right answer |
|---|---|---|---|
| B01 | Order desk "Type your own": empty email | 422 `validation_error`: "String should have at least 1 character" | Nothing to read |
| B02 | Own email: only spaces and line breaks | 422 `validation_error`: "must not be empty or only spaces" | **Fixed today.** Before, it ran the AI on nothing and returned "needs review" |
| B03 | Own email: `body` field missing | 422: "body.body: Field required" | Names the missing field |
| B04 | Own email: 8,001 characters | 422: "String should have at most 8000 characters" | Size limit; the form also stops typing at 8,000 |
| B05 | Own email: received time `25:99` | 422: names the HH:MM pattern | Malformed time |
| B06 | Not JSON at all | 422: "JSON decode error" | Malformed request |
| B07 | Own email: nonsense text, no order in it | 200, decision **needs_review**: "no clear SKU and quantity; confidence 0.20 below 0.6" | The agent does not guess; a person checks it |
| B08 | Own email from an unknown sender | 200, **needs_review** | Same: no guess |
| B09 | Own email with a prompt injection | 200, decision **blocked** by the guardrail | Stopped before the AI and before the WMS |
| B10 | Order intake: prompt injection | 400 `guardrail_blocked`, flag `prompt_injection` | Same guardrail on the direct agent route |
| B11 | Order intake: 50,001 characters | 422: at most 50,000 characters | Size limit |
| B12 | Ask: empty question | 422: at least 3 characters | The page also answers short questions with an example instead of calling the API |
| B13 | Ask: 2,001 characters | 422: at most 2,000 characters | Size limit |
| B14 | Ask: "What is our refund policy?" | 200: "The dataset holds no policy or resolution records ..." | Says what it does not know instead of inventing an answer |
| B15 | Simulator: unknown cause `bad_weather` | 422: lists the 5 valid causes | Readable and tells the fix |
| B16 | Simulator: effectiveness 2 | 422: "must be between 0 and 1" | Range check |
| B17 | Simulator: "lots" instead of a number | 422: "Input should be a valid number" | Type check |
| B18 | Simulator: empty body | 200: projected = today, 71% | Empty means "no fixes"; a sensible default |
| B19 | Late same-day replay: grace 07:00 | 422: "08:00 <= grace_until <= hard_stop <= 14:00" | Business rule check |
| B20 | Late same-day replay: "nine" | 422: "grace_until must be HH:MM" | Format check |
| B21 | Unknown delivery id | 404 "Delivery 'NOPE123' not found" | |
| B22 | Unknown cause in the URL | 404, lists the valid causes | |
| B23 | `limit=0` | 422 "greater than or equal to 1" | |
| B24 | Save plan for `client-190` | 422: pattern `C123` | |
| B25 | Risk board for "yesterday" | 422: pattern `YYYY-MM-DD` | |
| B26 | Carrier claim for carrier `DD` | 422: one capital letter | |
| B27 | Run an inbox email that does not exist | 404 "Message 'M99' not found" | |
| B28 | Empty client reply | 422 | |
| B29 | Address confirmation with a fake token | 404 "This confirmation link is not valid" | |
| L01 | **Large:** own email of 7,900 characters | 200, **accepted** in about 0.1 s | A long, real order still works |
| L02 | **Large:** order intake of 49,000 characters | 400 `guardrail_blocked`, flag `input_too_long` (limit 20,000) | Long input is refused before it reaches the AI (cost and injection risk) |
| L03 | **Large:** "Run all" 11 inbox emails in one call | 200, all 11 decisions as expected | |
| L04 | **Large:** 500 example deliveries (the maximum) | 200, 500 rows in under 0.1 s | |

## The change made today (smallest possible)

- `backend/app/api/schemas.py`: free-text fields (`email_text`, `question`, own-email `body`, client reply `text`)
  now refuse text that is only spaces, with the message "must not be empty or only spaces".
- New test: `test_blank_text_is_refused_with_a_readable_message` in `backend/tests/test_order_desk.py`
  (4 cases). The website already disabled the Run button for blank text, so only direct API calls are affected.

## Where these cases are also checked by automatic tests (run in CI on every push)

| Case | Test |
|---|---|
| Unknown cause, unknown delivery | `test_api.py::test_unknown_cause_is_404_with_error_shape`, `test_delivery_not_found` |
| Simulator bad input | `test_api.py::test_simulate_rejects_bad_input` |
| Prompt injection (16 variants) | `test_guardrails.py::test_blocks_injection_variants`, `test_order_desk.py::test_prompt_injection_is_blocked_before_the_model` |
| Bad times | `test_late_orders.py::test_bad_times_are_rejected`, `test_endpoint_rejects_bad_times`, `test_order_desk.py::test_own_email_rejects_a_bad_time` |
| Blank text | `test_order_desk.py::test_blank_text_is_refused_with_a_readable_message` |
| Vague quantity goes to a person | `test_order_desk.py::test_vague_quantity_needs_review` |
| AI returns broken JSON | `test_llm_client.py::test_order_intake_falls_back_to_parser_on_bad_llm_json` |
| Too many requests (429) | `test_security.py::test_agent_endpoints_return_429_with_error_shape` |
| API down: the website still works on sample data | e2e `offline.spec.ts` (screenshot `e2e-screenshots/10-api-down-sample-data.png`), frontend `approve.test.ts` |
| Ask: question too short | frontend `ask.test.tsx` |
