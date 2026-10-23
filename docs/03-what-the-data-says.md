# 3. What the data says

We looked at all **48,340 deliveries** from 1 April to 25 September 2026. Every number below is
produced by `analysis/root_cause_analysis.py`; the results are in
`analysis/output/findings.json`. Anyone can re-run it and get the same numbers.

## The headline in one picture

```mermaid
xychart-beta
  title "On-time delivery: today vs each option"
  x-axis ["Today", "Routing vendor only", "3 process fixes", "All 5 fixes (realistic)", "All 5 fully fixed (ceiling)", "Benchmark"]
  y-axis "On-time %" 0 --> 100
  bar [71.0, 80.2, 86.7, 90.2, 99.0, 94.0]
```

**What this shows**
- **Today:** 71 of every 100 deliveries are on time.
- **Routing tool only:** at best about 80, even if it fixes everything routing can fix
  (carrier choice and route deviation).
- **Three process fixes:** about 87. These are address checks, the same-day cutoff and stock
  placement.
- **All five fixes, realistic case:** about **90**. This assumes each fix works most of the time,
  not always (see the assumptions below).
- **Ceiling:** if every cause were removed completely, about **99**. That is the upper limit, not
  a promise.
- **To pass the 94% benchmark,** each fix has to work about **84%** of the time.

## Proof that we found the real causes

```mermaid
flowchart LR
  ALL["All 48,340 deliveries<br/>71.0% on time<br/>29.0 points below perfect"] --> NO["21,280 deliveries with<br/>none of the 5 problems<br/><b>99.0% on time</b>"]
  ALL --> YES["27,060 deliveries with<br/>at least one problem<br/><b>about 49% on time</b>"]
```

**What this shows**
- Deliveries with none of the five problems are on time **99%** of the time. Halcyon's normal
  operation works; these five problems pull it down.
- The five causes explain **28.0 of the 29.0 on-time points** lost today. The last point is
  ordinary noise: even problem-free deliveries are occasionally late.

## The five causes

```mermaid
xychart-beta
  title "On-time points lost to each cause (fair share, total 28.0)"
  x-axis ["Weak carrier on a lane", "Incomplete address", "Same-day order after 08:00", "Stock not at nearest warehouse", "Route deviation"]
  y-axis "Points of on-time %" 0 --> 9
  bar [7.7, 6.9, 5.4, 4.9, 3.1]
```

**What this shows:** how many on-time points each cause costs. "Fair share" means that when one
delivery has two problems, the blame is split between them, so nothing is counted twice.

| # | Cause | How many deliveries | On time when it happens | Example from the data | Can a routing tool fix it? |
|---|---|---|---|---|---|
| 1 | **Weak carrier on a lane**: Carrier D in every region, E to the West, F to the Northeast and Southeast | 12,624 (26%) | 59% | Carrier F, the "preferred supplier", is 54% on time to the Southeast. A, B and C are about 99% when nothing else is wrong | Partly: carrier selection, which needs no new software |
| 2 | **Incomplete address** when the order arrives | 5,994 (12%) | 35% | 28% of email orders have an incomplete address, against 5% of EDI/API orders | No |
| 3 | **Same-day order after 08:00**, when the pick list is already printed | 4,826 (10%) | 39% | A same-day order at 07:45 is on time 75% of the time; at 08:15 it drops to 38% | No |
| 4 | **Stock not at the nearest warehouse**, so it ships from far away | 6,009 (12%) | 50% | An order for the West ships from the Midwest, about 1,600 miles instead of about 160 | No |
| 5 | **Route deviation**: the driver went more than 20% beyond the planned route | 2,880 (6%) | 37% | Planned 150 km, drove 190 km | **Yes**, this is what routing tools fix |

## Carriers: Carrier D is weak everywhere; E and F on certain lanes

```mermaid
flowchart TB
  subgraph GOOD["About 99% on time (when nothing else is wrong)"]
    A["Carrier A: all regions"]
    B["Carrier B: all regions"]
    Cc["Carrier C: all regions"]
    E1["Carrier E: Midwest, Northeast, Southeast"]
    F1["Carrier F: Midwest, West"]
  end
  subgraph WEAK["Weak lanes"]
    D1["Carrier D: Midwest 55%, Southeast 56%"]
    D2["Carrier D: Northeast 81%, West 80%"]
    E2["Carrier E: West 55%"]
    F2["Carrier F (preferred supplier):<br/>Northeast 57%, Southeast 54%"]
  end
```

**What this shows**
- We compared carriers only on deliveries with **none of the other four problems**, so the
  comparison is fair.
- Most carrier–region pairs are about 99% on time.
- **Carrier D is weak in every region:** very weak in the Midwest and Southeast, and still about
  20 points behind in the Northeast and West.
- Carrier E is weak only to the West.
- Carrier F, the "preferred supplier", is weak to the Northeast and Southeast.
- The fix is simple: send those shipments with a strong carrier in that region.
  - **This needs no new software.** It is a change to the carrier preference spreadsheet.
- Switching costs a little more, about **$84K a year** in higher rates on these lanes, because
  the weak lanes are the cheap ones. That is far less than the penalties and redeliveries they
  cause.

## Did we just fit the data? A fair test

```mermaid
flowchart LR
  A["April–June data only<br/>rule: a lane is 'weak' if it is 10+ points<br/>below the region's typical carrier<br/>(on deliveries with no other problem)"] --> B["Picks exactly the same 7 lanes"]
  B --> C["Test on July–September<br/>(data the rule never saw)"]
  C --> D["Weak lanes: 64% on time<br/>Other lanes: 99% on time"]
  C --> E["Deliveries with none of the<br/>5 problems: 98.9% on time"]
```

