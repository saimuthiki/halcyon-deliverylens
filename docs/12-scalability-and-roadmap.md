# 12. Scalability, honest limits and the roadmap

## 1. How far it scales today (measured)

Measured on 2026-10-29 with [`evidence/scalability_bench.py`](../evidence/scalability_bench.py). Full table:
[evidence/scalability.md](../evidence/scalability.md).

| | Today: 48,340 deliveries | 10x: 483,400 deliveries |
|---|---|---|
| Load the data | 1.8 s | 21.1 s |
| First request after a restart | 1.8 s | 20.7 s |
| Memory for the dataset | 75 MB | 750 MB |
| Analytics calls (KPIs, causes, simulate, vendor, ROI) | 2 to 44 ms | 5 to 356 ms |
| Morning risk board | 78 ms | 959 ms |
| Errors | none | none |

**What breaks at 10x, and the fix:**

| What breaks | Why | Fix | Effort |
|---|---|---|---|
| Memory on the t3.small (2 GB) | The whole dataset is kept in pandas, 750 MB at 10x | Pre-aggregate per day / lane / client in PostgreSQL (materialised views, refreshed nightly); the API reads summaries | 2-3 days |
| 21 s first request after a deploy | Cache is built on the first request | Warm it in the deploy step (call `/api/kpis` after `/api/health`); later, the pre-aggregation above | 1 hour |
| One server = no failover | Single EC2 | ECS Fargate, 2 tasks behind an Application Load Balancer, same image | 2 days |
| Rate limit counts per process | In-memory limiter | Shared limiter (ElastiCache Redis) or limit at the proxy | 1 day |
| AI cost grows with email volume | About 2 AI calls per order email | Daily Bedrock budget alarm; skip the AI for EDI/API orders (already structured) | 1 day |
| Email bursts slow the website | Emails are processed in the web request | SQS queue + a worker container | 2 days |

## 2. Honest limitations today

1. **The business case is a model, not a measured result.** The on-time gains assume how well each fix works
   (address 80%, same-day 70%, stock 50%, carrier 90%, route 50%) and estimated costs. The simulator lets anyone
   change these. A real pilot is needed to measure them.
2. **No live systems.** No real inbox, WMS, TMS or carrier feed. The Order desk uses 11 sample emails, a pasted
   email, and its own WMS table.
3. **The urgent-window replay is an upper bound** (history has no email text) ([03](03-what-the-data-says.md)).
4. **Discovery answers are partly missing.** The business owner answered the pick-list question; other round-2
   answers did not come back, so those are written as assumptions ([10](10-discovery-and-requirements.md#4-assumptions)).
5. **Security is demo-level:** one shared website login, the API is open (rate-limited), `/docs` is public, address
   confirmation links do not expire ([13](13-environments-and-security.md), [security audit](security/security-audit-2026-10-29.md)).
6. **One environment in AWS.** Dev and test run on laptops and in CI, not in separate AWS accounts.
7. **Browser tests cannot run on the team's Windows laptops.** The Playwright suite last ran on 23 Oct
   (22 of 22, then 30 of 30 after round 3); unit and API tests run on every push.
8. **React Router 6** has 2 moderate advisories; the fix is the React Router 7 upgrade.
9. The Bedrock AI quality evaluation ([evidence/ai-agent-eval.md](../evidence/ai-agent-eval.md)) was run in mock mode;
   the live Bedrock agents were checked by hand, not by a scored evaluation.

## 3. Roadmap (in priority order)

| # | When | What | Why first |
|---|---|---|---|
| 1 | Week 1 after go-ahead | **Pilot the three process fixes** (address check, grace period, stock rebalancing) at one warehouse; measure on-time weekly against the 71% baseline | Cheapest, no new software, proves the model with real numbers |
| 2 | Week 1 | **Carrier choice by lane** in the carrier spreadsheet (about $84K a year in rates) | Biggest single cause (7.7 points) |
| 3 | Week 1 | **Security for production:** real login (Cognito) for the website and API, `DEMO_TOKEN` on, hide `/docs`, expiring confirmation links, pin GitHub Actions to SHAs, revoke the old Gemini key | Before any real client data |
| 4 | Weeks 2-4 | **Connect the real order inbox** (SES inbound or the mail server) and the WMS API; keep human approval | Moves the Order desk from demo to daily use |
| 5 | Weeks 2-4 | **10x readiness:** pre-aggregated tables in PostgreSQL, cache warm-up on deploy, ECS Fargate with 2 tasks, shared rate limit, SQS for emails | See the table above |
| 6 | Weeks 4-6 | **Separate AWS environments** (dev / staging / prod accounts) with the same scripts, moved to CDK | Safer changes |
| 7 | Weeks 4-6 | **Carrier delay feeds** (D portal, E and F batch files) for proactive delay alerts | 12 of 34 complaints say "nobody told us" |
| 8 | Week 6+ | **Small routing pilot** only on lanes with high route deviation | Route deviation costs 3.1 points; test before buying the $680K tool |
| 9 | Later | Reuse for other Evoke clients: load their data with `--data-dir`, set cutoff times and time zone ([evidence/scalability.md](../evidence/scalability.md#reuse-for-another-client-or-use-case)) | Same pattern, little change |
