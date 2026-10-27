# Spec: late same-day orders (grace period, urgent window, hard stop)

Brief item: "08:00 pick-list cutoff: assess the impact of late-arriving orders; if possible, a priority-based
processing simulation."

This spec replaces the earlier "priority pick wave" spec (a second 11:00 pick wave with N slots per
warehouse). The business owner said the company's procedure must not change: the 08:00 pick list stays,
and there is no second wave.

## Problem (already measured)

4,826 same-day orders (10%) arrived after 08:00, when the pick list is already printed. They are on time
39% of the time against 75% before 08:00. Today every one of them moves to tomorrow's pick list. Orders
arrive evenly from 08:00 to 13:59.

## The rule

The 08:00 pick list stays. A same-day order with a complete address that arrives after 08:00 is handled
by its arrival time (warehouse-local):

| Arrives | Email | Client | Result | Who decides |
|---|---|---|---|---|
| Before 08:00 | Any | Any | Today's pick list (unchanged) | Rule |
| 08:00 to grace time (default 09:00) | Any | Any | Today: **grace period** | Rule |
| Grace time to hard stop (default 10:00) | Urgent with a valid reason (urgency `high`) | Any | Today | AI reads, code checks, rule decides |
| Grace time to hard stop | Says urgent, no reason (urgency `medium`) | Priority client | Today | AI reads, code checks, rule decides |
| Grace time to hard stop | Says urgent, no reason | Other clients | Tomorrow | Rule |
| Grace time to hard stop | Not urgent | Any | Tomorrow, even for a priority client | Rule |
| From the hard stop | Any | Any | Tomorrow: **hard stop** | Rule |

- **Priority client:** Tier 1 (`account_tier == "Tier 1"`, at least $1M revenue a year) or at risk of
  leaving (`account_status == "threatening_to_leave"`).
- **Valid reason:** the email shows operational impact, for example "Our production line stops at 3pm
  without these parts." or a store opening. "URGENT!!!" on its own is only `medium`.
- An order with an incomplete address is on hold (step 5) and never added.
- An order that is not added is re-promised as next-day. The client reply says so.
- The time windows are half-open: an order at exactly 09:00 is in the urgent window; at exactly 10:00 it
  is after the hard stop.

### What the AI does and what code does

- **AI reads** (Order Intake Agent, step 3): `urgency` (`none`, `medium`, `high`) and `urgency_evidence`,
  the exact sentence from the email.
- **Code checks** (`verify_urgency` in `backend/app/agents/order_intake.py`):
  - the quote must be a whole sentence or line of the body or attachment text (case and whitespace
    ignored; headers do not count), at least 15 characters;
  - `high` is kept only when the quote shows operational impact (a stopped line, a fixed deadline, a
    store opening, a shutdown); otherwise it is capped at `medium`;
  - a quote that fails is dropped: urgency becomes `none` and the flag `urgency_quote_not_verified` is
    added.
- **The rule decides** (`same_day_decision` in `backend/app/analytics/late_orders.py`), from the arrival
  time, the checked urgency, the tier and the at-risk flag. The AI never decides the outcome.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `SAME_DAY_GRACE_UNTIL` | `09:00` | End of the grace period |
| `SAME_DAY_HARD_STOP` | `10:00` | End of the urgent window |

- Format `HH:MM`, on the hour or half hour.
- 08:00 ≤ grace ≤ hard stop ≤ 14:00. Equal times are allowed: both at `08:00` sends every late order to
  tomorrow, as before.
- `check_times` runs at start-up (`backend/app/main.py`); the API refuses to start on a bad value.
- Both are in `backend/.env.example`. The AWS secret does not set them, so the defaults apply there.

## Order desk (step 6, `promise_check`)

`backend/app/desk/pipeline.py` calls `same_day_decision` with the settings above. The step details carry
`grace_until`, `hard_stop`, `window`, `window_label`, `added_after_cutoff`, `same_day_rule` (the reason in
plain English), `priority_client`, `urgency` and `urgency_evidence`. Status is `pass` when the order is
added, `warn` when it is re-promised.

Sample emails for this rule (`data/sample-inbox/manifest.json`):

| Email | Arrives | Client | Email says | Result |
|---|---|---|---|---|
| M16 | 08:35 | C051, Tier 3 | Plain same-day order | Added (grace period) |
| M14 | 09:15 | C018, Tier 3, not at risk | "URGENT!!!" only | Tomorrow |
| M15 | 09:20 | C003, Tier 1 | "This one is URGENT" | Added (priority client) |
| M04 | 09:30 | C078, Tier 1 | "it is for a store opening" | Added (valid reason) |
| M13 | 09:40 | C076, Tier 2 | "Our production line stops at 3pm without these parts." | Added (valid reason) |
| M17 | 10:20 | C190, at risk | "Our production line stops at 4pm without these parts." | Tomorrow (hard stop) |

All 17 emails under the mock provider: 13 accepted, 2 on hold, 1 needs review, 1 blocked.

## API contract

`POST /api/simulate/late-orders` (replaces `POST /api/simulate/pick-wave`)

Request (the body and both fields are optional):

```json
{"grace_until": "09:00", "hard_stop": "10:00"}
```

- A missing value uses the Order desk's setting (`SAME_DAY_GRACE_UNTIL`, `SAME_DAY_HARD_STOP`).
- A bad value (wrong format, not on the half hour, out of order or out of range) gives 422
  `validation_error`.
