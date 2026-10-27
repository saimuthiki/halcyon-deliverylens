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

**Decisions to keep:**
- The company's pick procedure must not change, so there is no extra 11:00 pick wave.
- Colours (see `DESIGN.md`): orange = problem, teal = fix, purple = AI only.

## 4. AWS setup (account Infinity Stacks 781547812451, region us-east-1)
**Created with the AWS CLI scripts in `infra/scripts/` (not CDK).** Run them in order, 00 to 08. `99-teardown.sh` deletes everything.

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
| Systems Manager | the EC2 server is a managed node | Used by the auto-deploy instead of SSH |
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
- [ ] After the hackathon: `bash infra/scripts/99-teardown.sh` to stop all costs.
- Repository: `origin` = `Evoke-Hackathon-2026/InfinityStacks` (the final hackathon repo).

## Change log
Newest first. One line per session: date, who, what changed.
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
