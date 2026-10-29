# Project progress: Halcyon DeliveryLens (EvoHack 2026, Team InfinityStacks)

> **Rule for every team member and every AI session (Claude Code or any other agent):**
> 1. **Read this file first**, before you change anything. It is the shared context for the whole hackathon.
> 2. **Update it at the end of every session** in which something changed: features, fixes, AWS resources,
>    decisions, blockers. Add a dated line to the [Change log](#change-log) and fix any section that is now wrong.
> 3. Commit it with your changes, so the next person who pulls gets the current state.
> 4. Never put secrets here (keys, passwords, `.pem` contents, `.env` values).

Last updated: 2026-10-29 by Sai M (with Claude Code).

## 1. What we are building
- **Problem 2:** Halcyon Logistics is 71% on time (benchmark 94%), and its leaders were about to buy a $680K routing tool.
- **Our answer:** routing explains only a small part of the lateness. DeliveryLens:
  - **finds** the 5 causes in the data;
  - **fixes** each one with AI agents (Claude on Amazon Bedrock) and simple rules;
  - **proves** the effect: about 90% on time in the realistic case, about $1.4M a year.
- **The 5 causes:**
  - weak carrier lanes (Carrier D everywhere);
  - incomplete addresses;
  - same-day orders after the 08:00 cutoff;
  - stock not at the nearest warehouse;
  - route deviation.
- **Team:** Sravan Kumar D, Sai M, Dinesh K. **Deadline:** 29 Oct (see `docs/05-five-day-plan.md`).
- **Start reading:** `README.md` → `docs/00-START-HERE.md` → `docs/08-user-guide.md`.

## 2. Live links (AWS)
| What | URL |
|---|---|
| Website | https://main.d19tzovsk3zuvo.amplifyapp.com |
| API health | https://35-175-32-49.sslip.io/api/health |
| API docs | https://35-175-32-49.sslip.io/docs |

The **website** now asks for a username and password (Amplify basic auth, set in the AWS console on 2026-10-28; the password is not in the repo, ask the team). The **API** has no login: anyone with its URL can call it. Client address-confirmation links now open a page on the API (`/c/confirm-address/...`, `backend/app/api/client_pages.py`), so clients never see the website password prompt; the deploy sets `PUBLIC_API_URL` on the server. The weekly brief's "Open the full brief" link is for Halcyon staff and still asks for the website login.

## 3. Features built (all live and tested on AWS)
| Feature | Where (frontend page / backend) | Status |
|---|---|---|
| Overview, why late, carriers, clients, stock and routes, vendor check | `frontend/src/pages/*`, `backend/app/analytics` | ✅ Live |
| What-if simulator (fix the causes, see the on-time %) | `Simulator.tsx`, `POST /api/simulate` | ✅ Live |
| **Order desk:** AI reads 11 order emails (one per scenario) in 10 steps, guardrails, a person approves before the WMS | `OrderDesk.tsx`, `backend/app/desk/pipeline.py` | ✅ Live: all 11 emails give the expected result |
| **Late same-day orders:** before 08:00 → today; 08:00–09:00 grace → today; 09:00–10:00 only urgent (valid reason, or "urgent" from a priority client) → today; after 10:00 → tomorrow | `LateOrders.tsx`, `backend/app/analytics/late_orders.py`, env `SAME_DAY_GRACE_UNTIL` / `SAME_DAY_HARD_STOP` | ✅ Live (729 late deliveries avoided a year, $43K SLA) |
| Delay alert: AI drafts the client message plus a recovery plan | `backend/app/agents/delay_alert.py` | ✅ Live |
| Ask: questions in plain English over the data and complaints | `Ask.tsx`, `backend/app/agents/ask.py` | ✅ Live |
| Activity: every AI call logged (tokens, latency, guardrail flags) | `Activity.tsx`, `GET /api/agents/runs` | ✅ Live |
| **Missing address filled from history:** when an email leaves out a postcode or street, the Order desk finds the one past delivery site that matches what the email did give, and asks the client to confirm it with a one-click link or a one-line reply ("Yes"). The Reply Reader Agent reads replies; a corrected detail is used only if it appears in the reply word for word. Nothing ships until the client confirms. | `backend/app/desk/address_book.py`, `data/sample-inbox/address-book.csv` (stands in for the WMS ship-to history), `components/AddressConfirmCard.tsx`, client page on the API `/c/confirm-address/{token}` (no website login; locally `/confirm-address/:token` in the web app), `POST /api/desk/confirm/{token}`, `POST /api/desk/reply/{message_id}` | ✅ Built and tested locally; ⏳ live after the next deploy |
| **Save plans for the 9 at-risk clients ($14.2M):** the Account Save Agent writes a summary for the account owner, talking points, a meeting agenda and an email to the client, from that client's own deliveries, causes, penalties and complaints, with their projected on-time rate after the fixes | `backend/app/agents/account_plan.py`, "Save plan" button on At-risk clients (`components/SavePlanDrawer.tsx`), `POST /api/agents/account-plan` | ✅ Built and tested locally; ⏳ live after the next deploy |
| **Carrier penalty recovery:** finds the SLA penalties Halcyon paid where the carrier alone was at fault (handed over on time, complete address, stock at the nearest warehouse, and a weak lane or a route well beyond plan): **$261,900 in six months, $128,700 from Carrier D**. Shared-fault deliveries are not claimed. The Carrier Claims Agent drafts a claim letter per carrier (or per month), with the evidence list as a CSV. Assumption: the carrier contracts allow passing on penalties; confirm with Halcyon. | `backend/app/agents/carrier_claims.py`, Carriers page → "Recover penalties the carriers caused" (`components/PenaltyClaims.tsx`), `GET /api/carriers/claims`, `POST /api/agents/carrier-claim` | ✅ Built and tested locally |
| **Morning risk board:** at 08:00 every shipment on the pick list gets a late risk = how often past deliveries with the same pre-ship problems (address, same-day after 08:00, stock elsewhere, weak lane) and promise type were late, using only deliveries delivered before that morning. The riskiest are listed first with the fixes still possible (confirm the address, switch carrier) and the risk after them. Backtest on Aug-Sep (never seen): 63% of the daily top 20 were really late vs 29% overall, AUC 0.81. No AI in the score; the Morning Note Agent writes the 08:00 huddle message. | `backend/app/analytics/risk_board.py`, `backend/app/agents/morning_note.py`, page `/risk-board`, `GET /api/risk-board`, `GET /api/risk-board/backtest`, `POST /api/agents/morning-note` | ✅ Built and tested locally |
| **Weekly brief for the COO and CFO:** a one-page Monday email: on time against last week and the 94% target, the money lost, the at-risk clients, why deliveries were late, three actions with owners | `backend/app/agents/weekly_brief.py`, page `/weekly-brief`, `POST /api/agents/weekly-brief`, `POST /api/briefs/weekly/send`; sent by Amazon SNS every Monday 07:00 US Central (`infra/scripts/09-weekly-brief.sh`) | ✅ Built and tested locally; ⏳ AWS setup (script 09) waits for the recipient list |

**Decisions to keep:**
- The company's pick procedure must not change, so there is no extra 11:00 pick wave.
- **Number guardrail** (`app/guardrails.py: unverified_numbers`): every number an AI writes in a save plan or weekly brief must come from the facts it was given; otherwise the template is used and the reason is flagged.
- The weekly brief goes by **Amazon SNS, not SES**: evoketechnologies.com has a DMARC `p=reject` policy, so email sent for that domain by another service would be rejected. With a domain we control, switch to SES.
- The brief's recipients are set on the server (SNS subscriptions, or `WEEKLY_BRIEF_TO`/test recipients for SMTP), never taken from a web request. Each reporting week is sent at most once a day (database send log); different weeks can be sent back to back (no time-based cooldown).
- An address from history is a **suggestion**: the client must confirm it. If more than one past site matches, or the email gives no detail to match on, the order is simply held as before.
- Colours (see `DESIGN.md`): orange = problem, teal = fix, purple = AI only.

## 4. AWS setup (account Infinity Stacks 781547812451, region us-east-1)
**Created with the AWS CLI scripts in `infra/scripts/` (not CDK).** Run them in order, 00 to 09. `99-teardown.sh` deletes everything.

| Service | Resource | Notes |
|---|---|---|
| Bedrock | Claude Haiku 5.5 (fast) and Sonnet 5.5 (smart) | On-demand models, pay per call, **not** custom models (no fixed cost) |
| EC2 | `deliverylens-api` (t3.small), Elastic IP 35.175.32.49 | Runs the API in Docker plus Caddy for HTTPS. Upgrade to t3.medium only if it gets slow |
| RDS | `deliverylens-db` (PostgreSQL, db.t4g.micro) | Private, encrypted; 48,340 deliveries loaded |
| Amplify | app `d19tzovsk3zuvo` | Hosts the website (React build) |
| S3 | `deliverylens-data-781547812451` | Dataset and archived agent inputs |
| ECR | `deliverylens-api` | API images, pushed by GitHub Actions |
| Secrets Manager | `deliverylens/app` | Database URL, model IDs, settings |
| IAM | `deliverylens-ec2-role`, `deliverylens-github-deploy` plus GitHub OIDC | No access keys anywhere |
| CloudWatch | dashboard `deliverylens`, 3 alarms, logs `/deliverylens/api` | Alarms email Sai, Dinesh and Sravan (SNS topic `deliverylens-alarms`) |
| Systems Manager | the EC2 server is a managed node | Used by the auto-deploy instead of SSH; each deploy also refreshes the server settings from Secrets Manager |
| SNS (weekly brief) | topic `deliverylens-weekly-brief` (script 09, not run yet) | Monday brief email; a systemd timer on the server sends it |
| Budgets | $100/month alert | Expected about $37/month plus a small Bedrock charge |

**Architecture:** frontend on Amplify → API on EC2 (Docker) → RDS PostgreSQL. The AI goes through Bedrock.

## 5. How to deploy
- **Automatic:** push to `main` → CI runs the tests → `.github/workflows/deploy.yml`:
  - builds the API image and pushes it to ECR;
  - restarts the API on EC2 via Systems Manager and checks `/api/health`;
  - builds the website and uploads it to Amplify.
- **No GitHub secrets needed.** GitHub signs in to AWS with OIDC, and only the `main` branch of `Evoke-Hackathon-2026/InfinityStacks` is trusted.
  - GitHub sends the repo in an ID-based form (`Evoke-Hackathon-2026@346869943/InfinityStacks@1435387832`), so the
    role trusts both forms (`infra/policies/github-trust.json`, `GITHUB_REPO_IDS` in `infra/config.env`).
    Add that line to your own `infra/config.env` before re-running `01-iam.sh`.
- **Watch it:** GitHub → Actions → "Deploy to AWS". Run it by hand with **Run workflow** on `main`.
- **Roll back the API:** the image from before the first auto-deploy is kept on the server as `deliverylens-api:pre-cicd`.
  Re-tag it as the `IMAGE` in `/home/ec2-user/.env` and run `docker compose -f docker-compose.prod.yml up -d api`.
  Or re-run the workflow on an older commit (ECR keeps each commit's image).
- **Run it on a laptop:** see `README.md`. Without AWS, the AI runs in mock mode.

## 6. Rules (security)
- Never commit `infra/config.env`, `infra/.state/` (DB password, SSH key), `backend/.env`, `test.py` or any keys.
- Use the AWS SSO profile (`aws sso login --profile deliverylens`; the profile name may differ on your laptop), never pasted access keys.
- Tests before a push:
  - backend: `cd backend && .venv/Scripts/python.exe -m pytest` (macOS/Linux: `.venv/bin/python`; needs Python 3.11);
    without a 3.11 install: `docker run --rm -v "$PWD":/repo -w /repo/backend python:3.11-slim sh -c "pip install -q -r requirements-dev.txt && python -m pytest -q"`;
  - frontend: `cd frontend && npx tsc -b --noEmit && npx vitest run`.

## 7. Open items
- [ ] Each person clicks **Confirm subscription** in the AWS alarm email (Sai, Dinesh, Sravan).
- [ ] Retake the screenshot `docs/guide-images/05-order-desk-same-day.png`, and rebuild the `.docx` files in `docs/downloads/` (needs pandoc).
- [ ] Optional: a sample WMS page with "Run the day" (pick lists per warehouse for today and tomorrow).
- [ ] Decide the weekly brief recipients, then run `bash infra/scripts/09-weekly-brief.sh`; each person confirms the AWS email.
- [ ] Brevo: to switch on now, set `EMAIL_BACKEND=brevo`, `BREVO_API_KEY`, a Brevo-verified `EMAIL_FROM_ADDRESS` and `EMAIL_TEST_RECIPIENTS` in the secret (keep test mode on first).
- [ ] Brevo SMTP (built, not switched on): rotate the SMTP key (the current one was shared in a chat), deploy this code, merge the SMTP fields with `infra/scripts/10-smtp-secret.py`, run `python -m app.email check` on the server, then `EMAIL_BACKEND=smtp` in test mode first. Steps in `docs/09-email-service.md` ("Switching production to Brevo SMTP").
- [ ] Brevo Authorised IPs: add the remaining office VPN addresses (5 rotate) and keep the EC2 address.
- [ ] After the hackathon: `bash infra/scripts/99-teardown.sh` to stop all costs.
- Repository: `origin` = `Evoke-Hackathon-2026/InfinityStacks` (the final hackathon repo).

## Change log
Newest first. One line per session: date, who, what changed.
- **2026-10-29, Sai M + Claude Code (17):** client address-confirmation links no longer hit the website login: the API serves the client page itself (`/c/confirm-address/{token}`, plain HTML, no script, strict headers; `backend/app/api/client_pages.py`), `PUBLIC_API_URL` set by `deploy.yml`, the Order desk "Open the client's one-click link" opens it. Order desk: a held or blocked order's envelope now stops at the step that held it. New screenshot `docs/guide-images/13-stock-routes.png`. Security audit report written: `docs/security/security-audit-2026-10-29.md` (+ findings JSON); still to do: revoke the Gemini key that was in the local `test.py`.
- **2026-10-29, Sai M + Claude Code (16):** How it works: new realistic delivery map (`components/DeliveryMap.tsx`) under the journey map. Two US maps (today vs with DeliveryLens), six real cases in a loop, camera zooms per case, trucks at the same speed so the longer or delayed trip arrives later, real per-cause numbers under the maps. Map outline generated once from us-atlas (US Census 2017, ISC licence) into `components/usMap.ts` (14 KB, no new dependency); warehouses sit at a typical spot in their region.
- **2026-10-29, Sai M + Claude Code (15):** removed the How it works "Watch one order" explainer (the team did not like it; the original journey map stays). The 08:00 clock on Late same-day orders now loops continuously while on screen (4 s story, 2.5 s hold), with no Replay button.
- **2026-10-29, Sai M + Claude Code (14):** animations for the demo (shared helpers `lib/motion.ts`, `components/TripArt.tsx`, `CountUp.tsx`; all off for reduced motion and instant in unit tests). How it works: new "Watch one order: today, and with DeliveryLens" explainer (`JourneyExplainer.tsx`) under the journey map, 7 stations on two roads, play/pause/step, ends 71 vs 90 in 100. Order desk: the run plays step by step (envelope, actor-colour light-up, stock and carrier truck trips, Decision card waits for the end; `DeskAnimation.tsx`). Why late: points-lost bars grow and count up. Late same-day orders: animated 08:00 clock (`CutoffClock.tsx`). What-if: numbers roll on slider change. Overview and At-risk clients: headline numbers count up. DESIGN.md motion rules updated.
- **2026-10-29, Sai M + Claude Code (13):** Stock & routes redesigned to read in about 30 seconds: title "Why some orders take the long way", three picture cards (nearest warehouse ran out / far warehouse picked anyway / driver left the planned road), each with a small animated trip map (warehouse and client buildings, trucks driving the right trip in teal and the long trip in orange; no animation with reduced motion), how often, 'out of every 100 orders: on time / late' for orders without vs with the problem, and the fix; a note explains 'late' and why teal trips are sometimes late too; the tables moved into "See the numbers". Sample data now includes the far-warehouse numbers. Deleted 2 local Claude save-point refs that contained `test.py` (never on GitHub).
- **2026-10-28, Sai M + Claude Code (12):** recorded that the website now has a login (Amplify basic auth, enabled in the AWS console, not in the repo); the API stays open. Checked live: API healthy, latest backend (own-email route, wrong-warehouse numbers) deployed.
- **2026-10-28, Sai M + Claude Code (11):** security audit (Cloudflare security-audit skill, quick profile, source only): no confirmed vulnerabilities; one lead fixed: `deploy.yml` now deploys only when the CI run was for a `push` in this repository (a pull request, even from a fork branch named `main`, also runs CI and could otherwise have triggered a deploy). Hardening ideas from the audit (pin Actions to SHAs, deploy `:sha` not `:latest`, expiring confirmation links, a brief send limit) are not done.
- **2026-10-28, Sai M + Claude Code (10):** checked a colleague's 6-finding review against the raw data. Added finding 4 to Stock & routes (`views.wrong_warehouse`, `/api/stock/placement` -> `wrong_warehouse`): 691 orders shipped from a far warehouse (about 1,246 vs 127 miles) although the nearest had stock, 51% vs 74% on time, $20,880 penalties; they explain all 213 late deliveries with none of the five causes; the Order desk warehouse rule already prevents it. Not added: 62% after 08:00 (only same-day orders are hurt, already covered), 450 delivered-before-collected (data error, all marked on time; 71.0% -> 70.7% without them), collection times outside 14:00-18:00 (no on-time difference), 24 of 34 complaints from at-risk clients (already shown).
- **2026-10-28, Sai M + Claude Code (9):** Order intake merged into the Order desk. New "Type your own" form on the desk (sender, received time, subject, body) calls `POST /api/desk/own-email`, which saves it as inbox message `U01` (no expected result; a new one replaces it; reset removes it; Run all skips it) and runs the same 10 steps. `/order-intake` now redirects to `/order-desk`; the page and its menu item are removed (the `/api/agents/order-intake` endpoint stays).
- **2026-10-28, dkarasu + Claude Code (5):** removed the Weekly Brief's 10-minute "Send now" cooldown (it blocked sending different weeks back to back, e.g. several testers in a demo). Duplicate protection stays: each week once a day (409 `already_sent`). First Brevo SMTP send from the app succeeded (test mode, 6 test recipients).
- **2026-10-28, dkarasu + Claude Code (4):** the email sender comes from the secret: the API reads `SMTP_FROM_EMAIL` from `deliverylens/app` at runtime (boto3, like the other SMTP fields; ignored if not a valid address); `EMAIL_FROM_ADDRESS` in the environment still wins. The SMTP fields were added to the secret (boto3, merged, verified); `EMAIL_BACKEND` stays `sns`.
- **2026-10-28, Sai M + Claude Code (8):** Ask page: 12 sample questions in 6 topics (big picture, causes, routing software decision, carriers, clients, complaints), each checked to route to the right data tool; a "What Ask can do" panel lists its abilities, its data sources (Halcyon dataset, 1 Apr to 25 Sep 2026) and what it cannot answer.
- **2026-10-28, Sai M + Claude Code (7):** Order desk inbox cut from 17 to 11 sample emails, one per scenario (removed M03, M04, M06, M07, M15, M16: near-duplicates; the same-day rules they showed are still unit-tested in `test_late_orders.py`). Each email has a plain scenario title and one-line meaning; inbox items show "N. scenario" first. Tests updated (backend, frontend, e2e counts). Auto-deploy now runs `python -m app.loader --if-empty` after restarting the API, so the live inbox follows `manifest.json` (this also resets the Order desk demo on every deploy).
- **2026-10-28, dkarasu + Claude Code (3):** email service, Stage 2 (not deployed yet; production stays on SNS).
  - New `smtp` backend (Brevo SMTP over STARTTLS/TLS only; retries for transient failures only, within ~40 s; never retried after the email's DATA was sent). `brevo` (HTTP API) kept.
  - Durable duplicate protection: new `email_sends` table; the Weekly Brief goes out once per reporting week per day (timer and "Send now" share the key); explicit resend by `--resend` on the server, or the API with a DEMO_TOKEN. No migration to run (created at start-up).
  - Provider errors are sanitised (class and code only, not chained); "Send now" answers 409 `already_sent` or 502 `email_not_sent`. `python -m app.email check` tests the SMTP login without sending.
  - Fixed the CI security scan (bandit B310 on the `brevo` backend's fixed https URL), which had stopped `a50c57c` and `0d5726e` from deploying.
  - A one-off SMTP test from a Mac reached two internal addresses through Brevo (sent outside the app).
  - SMTP credentials in production: the API reads the `SMTP_*` fields itself from `deliverylens/app` with boto3 and the EC2 instance role (`APP_SECRET_ID`, `app/runtime_secrets.py`); the deploy (workflow, 07, 09) keeps `SMTP_*` out of `app.env`, writes it owner-only through a temp file and adds `APP_SECRET_ID`. No IAM change needed (the role already has `GetSecretValue` on this secret only).
  - `infra/scripts/10-smtp-secret.py` (boto3) merges the SMTP fields from `backend/.env` into the secret: dry run by default, keeps every field, refuses a missing secret or the wrong account, verifies, prints key names only. `05-secrets-rds.sh` now merges instead of replacing the secret.
  - The API checks the secret's name, region and account (`APP_SECRET_ACCOUNT`, set by the deploy) before using it. `05` and `09` keep secret values off command lines and in owner-only temp files.
  - Tests no longer read a developer's `backend/.env`.
- **2026-10-28, Sai M + Claude Code (6):** Stock & routes page simplified for the demo: each problem shows "1 in N" plus two big numbers (on time with vs without the problem, "X in 100") and one short table of 3 numbers; dumbbell charts, gap and deliveries columns, the region table and the "no route record" column removed; clients list cut to 5.
- **2026-10-28, Sai M + Claude Code (5):** Vendor business case cut to 3 rows (the "perfectly" limit dropped) and 4 numbers per row: on time, penalties saved, cost, gain (penalties only), plus one takeaway line ("The software alone loses $160K a year; fixing our own work gains $818K and costs about 4x less").
- **2026-10-28, Sai M + Claude Code (4):** Vendor decision tab in plain words. The four options are now "Buy the routing software only", "Fix our own work only", "Fix all 5 problems (likely)" and "Fix all 5 problems perfectly", each with a one-line meaning in the business-case table. Same names on Overview, Simulator and help (backend scenario names unchanged).
- **2026-10-28, Sai M + Claude Code (3):** plain-language UI. Why-late table: "Deliveries hit", "On time when hit" and "Share of late" merged into one sentence ("N deliveries had this problem; only X in 100 arrived on time"); "Worth" renamed "On-time points lost". Option names on Overview, Vendor and Simulator: "Only buy the routing vendor", "Only fix our own processes", "Do all five fixes (expected)", "Best case, if every problem disappeared" (backend scenario names unchanged). Then merged with dkarasu's email service: new `brevo` backend (Brevo HTTP API, `BREVO_API_KEY`, test mode applies), the brief's text and HTML link to `/weekly-brief?week=...`, and the brief page shows a Formatted (HTML) / Plain text preview of `brief.html`. SNS stays the default.
- **2026-10-28, dkarasu + Claude Code (2):** email service, Stage 1 (not deployed yet).
  - New shared module `backend/app/email` (message, backends, `send_email()`, Jinja2 templates); see `docs/09-email-service.md`.
  - The Weekly Brief sends through it; delivery is still SNS by default (`EMAIL_BACKEND=sns`), same recipients, timer and cooldown.
  - The brief is now rendered from templates (HTML and plain text): the AI writes only the headline and commentary; tables and figures come from the data. SNS sends the plain-text version.
  - Config for test mode, per-environment recipient lists and future SMTP added; no credentials. Brevo SMTP is Stage 2.
- **2026-10-28, Sai M + Claude Code (2):**
  - Carrier penalty recovery: claim packs and claim letters per carrier (new Carrier Claims Agent).
  - Morning risk board: pick-list late risk from history, fixes and risk after them, a backtest, and the 08:00 huddle note (new Morning Note Agent).
  - Weekly brief set up on AWS for Sai, Dinesh and Sravan (script 09).
- **2026-10-28, Sai M + Claude Code:**
  - Missing addresses filled from the client's delivery history, confirmed with one click or a one-line reply (new Reply Reader Agent).
  - Save plans for the 9 at-risk clients (new Account Save Agent).
  - Weekly one-page brief for the COO and CFO (new Weekly Brief Agent), sent by SNS every Monday.
  - New number guardrail on AI-written text.
  - Auto-deploy now also refreshes the server settings from Secrets Manager.
  - Tests: backend all pass (17 new); frontend 64 pass.
- **2026-10-28, dkarasu + Claude Code:**
  - Auto-deploy fixed: GitHub's OIDC sign-in was refused (it sends an ID-based subject); the deploy role now trusts both forms.
  - First automated deploy of `9a2ba80` succeeded: image in ECR, API restarted via Systems Manager, website job 2 on Amplify.
    Checked live: health ok, 48,340 deliveries, CORS, Ask on Bedrock names carrier D with $209,880 penalties.
  - Old server-built image kept as `deliverylens-api:pre-cicd` for rollback. `01-iam.sh` now re-applies the trust policy.
- **2026-10-27, Sai M + Claude Code:**
  - Bedrock models activated, and all features tested live.
  - Ask now names the worst carrier with its penalties.
  - Auto-deploy on push to `main` (ECR + Systems Manager + Amplify, no secrets).
  - Alarm emails to 3 people.
  - Added this file and the `CLAUDE.md` rule to keep it updated.
- **2026-10-27, Sai M + Claude Code:** deployed to AWS: EC2, RDS, Amplify, Bedrock, CloudWatch, Secrets Manager, S3, ECR, IAM.
- **2026-10-27, Sai M + Claude Code:** added the late same-day order rules, human approval before the WMS, recovery plans and complaint search in Ask.
- **Earlier:** data analysis, the 13-screen app, AI agents, docs, design system, launch video.