- Changing the times here changes only the replay, not the Order desk.

Response with the defaults (lists shortened):

```json
{
  "inputs": {"pick_list_cutoff": "08:00", "grace_until": "09:00", "hard_stop": "10:00"},
  "population": {
    "after_cutoff_same_day": 4826, "days": 178, "warehouses": 5, "on_time_rate_today": 0.39,
    "grace_orders": 799, "urgent_window_orders": 821, "urgent_window_priority_client_orders": 175,
    "after_hard_stop_orders": 3206, "incomplete_address_excluded": 106
  },
  "grace": {
    "orders": 741, "extra_orders_per_warehouse_day": 0.83, "late_avoided_per_year": 729.4,
    "sla_penalties_avoided_usd_per_year": 43436, "at_risk_late_avoided_per_year": 159.0
  },
  "urgent_priority_clients_at_most": {
    "orders": 159, "extra_orders_per_warehouse_day": 0.18, "late_avoided_per_year": 166.0,
    "sla_penalties_avoided_usd_per_year": 16927, "at_risk_late_avoided_per_year": 138.2
  },
  "urgent_other_clients_with_valid_reason": 614,
  "on_time_rate_after_cutoff_orders": {"today": 0.39, "with_grace": 0.4655, "with_grace_and_urgent_at_most": 0.4827},
  "arrivals": [{"from": "08:00", "to": "08:30", "orders": 412, "window": "grace"}],
  "rules": [{"when": "Before 08:00", "email": "Any", "client": "Any", "result": "today", "actor": "Rule",
             "note": "The normal pick list."}],
  "method": "...",
  "assumptions": ["..."],
  "order_desk_settings": {"grace_until": "09:00", "hard_stop": "10:00"}
}
```

- `population.incomplete_address_excluded` counts orders in the grace period and the urgent window only.
- `urgent_other_clients_with_valid_reason` is the number of complete-address orders from other clients in
  the urgent window. They would need a valid reason; history cannot show it, so they are not added.
- `arrivals` has one row per half hour from 08:00 to 14:00, with the window it falls in.
- `rules` is the rule table above, in the order it is applied.

## Replay method

- Population: the 4,826 historical same-day orders received after 08:00 (cause `same_day_after_cutoff`),
  over 178 days and 5 warehouses.
- Window of each order: from its received time, with the chosen grace and hard-stop times.
- Orders added:
  - grace period: every order with a complete address (exact for the history);
  - urgent window: every order from a priority client with a complete address, as if each one said it
    was urgent. History has no email text, so this is an **upper bound**;
  - after the hard stop: none.
- Benefit of an added order: the cause `same_day_after_cutoff` is removed, with the existing combo model
  (the What-if simulator's method):
  - `gain = ds.combos.rate_after(key, BIT['same_day_after_cutoff']) - ds.combos.rate[key]`
  - `key` is that delivery's cause combination.
- Late deliveries avoided = sum of gains.
- SLA penalties avoided = gain × the client's expected SLA penalty per late delivery (its penalties / its
  late deliveries). A client with the clause but no late delivery uses the ratio across all SLA-clause
  clients; a client without the clause is 0.
- Extra orders per warehouse-day = orders added / (days × warehouses).
- On-time rate = today's rate + sum of gains / 4,826.
- Order counts are for the six months of data; late deliveries and money are per year (six months × 2).

## Results with the defaults (09:00, 10:00)

| | Grace period (exact) | Urgent window, priority clients (upper bound) |
|---|---|---|
| Orders in the window | 799 | 821 (175 from priority clients) |
| Orders added | 741 | at most 159 |
| Extra orders per warehouse per day | 0.83 | at most 0.18 |
| Late deliveries avoided a year | 729 | up to 166 |
| SLA penalties avoided a year | $43,436 | up to $16,927 |
| At-risk late deliveries avoided a year | 159 | up to 138 |

- 3,206 orders arrive after the 10:00 hard stop and go to tomorrow.
- 106 orders in the first two windows have an incomplete address and are excluded.
- On-time rate for these orders: 39% today, 47% with the grace period, at most 48% with the urgent window.

## Frontend

- Page `/late-orders`, sidebar label **"Late same-day orders"** in *The decision* (replaces
  "Late-order pick wave", `/pick-wave`).
- Title states the finding with the real numbers for the chosen times.
- Controls: grace time and hard-stop time, in half-hour steps, starting at the Order desk's settings.
- Panels: the rule table with Actor badges (AI agent for urgency, Rule for the rest), arrivals per half
  hour by window, what each window adds (urgent window marked as an upper bound), the on-time rate, and
  the method and assumptions.
- Offline fallback with the "Sample — API offline" notice, like every other page.
- The Order desk trace shows the window, the reason and the urgency evidence at step 6.

## Delay alert recovery plan

The same-day cause action reads: "Remind the client that same-day orders need to reach us by 08:00 (or
09:00 at the latest); until 10:00 only urgent orders are added, and after that offer next-day at order
time." The recovery priority points do not change (at-risk 40, SLA clause 30, Tier 1 20, Tier 2 10, +15
for a complaint in the last 90 days, +15 for a predicted delay of 3+ days).

## Tests

`backend/tests/test_late_orders.py` (replaces `test_pick_wave.py`): the decision table, the time checks,
the replay figures and the API.
