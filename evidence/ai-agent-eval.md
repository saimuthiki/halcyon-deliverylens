# AI agent evaluation: order intake agent

**Date:** 2026-10-23 11:52 UTC
**What was tested:** the Order Intake agent, through the running API (`POST /api/agents/order-intake`), with the
`mock` LLM provider (offline and repeatable; Bedrock is not connected yet).
**How:** each of the 5 sample emails in `backend/sample_emails/` was sent to the agent. Before running, we wrote down
what a person reading the email would expect (client, number of items, promise type, address complete or not,
missing fields, follow-up email needed, same-day cutoff warning). The script compares the agent's answer to that.
A sixth input, a prompt-injection email, checks that the guardrail blocks it.
**Script:** [`ai_eval.py`](ai_eval.py) (run against `http://localhost:8000`); rerun steps at the end.

## Result: 36 of 36 checks match (100%)

| Input | Checks expected to fire | Checks that fired | Fields matching | Result |
|---|---|---|---|---|
| `01_complete_next_day.txt` | none (ready for pick list) | none (ready for pick list) | 7/7 | PASS |
| `02_incomplete_address.txt` | address incomplete (street, postcode, country); follow-up drafted | address incomplete (country, postcode, street); follow-up drafted | 7/7 | PASS |
| `03_same_day_after_cutoff.txt` | same-day after 08:00 warning | same-day after 08:00 warning | 7/7 | PASS |
| `04_same_day_before_cutoff.txt` | none (ready for pick list) | none (ready for pick list) | 7/7 | PASS |
| `05_one_line_address.txt` | none (ready for pick list) | none (ready for pick list) | 7/7 | PASS |
| prompt-injection email (made up for this test) | blocked by guardrail (HTTP 400) | HTTP 400 `guardrail_blocked` | 1/1 | PASS |

## Per-email detail

### `01_complete_next_day.txt`

HTTP 200, 39 ms, provider `mock`, guardrail flags: redacted_email

| Field | Expected | Got | Match |
|---|---|---|---|
| client | Client 042 | Client 042 | yes |
| items | 2 | 2 | yes |
| commitment | next_day | next_day | yes |
| address | complete | complete | yes |
| missing | [] | [] | yes |
| follow_up | False | False | yes |
| after_cutoff | False | False | yes |

### `02_incomplete_address.txt`

HTTP 200, 10 ms, provider `mock`, guardrail flags: redacted_email

| Field | Expected | Got | Match |
|---|---|---|---|
| client | Client 117 | Client 117 | yes |
| items | 2 | 2 | yes |
| commitment | standard | standard | yes |
| address | incomplete | incomplete | yes |
| missing | ['street', 'postcode', 'country'] | ['country', 'postcode', 'street'] | yes |
| follow_up | True | True | yes |
| after_cutoff | False | False | yes |

Warnings returned: Address incomplete: missing street, postcode, country. Hold the order and send the follow-up.

### `03_same_day_after_cutoff.txt`

HTTP 200, 9 ms, provider `mock`, guardrail flags: redacted_email

| Field | Expected | Got | Match |
|---|---|---|---|
| client | Client 205 | Client 205 | yes |
| items | 1 | 1 | yes |
| commitment | same_day | same_day | yes |
| address | complete | complete | yes |
| missing | [] | [] | yes |
| follow_up | False | False | yes |
| after_cutoff | True | True | yes |

Warnings returned: Same-day order received at 09:40, after the 08:00 pick-list cutoff. Same-day orders received after the cutoff are on time only 39% of the time; offer next_day instead.

### `04_same_day_before_cutoff.txt`

HTTP 200, 6 ms, provider `mock`, guardrail flags: redacted_email

| Field | Expected | Got | Match |
|---|---|---|---|
| client | Client 066 | Client 066 | yes |
| items | 1 | 1 | yes |
| commitment | same_day | same_day | yes |
| address | complete | complete | yes |
| missing | [] | [] | yes |
| follow_up | False | False | yes |
| after_cutoff | False | False | yes |

### `05_one_line_address.txt`

HTTP 200, 7 ms, provider `mock`, guardrail flags: redacted_email, redacted_phone

| Field | Expected | Got | Match |
|---|---|---|---|
| client | Client 150 | Client 150 | yes |
| items | 2 | 2 | yes |
| commitment | standard | standard | yes |
| address | complete | complete | yes |
| missing | [] | [] | yes |
| follow_up | False | False | yes |
| after_cutoff | False | False | yes |


## Limits of this evaluation

- The mock provider uses a regex parser, so this proves the rules (address check, cutoff check, follow-up draft,
  guardrail) and the parsing of these email formats. It does not measure Claude on Bedrock. When Bedrock is
  connected, rerun the same script with `LLM_PROVIDER=bedrock` to compare.
- Five emails is a small sample. They cover the main paths: complete, incomplete, same-day after and before
  cutoff, and an address written on one line.

## How to rerun

```bash
cd backend && .venv/bin/python -m app.loader && LLM_PROVIDER=mock .venv/bin/uvicorn app.main:app --port 8000 &
python3 evidence/ai_eval.py http://localhost:8000 backend/sample_emails evidence/ai-agent-eval.md
```
