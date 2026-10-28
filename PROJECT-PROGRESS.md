# Project progress: Halcyon DeliveryLens (EvoHack 2026, Team InfinityStacks)

> **Rule for every team member and every AI session (Claude Code or any other agent):**
> 1. **Read this file first**, before you change anything. It is the shared context for the whole hackathon.
> 2. **Update it at the end of every session** in which something changed: features, fixes, AWS resources,
>    decisions, blockers. Add a dated line to the [Change log](#change-log) and fix any section that is now wrong.
> 3. Commit it with your changes, so the next person who pulls gets the current state.
> 4. Never put secrets here (keys, passwords, `.pem` contents, `.env` values).

Last updated: 2026-10-28 by dkarasu (with Claude Code).

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

These links are open to everyone on purpose (hackathon demo), with no login.

## 3. Features built (all live and tested on AWS)
| Feature | Where (frontend page / backend) | Status |
|---|---|---|
| Overview, why late, carriers, clients, stock and routes, vendor check | `frontend/src/pages/*`, `backend/app/analytics` | ✅ Live |
| What-if simulator (fix the causes, see the on-time %) | `Simulator.tsx`, `POST /api/simulate` | ✅ Live |
| **Order desk:** AI reads 17 order emails in 10 steps, guardrails, a person approves before the WMS | `OrderDesk.tsx`, `backend/app/desk/pipeline.py` | ✅ Live: all 17 emails give the expected result |
| **Late same-day orders:** before 08:00 → today; 08:00–09:00 grace → today; 09:00–10:00 only urgent (valid reason, or "urgent" from a priority client) → today; after 10:00 → tomorrow | `LateOrders.tsx`, `backend/app/analytics/late_orders.py`, env `SAME_DAY_GRACE_UNTIL` / `SAME_DAY_HARD_STOP` | ✅ Live (729 late deliveries avoided a year, $43K SLA) |
| Delay alert: AI drafts the client message plus a recovery plan | `backend/app/agents/delay_alert.py` | ✅ Live |
| Ask: questions in plain English over the data and complaints | `Ask.tsx`, `backend/app/agents/ask.py` | ✅ Live |
| Activity: every AI call logged (tokens, latency, guardrail flags) | `Activity.tsx`, `GET /api/agents/runs` | ✅ Live |
| **Missing address filled from history:** when an email leaves out a postcode or street, the Order desk finds the one past delivery site that matches what the email did give, and asks the client to confirm it with a one-click link or a one-line reply ("Yes"). The Reply Reader Agent reads replies; a corrected detail is used only if it appears in the reply word for word. Nothing ships until the client confirms. | `backend/app/desk/address_book.py`, `data/sample-inbox/address-book.csv` (stands in for the WMS ship-to history), `components/AddressConfirmCard.tsx`, client page `/confirm-address/:token`, `POST /api/desk/confirm/{token}`, `POST /api/desk/reply/{message_id}` | ✅ Built and tested locally; ⏳ live after the next deploy |
| **Save plans for the 9 at-risk clients ($14.2M):** the Account Save Agent writes a summary for the account owner, talking points, a meeting agenda and an email to the client, from that client's own deliveries, causes, penalties and complaints, with their projected on-time rate after the fixes | `backend/app/agents/account_plan.py`, "Save plan" button on At-risk clients (`components/SavePlanDrawer.tsx`), `POST /api/agents/account-plan` | ✅ Built and tested locally; ⏳ live after the next deploy |
| **Carrier penalty recovery:** finds the SLA penalties Halcyon paid where the carrier alone was at fault (handed over on time, complete address, stock at the nearest warehouse, and a weak lane or a route well beyond plan): **$261,900 in six months, $128,700 from Carrier D**. Shared-fault deliveries are not claimed. The Carrier Claims Agent drafts a claim letter per carrier (or per month), with the evidence list as a CSV. Assumption: the carrier contracts allow passing on penalties; confirm with Halcyon. | `backend/app/agents/carrier_claims.py`, Carriers page → "Recover penalties the carriers caused" (`components/PenaltyClaims.tsx`), `GET /api/carriers/claims`, `POST /api/agents/carrier-claim` | ✅ Built and tested locally |
| **Morning risk board:** at 08:00 every shipment on the pick list gets a late risk = how often past deliveries with the same pre-ship problems (address, same-day after 08:00, stock elsewhere, weak lane) and promise type were late, using only deliveries delivered before that morning. The riskiest are listed first with the fixes still possible (confirm the address, switch carrier) and the risk after them. Backtest on Aug-Sep (never seen): 63% of the daily top 20 were really late vs 29% overall, AUC 0.81. No AI in the score; the Morning Note Agent writes the 08:00 huddle message. | `backend/app/analytics/risk_board.py`, `backend/app/agents/morning_note.py`, page `/risk-board`, `GET /api/risk-board`, `GET /api/risk-board/backtest`, `POST /api/agents/morning-note` | ✅ Built and tested locally |
| **Weekly brief for the COO and CFO:** a one-page Monday email: on time against last week and the 94% target, the money lost, the at-risk clients, why deliveries were late, three actions with owners | `backend/app/agents/weekly_brief.py`, page `/weekly-brief`, `POST /api/agents/weekly-brief`, `POST /api/briefs/weekly/send`; sent by Amazon SNS every Monday 07:00 US Central (`infra/scripts/09-weekly-brief.sh`) | ✅ Built and tested locally; ⏳ AWS setup (script 09) waits for the recipient list |

**Decisions to keep:**
- The company's pick procedure must not change, so there is no extra 11:00 pick wave.
- **Number guardrail** (`app/guardrails.py: unverified_numbers`): every number an AI writes in a save plan or weekly brief must come from the facts it was given; otherwise the template is used and the reason is flagged.
- The weekly brief goes by **Amazon SNS, not SES**: evoketechnologies.com has a DMARC `p=reject` policy, so email sent for that domain by another service would be rejected. With a domain we control, switch to SES.
- The brief's recipients are set on the server (SNS subscriptions), never taken from a web request, and "Send now" is limited to once every 10 minutes.
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
- [ ] Brevo SMTP (Stage 2): a verified sender that passes Brevo's checks (see `docs/09-email-service.md`), the SMTP key in Secrets Manager, then the SMTP backend in test mode.
- [ ] After the hackathon: `bash infra/scripts/99-teardown.sh` to stop all costs.
- Repository: `origin` = `Evoke-Hackathon-2026/InfinityStacks` (the final hackathon repo).

## Change log
Newest first. One line per session: date, who, what changed.
- **2026-10-28, Sai M + Claude Code (3):** plain-language UI. Why-late table: "Deliveries hit", "On time when hit" and "Share of late" merged into one sentence ("N deliveries had this problem; only X in 100 arrived on time"); "Worth" renamed "On-time points lost". Option names on Overview, Vendor and Simulator: "Only buy the routing vendor", "Only fix our own processes", "Do all five fixes (expected)", "Best case, if every problem disappeared" (backend scenario names unchanged). A Brevo HTML-brief version is kept on local branch `brevo-html-brief`, not merged, because dkarasu's email service now owns sending.
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
