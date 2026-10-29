# 14. Business benefit and innovation: before and after, with the method

Every number here comes from the repo: `analysis/output/findings.json` (made by `analysis/root_cause_analysis.py`),
the API (whose numbers CI checks against that file), or the backend tests that pin them. The method for each
line is linked, so anyone can re-run it.

## 1. The sponsor's KPI: on-time delivery, and the money

**Baseline:** 71.0% on time; benchmark 94%; $680K routing tool about to be signed.

| Option (per year) | On time | Penalties avoided | Redeliveries avoided | Cost | Net benefit | Net, penalties only |
|---|---|---|---|---|---|---|
| Today (baseline) | **71.0%** | - | - | - | - | - |
| Buy the routing tool only (best case) | 80.2% | $520K | $314K | $680K | $154K | **-$160K** |
| Fix our own work only (3 process fixes, best case) | 86.7% | $993K | $516K | $175K | $1.33M | $818K |
| **Fix all 5 causes, realistic** | **90.2%** | **$1.17M** | **$633K** | **$359K** | **$1.44M** | **$806K** |
| Fix all 5 perfectly (ceiling) | 99.0% | $1.69M | $920K | $359K | $2.25M | $1.33M |

**Method** ([03](03-what-the-data-says.md#the-business-case-what-each-option-buys-per-year)):
1. Tag each of the 48,340 deliveries with the 5 causes it had (yes/no each).
2. Deliveries with none of the 5 are 99.0% on time. A fix moves a delivery to the on-time rate of deliveries with its
   *other* causes. Points are split fairly between causes (Shapley), so nothing is counted twice (28.0 of 29.0 points).
3. Realistic case = each fix works part of the time (address 80%, same-day 70%, stock 50%, carrier 90%, route 50%).
4. Money = avoided late deliveries x that client's past SLA penalty, plus the $34 redelivery cost; 6 months x 2.
5. The routing tool can only touch carrier choice and route deviation, so its best case is 80.2%.

**Proof it is not fitted to the data:** weak lanes picked with a fixed rule on April-June only came out the same 7
lanes and stayed weak on July-September (64% vs 99% on time) ([03](03-what-the-data-says.md#did-we-just-fit-the-data-a-fair-test)).
**Re-checked automatically:** CI job `analysis` re-runs the script and asserts 0.71 / 0.9024 / 0.99;
`test_analytics.py::test_findings_match_analysis_output_exactly` checks the API gives the same numbers.

## 2. Each innovation: before, after, evidence

| # | Innovation | Before (today) | After (with DeliveryLens) | Method and evidence |
|---|---|---|---|---|
| 1 | **Find the real causes before buying software** (fair-share attribution of 5 yes/no causes) | "Routing is broken", $680K tool | The tool can touch only 2 of the 5 causes (carrier choice, route deviation): best case 80.2%, and -$160K a year on penalties alone | Section 1; Vendor decision page; `test_vendor_assessment_recommends_reshape` |
| 2 | **Late same-day grace rule** (08:00 list kept; grace to 09:00; urgent-only to 10:00; AI quotes the reason, code checks it) | Same-day orders after 08:00: 39% on time | 47% for these orders; **729 late deliveries avoided a year, $43,436 SLA**, less than 1 extra order per warehouse a day | Replay of the 4,826 real orders, `POST /api/simulate/late-orders`; [03](03-what-the-data-says.md#late-same-day-orders-the-grace-period-and-the-urgent-window); `test_late_orders.py` |
| 3 | **Missing address filled from history**, confirmed by the client in one click or a "Yes" reply | Incomplete address: 5,994 deliveries, 35% on time (6.9 points); staff chase by email | Order held before picking; the one matching past site is suggested; ships only after the client confirms. No guess when 0 or 2+ sites match | Order desk email M02; `test_missing_postcode_is_found_in_history_and_held_for_confirmation`, `test_no_guess_without_a_unique_match`. Gain counted inside the address fix (80% assumed), not added again |
| 4 | **Morning risk board** (risk from history, using only what was known that morning) | Nobody knows which of today's shipments will be late | Backtest on Aug-Sep (15,239 shipments, 57 days, never seen): **63% of the daily top 20 were really late vs 29% overall; AUC 0.81** | `GET /api/risk-board/backtest` (also answered by the live API on 2026-10-29); `test_backtest_beats_the_average`, `test_board_uses_only_what_was_known_that_morning` |
| 5 | **Carrier penalty recovery** (claim only where the carrier alone was at fault) | Halcyon pays every SLA penalty itself | **$261,900 in six months claimable, $128,700 from Carrier D**; claim letters and evidence CSV drafted | `GET /api/carriers/claims`; `test_claims_only_where_the_carrier_alone_was_at_fault` (pins both numbers). Assumes contracts allow pass-through |
| 6 | **AI reads, rules decide** (guardrails as a design rule) | AI tools can be talked into "URGENT!!!" or invent numbers | Injection blocked (16 variants), quotes checked, any AI number not in the facts sends the text back to the template, a person approves | [evidence/bad-inputs.md](../evidence/bad-inputs.md) B09, B10; `test_guardrails.py`; `test_invented_number_sends_the_plan_back_to_the_template` |
| 7 | **Order desk**: email in, checked order out, 10 visible steps | Staff type 14 email layouts by hand (44.4 hours a week) | 11 sample emails, each gives its expected decision; a juror's own email runs the same steps | `test_every_sample_email_meets_its_expected_decision_under_mock`; [evidence/bad-inputs.md](../evidence/bad-inputs.md) L01, L03 |
| 8 | **Far warehouse picked although the nearest had stock** | 691 orders, 51% on time vs 74%, $20,880 penalties | The Order desk warehouse rule always picks the nearest with stock | Stock & routes page; `test_west_order_ships_from_further_warehouse_when_nearest_has_no_stock` |
| 9 | **Tell clients before they chase** (delay alert + recovery plan) | 12 of 34 complaints: "nobody told us"; 64% of customer success time on complaints | Draft message with the cause and the new date, plus an internal plan with owner and escalation | `test_delay_alert.py` (13 tests). Benefit not counted in the money above |

## 3. Why this is a class of problems, not one fix

The same three steps work for any operation with an on-time flag and a few yes/no problem flags:
**find** (tag causes, split the lost points fairly), **fix** (one owner and one rule or agent per cause, AI only for
language), **prove** (replay on months the rule never saw). [evidence/scalability.md](../evidence/scalability.md#reuse-for-another-client-or-use-case)
shows what changes for another client: data folder, cutoff times, time zone. No code change.
