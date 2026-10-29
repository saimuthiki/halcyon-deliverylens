# 10. Discovery and requirements

One place for the problem, the users, the requirements and the scope, with a link from every requirement to the
feature that meets it and the test that proves it. Longer stories are in [02 The problem](02-the-problem.md) and
[03 What the data says](03-what-the-data-says.md). Every number below comes from `analysis/output/findings.json`
(made by `analysis/root_cause_analysis.py`) or from the backend tests, unless it says otherwise.

## 1. Problem statement (one page)

**Client:** Halcyon Logistics: 280 business clients, 5 warehouses, 6 carriers.

**Problem:** only **71.0%** of deliveries arrive on time (benchmark **94%**). Leadership thinks routing is the cause and
is about to sign a **$680K** routing software contract within two weeks.

**Baseline today (1 Apr to 25 Sep 2026, 48,340 deliveries):**

| Baseline measure | Today | Source |
|---|---|---|
| On-time delivery | 71.0% | `findings.json` `on_time_rate_today` |
| Late deliveries in 6 months | 14,019 | `findings.json` `data_quality.late_deliveries` |
| SLA penalties paid | $872,460 in 6 months (about $1.74M a year) | [03](03-what-the-data-says.md#money-and-people) |
| Redelivery cost | $476,646 in 6 months (about $0.95M a year, to confirm) | [03](03-what-the-data-says.md#money-and-people) |
| Customer success time on complaints | 460.8 of 720 team hours a week (64%) | `findings.json` `customer_success_week` |
| Staff time typing email orders | 44.4 hours a week | `findings.json` `customer_success_week` |
| Email orders with an incomplete address | 28% (EDI/API: 5%) | [03](03-what-the-data-says.md#the-five-causes) |
| Formal complaints | 34 in 90 days, 24 from the 9 at-risk clients, 12 say "nobody told us" | `findings.json` `complaints` |
| Revenue at risk | 9 clients, $14.2M a year, threatening to leave | [02](02-the-problem.md) |

**Business reason:** the wrong $680K purchase, about $1.74M a year in penalties, and $14.2M of revenue at risk.

**Target users and their pain:**

| User | Pain today | What they need |
|---|---|---|
| COO and CFO | Must decide on the $680K tool without proof of the cause | Why deliveries are late, what each option buys, in money |
| Customer success team | 64% of the week on complaints; types email orders by hand; clients not told about delays | Orders read for them, missing details caught early, delay messages drafted |
| Warehouse and carrier managers | 08:00 pick list misses late same-day orders; carrier chosen by price from a spreadsheet | Clear cutoff rules, the right carrier per lane, the risky shipments each morning |
| Account owners of the 9 at-risk clients | No plan to keep them | A save plan per client, from that client's own data |

**Sponsor and user input (discovery):**
- **Swarna (stakeholder briefing):** do not assume routing is the problem; expect several causes, each with its own
  fix; prove it with before and after numbers ([02](02-the-problem.md#what-the-stakeholder-told-us-swarna-briefing-call)).
- **Business owner's answer to our question 3:** the pick procedure must not change and the 08:00 pick list stays.
  This killed our "second pick wave" idea and led to the grace period and urgent window instead
  ([02](02-the-problem.md#our-questions-for-the-client-discovery), [03](03-what-the-data-says.md#the-same-day-cutoff)).
- **Discovery round 2:** 12 data-driven questions sent in the organisers' log format:
  [`working/discovery-question-log-round2-InfinityStacks.xlsx`](working/discovery-question-log-round2-InfinityStacks.xlsx).
  Where no answer came back, the assumption is written down (section 4).

## 2. Functional requirements

| ID | Requirement | Feature (page / API) | Proof (tests, `backend/tests/` unless noted) |
|---|---|---|---|
| FR-01 | Show the on-time rate today vs the 94% benchmark and the money at risk | Overview; `GET /api/kpis` | `test_api.py::test_kpis`; e2e `decision.spec.ts` overview |
| FR-02 | Find the causes of lateness and how many points each costs, with no double counting | Why late; `GET /api/causes` | `test_analytics.py::test_findings_match_analysis_output_exactly`, `test_fair_shares_add_up_to_total_gain` |
| FR-03 | Drill from a cause to example deliveries and one delivery's timeline | Why late drawer; `GET /api/causes/{c}/deliveries`, `GET /api/deliveries/{id}` | `test_api.py::test_cause_deliveries`, `test_delivery_detail` |
| FR-04 | Say what the $680K routing tool can and cannot fix, with a business case | Vendor decision; `GET /api/vendor-assessment`, `GET /api/roi` | `test_analytics.py::test_vendor_assessment_recommends_reshape`, `test_api.py::test_roi` |
| FR-05 | What-if: set how well each fix works and see the new on-time rate | What-if simulator; `POST /api/simulate` | `test_analytics.py::test_simulator_*` (5 tests), `test_api.py::test_simulate_realistic_preset_equals_on_time_realistic` |
| FR-06 | Late same-day orders: keep the 08:00 list; grace until 09:00; urgent only until 10:00; then next day | Late same-day orders; Order desk step 6; `POST /api/simulate/late-orders` | `test_late_orders.py` (all), `test_order_desk.py::test_valid_reason_in_the_urgent_window_is_added_to_today` |
| FR-07 | Read an order email, extract client, lines, address, date; catch missing address parts | Order desk; `POST /api/desk/process/{id}`, `POST /api/desk/own-email` | `test_order_desk.py::test_every_sample_email_meets_its_expected_decision_under_mock`, `test_order_intake.py` |
| FR-08 | Let a user paste their own order email and run the same steps | Order desk "Type your own" | `test_order_desk.py::test_own_email_runs_the_same_steps_and_replaces_the_previous_one` |
| FR-09 | Fill a missing address from the client's delivery history, and ask the client to confirm | Order desk + client page `/c/confirm-address/{token}` | `test_new_agents.py::test_missing_postcode_is_found_in_history_and_held_for_confirmation`, `test_one_click_confirmation_releases_the_order` |
| FR-10 | Pick a reliable carrier per lane instead of the cheapest | Order desk step 8; Carriers page | `test_order_desk.py::test_advisor_never_picks_a_weak_lane`, `test_southeast_order_avoids_the_spreadsheet_weak_lane` |
| FR-11 | Ship from the nearest warehouse with stock | Order desk step 7; Stock & routes | `test_order_desk.py::test_west_order_ships_from_further_warehouse_when_nearest_has_no_stock`, `test_api.py::test_stock_placement` |
| FR-12 | A person approves every accepted order before it enters the WMS | Order desk "Approve into WMS" | `test_order_desk.py::test_approve_moves_an_accepted_order_to_the_pick_list`, `test_on_hold_order_cannot_be_approved` |
| FR-13 | Draft a delay message to the client before they chase, plus an internal recovery plan | Why late drawer; `POST /api/agents/delay-alert` | `test_delay_alert.py` (13 tests) |
| FR-14 | Answer leaders' questions in plain English from the data and the complaints | Ask; `POST /api/agents/ask` | `test_api.py::test_ask_agent_includes_numbers`, `test_ask_answers_payback_from_roi_tool` |
| FR-15 | Save plan for each of the 9 at-risk clients | At-risk clients "Save plan"; `POST /api/agents/account-plan` | `test_new_agents.py::test_every_at_risk_client_gets_a_plan_that_passes_its_guardrails` |
| FR-16 | Recover SLA penalties where the carrier alone was at fault | Carriers "Recover penalties"; `GET /api/carriers/claims` | `test_new_agents.py::test_claims_only_where_the_carrier_alone_was_at_fault` ($261,900) |
| FR-17 | Each morning, rank the shipments most likely to be late, with fixes still possible | Morning risk board; `GET /api/risk-board` | `test_new_agents.py::test_board_uses_only_what_was_known_that_morning`, `test_backtest_beats_the_average` |
| FR-18 | One-page weekly brief for the COO and CFO, sent every Monday | Weekly brief; `POST /api/agents/weekly-brief` | `test_new_agents.py::test_brief_numbers_match_the_week`, `test_email_smtp.py::test_send_endpoint_blocks_duplicates_and_guards_resend` |
| FR-19 | Log every AI call (model, time, tokens, guardrail flags) | Agent activity; `GET /api/agents/runs` | `test_api.py::test_agent_runs_logged_and_redacted`, `test_order_desk.py::test_ai_steps_are_logged_to_agent_runs` |
| FR-20 | Explain every page to a new user | How it works; "What am I looking at?" panel on every page | frontend `howitworks.test.tsx`, `desk.test.tsx` "has content for every page in the navigation" |

## 3. Non-functional requirements

| ID | Requirement | How it is met | Proof |
|---|---|---|---|
| NFR-01 | **Correct, repeatable numbers.** The AI never computes a KPI | All maths in plain Python; the API's numbers must equal the analysis script's | `test_analytics.py::test_findings_match_analysis_output_exactly`; CI job `analysis` re-runs the script and checks 71.0 / 90.24 / 99.0 |
| NFR-02 | **AI cannot invent numbers or actions** | Number guardrail (`app/guardrails.py: unverified_numbers`), quote check, action-claim replacement | `test_new_agents.py::test_invented_number_sends_the_plan_back_to_the_template`, `test_order_desk.py::test_unverified_urgency_quote_is_dropped` |
| NFR-03 | **Safe against prompt injection** | `check_input` before any AI call | `test_guardrails.py::test_blocks_injection_variants` (16 variants) |
| NFR-04 | **Readable errors, never a crash** on bad input | Validated request schemas, one error shape | [evidence/bad-inputs.md](../evidence/bad-inputs.md): 33 inputs, 0 server errors |
| NFR-05 | **Fast enough to demo live** | In-memory analytics | [evidence/scalability.md](../evidence/scalability.md): every analytics call under 0.1 s on 48,340 rows |
| NFR-06 | **Works without AWS or an AI key** | `LLM_PROVIDER=mock`; website falls back to sample data if the API is down | [evidence/clean-machine-setup.md](../evidence/clean-machine-setup.md); e2e `offline.spec.ts` |
| NFR-07 | **Secure by default** | HTTPS only, private encrypted RDS, least-privilege IAM, no stored keys (OIDC), rate limit on AI routes | [13 Environments and security](13-environments-and-security.md), [evidence/security-scan.txt](../evidence/security-scan.txt) |
| NFR-08 | **Low cost** | Small instances, on-demand Bedrock | Expected about $37 a month, budget alert at $100 ([PROJECT-PROGRESS.md](../PROJECT-PROGRESS.md#4-aws-setup-account-infinity-stacks-781547812451-region-us-east-1)) |
| NFR-09 | **Observable** | Every AI call logged; CloudWatch logs, dashboard and 3 alarms | `infra/scripts/08-cloudwatch.sh`, `infra/cloudwatch-dashboard.json` |
| NFR-10 | **Accessible, plain language** | DESIGN.md rules; reduced-motion respected | [DESIGN.md](../DESIGN.md); e2e found and fixed a screen-reader header bug ([evidence/README.md](../evidence/README.md)) |

## 4. Assumptions

| # | Assumption | Why | If wrong |
|---|---|---|---|
| A1 | "On time" = delivered on or before `promised_date` | That is how the data is coded | Every rate changes; one setting in the analysis |
| A2 | Fix effectiveness in the realistic case: address 80%, same-day 70%, stock 50%, carrier 90%, route 50% | Our estimate; stated in [03](03-what-the-data-says.md#the-business-case-what-each-option-buys-per-year) | Change `REALISTIC_EFFECTIVENESS`; the simulator shows any value live |
| A3 | Yearly cost of the fixes ($359K for all five) | Estimates; carrier cost from the rate card | Change `FIX_COST_USD_PER_YEAR` |
| A4 | The $34 redelivery cost per late delivery may be a recording rule | Every late delivery has exactly $34 | We also show "penalties only" figures |
| A5 | Carrier contracts allow passing on penalties | Needed for penalty recovery | Recovery becomes a negotiation tool only |
| A6 | Priority client = Tier 1 (at least $1M a year) or at risk | Our definition for the urgent window | One rule in `late_orders.py` |
| A7 | All data is synthetic; no real personal data | Hackathon rule | n/a |

## 5. Constraints

- The 08:00 pick list and the pick procedure must not change (business owner).
- Only the 9 AWS services the team requested: Bedrock, IAM, S3, ECR, Secrets Manager, RDS, CloudWatch, Amplify, EC2.
- Deadline 29 Oct; small budget ($100 a month alert).
- Data: one 6-month export (CSV), no live WMS or carrier feed.
- evoketechnologies.com has DMARC `p=reject`, so the weekly brief goes by Amazon SNS, not SES.

## 6. Out of scope (explicit)

- **No live WMS, TMS or carrier integration.** The app writes to its own sample WMS table; a person approves.
- **No real email inbox.** The Order desk reads a sample inbox (11 emails) and a pasted email.
- **No route optimisation engine.** We show where routes deviate; the fix is a small routing pilot later.
- **No automatic sending to clients.** Every client message is a draft a person sends.
- **No user accounts or roles.** The website has one shared login (Amplify basic auth); see [13](13-environments-and-security.md).
- **No file upload in the website.** A bigger or new dataset is loaded with `python -m app.loader --data-dir`.
- **No changes to the pick procedure** (no second pick wave).
- **No refund or credit policy answers:** the data has no policy records; Ask says so.
- Mobile apps, multi-language, multi-tenant.

## 7. Edge cases, and the test that handles each

| # | Edge case | What the app does | Test |
|---|---|---|---|
| E01 | Email missing the postcode | Hold the order, ask the client | `test_order_desk.py::test_missing_postcode_is_held_with_a_follow_up` |
| E02 | Missing postcode, but the client has one matching past site | Suggest it; client must confirm | `test_new_agents.py::test_missing_postcode_is_found_in_history_and_held_for_confirmation` |
| E03 | More than one past site matches | No guess; hold as before | `test_new_agents.py::test_no_guess_without_a_unique_match` |
| E04 | Client's reply is unclear or hostile | Keep the hold | `test_new_agents.py::test_unclear_or_hostile_reply_keeps_the_hold` |
| E05 | AI tries to "correct" the address with words not in the reply | Refused | `test_new_agents.py::test_reply_reader_cannot_invent_an_address` |
| E06 | Country missing | Default US, recorded as an assumption | `test_order_intake.py::test_missing_country_defaults_to_us_and_is_recorded_as_assumption` |
| E07 | Vague quantity ("a couple of pallets") | Goes to a person | `test_order_desk.py::test_vague_quantity_needs_review` |
| E08 | Order lines in a CSV attachment | Read the lines | `test_order_desk.py::test_csv_attachment_lines_are_read` |
| E09 | Prompt injection in the email | Blocked before the AI | `test_order_desk.py::test_prompt_injection_is_blocked_before_the_model`, `test_guardrails.py::test_blocks_injection_variants` |
| E10 | Same-day order before 08:00 | Ships today | `test_order_desk.py::test_same_day_before_cutoff_keeps_same_day` |
| E11 | Same-day 09:00-10:00 with a real reason ("line stops at 3pm") | Today, any client | `test_order_desk.py::test_valid_reason_in_the_urgent_window_is_added_to_today` |
| E12 | "URGENT!!!" with no reason from an ordinary client | Tomorrow | `test_order_desk.py::test_shouting_urgent_from_an_ordinary_client_goes_to_tomorrow` |
| E13 | After the 10:00 hard stop, even with a valid reason from an at-risk client | Tomorrow, honest date | `test_order_desk.py::test_hard_stop_beats_even_a_valid_reason_from_an_at_risk_client` |
| E14 | AI quotes a sentence that is not in the email | Urgency counts as none | `test_order_desk.py::test_unverified_urgency_quote_is_dropped`, `test_order_intake.py::test_evidence_must_appear_in_the_email` |
| E15 | Bad cutoff settings (grace before 08:00, wrong format) | Refused; the API will not start with a bad setting | `test_late_orders.py::test_bad_times_are_rejected`, `test_endpoint_rejects_bad_times` |
| E16 | Nearest warehouse has no stock | Ship from the next, warn | `test_order_desk.py::test_west_order_ships_from_further_warehouse_when_nearest_has_no_stock` |
| E17 | Spreadsheet picks a weak carrier lane | Advisor switches carrier | `test_order_desk.py::test_advisor_never_picks_a_weak_lane` |
| E18 | Approve twice, or approve an order on hold | 409 / refused | `test_order_desk.py::test_approving_twice_is_a_409`, `test_on_hold_order_cannot_be_approved` |
| E19 | The AI service fails | 502 with a readable message on the desk | `test_order_desk.py::test_llm_failure_in_the_desk_is_a_502` |
| E20 | The AI returns broken JSON | Fall back to the rule parser | `test_llm_client.py::test_order_intake_falls_back_to_parser_on_bad_llm_json` |
| E21 | Gemini rate limit (429) | Wait and retry; give up on the daily quota | `test_gemini.py::test_gemini_429_waits_the_suggested_delay_then_succeeds`, `test_gemini_429_gives_up_on_daily_quota_and_after_max_retries` |
| E22 | Delay alert asked for an on-time delivery with no cause | Refused (409), nothing to warn | `test_delay_alert.py::test_on_time_delivery_with_no_cause_is_refused` |
| E23 | AI writes a number not in the facts (save plan, brief, claim letter) | Template used, reason flagged | `test_new_agents.py::test_invented_number_sends_the_plan_back_to_the_template`, `test_invented_amount_in_a_claim_letter_is_replaced` |
| E24 | Weekly brief "Send now" clicked twice | Sent once per week per day (409) | `test_email_smtp.py::test_send_endpoint_blocks_duplicates_and_guards_resend` |
| E25 | Empty, blank, oversized or malformed input | 422 with a readable message | `test_order_desk.py::test_blank_text_is_refused_with_a_readable_message`, `test_api.py::test_simulate_rejects_bad_input`; [evidence/bad-inputs.md](../evidence/bad-inputs.md) |
| E26 | Too many AI requests from one address | 429 with Retry-After | `test_security.py::test_agent_endpoints_return_429_with_error_shape` |
| E27 | API down | Website shows "Showing sample data" and still works | e2e `offline.spec.ts`; frontend `approve.test.ts` |
| E28 | Morning risk board must not use the future | Uses only deliveries delivered before that morning | `test_new_agents.py::test_board_uses_only_what_was_known_that_morning` |
| E29 | Penalty where Halcyon shared the fault | Not claimed from the carrier | `test_new_agents.py::test_claims_only_where_the_carrier_alone_was_at_fault` |
| E30 | Data quality: 1,339 deliveries with no route km, 21 duplicate order ids | No route deviation assumed; `delivery_id` used as the key | [03 Data quality](03-what-the-data-says.md#data-quality-notes-what-we-checked-what-we-assumed); `test_analytics.py::test_loader_loads_every_csv` |

All of these run in CI on every push (`.github/workflows/ci.yml`, on SQLite and on PostgreSQL 16). The latest local run:
[evidence/backend-tests.txt](../evidence/backend-tests.txt).