**What this shows**
- A fair worry: did we choose the weak lanes by looking at the answers?
- So we chose them using only the first three months, with a fixed rule, and tested them on the
  last three months.
- The same seven lanes came out, and they stayed weak on the months the rule never saw.
- The causes are stable over time, not a coincidence.
- See `holdout_check` in `findings.json`.

## The same-day cutoff

```mermaid
xychart-beta
  title "Same-day orders: on-time % by the hour the order arrived"
  x-axis ["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13"]
  y-axis "On-time %" 0 --> 100
  line [74, 76, 74, 73, 74, 77, 72, 75, 38, 39, 39, 38, 40, 40]
```

**What this shows**
- Same-day orders that arrive **before 08:00** are on time about 75% of the time.
- From 08:00 on, they fall to about 39%, because the pick list has already been printed.
- The fix:
  1. stop promising "same day" after 08:00, or
  2. add a second pick wave (for example at 11:00).

## Money and people

```mermaid
flowchart LR
  L["14,019 late deliveries<br/>in 6 months"] --> P["$872,460 SLA penalties<br/>(about $1.74M a year)"]
  L --> RD["$476,646 redelivery costs<br/>(about $0.95M a year, to confirm)"]
  L --> C["34 complaints in 90 days<br/>24 from the 9 at-risk clients<br/>12 say 'nobody told us'"]
  L --> CS["Customer success team:<br/>64% of their week on complaints"]
  C --> R["9 clients, $14.2M a year,<br/>threatening to leave"]
```

**What this shows**
- Late deliveries cost about $1.74M a year in penalties.
- Redeliveries may cost about $0.95M more. We are checking this with the client: every late
  delivery shows exactly $34, which may be a recording rule.
- **Why the 9 clients are leaving:** their deliveries are no later than anyone else's (70.7% vs
  71.1% on time). What sets them apart is **complaints**: 24 of the 34 come from them, and many
  say "nobody told us it would be late".
  - Telling clients early (our Delay Alert agent) is the fastest way to keep them, even before
    on-time delivery improves.

## The business case: what each option buys (per year)

| Option | On-time | Penalties avoided | Redeliveries avoided | Cost per year (estimate) | Net benefit | Net, penalties only (cautious) |
|---|---|---|---|---|---|---|
| Routing vendor only (best case) | 80.2% | $520K | $314K | $680K (vendor budget) | $154K | **−$160K** |
| 3 process fixes (best case) | 86.7% | $993K | $516K | $175K | $1.33M | $818K |
| **All 5 fixes, realistic** | **90.2%** | **$1.17M** | **$633K** | **$359K** | **$1.44M** | **$806K** |
| All 5 fixes, ceiling | 99.0% | $1.69M | $920K | $359K | $2.25M | $1.33M |

**What this shows**
- Even on the cautious view (penalties only, ignoring redelivery costs), the routing vendor
  **does not pay for itself in year one**.
- Our realistic plan gives about **$0.8M–$1.4M a year net**, before counting the $14.2M of
  revenue at risk.

**Our assumptions (please challenge them):**

| Fix | Assumed effectiveness (realistic case) | Assumed cost per year |
|---|---|---|
| Order Intake Agent (addresses) | 80% of gaps caught | $60K (build + Bedrock + support) |
| Same-day: second pick wave or honest promise | 70% | $65K (about 2 extra hours a day at 5 warehouses) |
| Monthly stock rebalancing | 50% | $50K (extra transfers) |
| Carrier choice by lane | 90% | $84K (higher rates; calculated from the rate card) |
| Route discipline / small routing pilot | 50% | $100K |

## Data quality notes (what we checked, what we assumed)

| What we found | What we did |
|---|---|
| 1,339 deliveries have no `actual_route_km` | Treated as "no route deviation". Those deliveries are 75% on time |
| 21 order IDs appear twice, for different clients | Kept them: `delivery_id` is unique. Asked the client |
| Every late delivery has a $34 redelivery cost, and no on-time one does | Looks like a recording rule. Asked the client; we show "penalties only" figures too |
| The 14 email layouts all perform about the same (69–73%) | The layout is not the problem; missing address fields are |
| `days_late` and `on_time` always agree with the dates | No fixes needed |

## What this means for the advice to leadership

```mermaid
flowchart TB
  Q{"Sign the $680K<br/>routing contract now?"} -->|Our advice| A["Not as scoped. Reshape it."]
  A --> F1["Weeks 1–4: process fixes<br/>address check · same-day rule · stock rebalancing<br/>→ about 87% (best case)"]
  A --> F2["Weeks 2–6: carrier choice by lane<br/>(no software; about $84K a year in rates)"]
  A --> F3["Then: a small routing pilot only on<br/>lanes with high route deviation"]
  A --> F4["From day 1: proactive delay alerts<br/>for the 9 at-risk clients"]
  F1 --> G["Realistic: about 90%<br/>94%+ if each fix works about 84% of the time"]
  F2 --> G
  F3 --> G
```

**What this shows:** we don't say "never buy routing software". We say:
1. Fix the cheaper causes first.
2. Choose carriers by lane.
3. Tell at-risk clients about delays now.
4. Only then test routing software, where routes are really the problem.

Each step is measured, so leadership can see the number move before spending more.
