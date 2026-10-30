# Scorecard evidence map (for the jury)

**Halcyon DeliveryLens** · EvoHack 2026 · Team InfinityStacks (Sravan Kumar D, Sai M, Dinesh K) · Problem 2.

One row per scorecard line: what to open, the evidence, and our honest status.
✅ = we believe it meets "Excellent", with evidence. ⚠️ = partly done; what is missing is written.

**Live:** website https://main.d19tzovsk3zuvo.amplifyapp.com (login: ask the team) ·
API https://35-175-32-49.sslip.io/api/health · API docs https://35-175-32-49.sslip.io/docs

**Demo video:** SharePoint [Infinity Stacks folder][sharepoint-video] · full narrated film in the repo: [demo-video/DeliveryLens-demo-full.mp4](../demo-video/DeliveryLens-demo-full.mp4) (6:37) · short teaser [DeliveryLens-demo.mp4](../demo-video/DeliveryLens-demo.mp4) (2:36) · **Deck:** [deck/DeliveryLens-pitch.pptx](../deck/DeliveryLens-pitch.pptx)

## 1. Problem and scope

| Row | Open this | Evidence | Status |
|---|---|---|---|
| **1.1 Problem understanding** (5) | [10 Discovery, section 1](10-discovery-and-requirements.md#1-problem-statement-one-page) | One-page problem statement: users and pains, business reason, sponsor input (Swarna, business owner), **baseline numbers**: 71.0% on time, 14,019 late deliveries and $872,460 penalties in 6 months, 64% of customer success time on complaints, 44.4 h a week typing email orders | ✅ |
| **1.2 Requirements, scope, traceability** (10) | [10 Discovery, sections 2-7](10-discovery-and-requirements.md#2-functional-requirements) | 20 functional + 10 non-functional requirements with IDs, each linked to the feature and a test; 7 assumptions; constraints; **explicit out-of-scope list**; **30 edge cases, each linked to the test that handles it** (all 58 cited test names checked to exist) | ✅ |

## 2. The working product

| Row | Open this | Evidence | Status |
|---|---|---|---|
| **2.1 End-to-end flow** (10) | The live website → **Order desk** → Run all 11; [user guide section 3](08-user-guide.md#3-order-desk-live-emails-in-warehouse-orders-out) | 11 sample emails, each gets its expected decision (`test_every_sample_email_meets_its_expected_decision_under_mock`). **Unseen input on the spot:** Order desk → **Type your own** → paste any email ([how-to](08-user-guide.md#try-your-own-email-type-your-own)). **Large input:** a 7,900-character email is accepted, "Run all" in one call, 10x the dataset loaded with `--data-dir` ([bad-inputs L01-L04](../evidence/bad-inputs.md), [scalability](../evidence/scalability.md)). No file upload in the website: a new dataset is loaded with `python -m app.loader --data-dir PATH` | ✅ app; ⚠️ the unedited recording is the demo video (link to add) |
| **2.2 Stability, errors, edge cases** (7) | [evidence/bad-inputs.md](../evidence/bad-inputs.md) | 33 inputs: empty, blank, missing field, malformed JSON, wrong types, oversized, injection, large. **0 server errors**, every answer readable. One gap found today (blank text reached the AI) and fixed with a test. API down → website keeps working on sample data ([screenshot](../evidence/e2e-screenshots/10-api-down-sample-data.png)) | ✅ |
| **2.3 UI and output quality** (5) | Website **How it works** (landing page); the **"What am I looking at?"** panel on every page; [user guide](08-user-guide.md) (annotated screenshots of every screen) | Labels, units and a one-line summary on every result; plain language rules in [DESIGN.md](../DESIGN.md); [screenshots](guide-images/) | ✅; ⚠️ no recorded usability test with a new user; one guide screenshot (05) to retake |

## 3. Engineering

| Row | Open this | Evidence | Status |
|---|---|---|---|
| **3.1 README and setup** (3) | [README](../README.md#run-it-on-a-laptop), [troubleshooting](../README.md#troubleshooting) | Prerequisites, config (`backend/.env.example`, `frontend/.env.example`, `infra/config.env.example`), run steps, sample input (11 emails, `backend/sample_emails/`). **Verified on a clean clone** on 2026-10-29: [evidence/clean-machine-setup.md](../evidence/clean-machine-setup.md); the 2 problems found are now troubleshooting tips | ✅ |
| **3.2 Agent instruction files** (4) | [.claude/agents/dev-agent.md](../.claude/agents/dev-agent.md), [devops-agent.md](../.claude/agents/devops-agent.md), [qa-agent.md](../.claude/agents/qa-agent.md) | Role, scope, inputs, outputs, guardrails per agent, and links to the real outputs: [ai-logs/](../ai-logs/INDEX.md) (9 session logs), commits, `.github/workflows/`, [evidence/](../evidence/README.md). How we work: [07](07-how-we-work-with-ai-agents.md) | ✅ |
| **3.3 Architecture and design choices** (4) | [04 Solution and architecture](04-solution-and-architecture.md), [11 Decision log](11-architecture-decisions.md) | C4 context and container diagrams, AWS diagram, data flow, agent sequence; tech stack; 13 decisions with options and trade-offs (FastAPI, React/Vite, Bedrock + Gemini + mock, EC2 vs Lambda/ECS, Caddy, RDS vs SQLite, CLI scripts vs CDK, OIDC, SNS vs SES, in-memory analytics, rules decide / AI reads) | ✅ |
| **3.4 Code quality** (4) | `backend/app/` (api, analytics, agents, desk, email), `frontend/src/` (pages, components, lib, api) | Modules by job. **Config-driven:** every setting read in `backend/app/config.py` from the environment. **Scan on 2026-10-29** of all tracked files: no secret ([security-scan.txt](../evidence/security-scan.txt)); no hard-coded local path in `backend/app`, `frontend/src`, `infra`, `.github`; the only fixed URL in app code is the Brevo API endpoint (`app/email/backends.py`); deploy targets (account, instance, URLs) are kept in one `env:` block at the top of `deploy.yml`. bandit: 0 medium/high | ✅ |

## 4. Business value

| Row | Open this | Evidence | Status |
|---|---|---|---|
| **4.1 Measured business benefit** (5) | [14 Business benefit, section 1](14-business-benefit-and-innovation.md#1-the-sponsors-kpi-on-time-delivery-and-the-money) | Sponsor KPI before/after with method: **71.0% → 90.2%** (realistic), **$1.44M a year net** ($806K on penalties only), vs the **$680K** routing tool (80.2%, -$160K on penalties). Benchmark 94% needs each fix to work about 84%. Hold-out test. CI re-checks the numbers | ✅; the gains are model estimates, a pilot would measure them ([12](12-scalability-and-roadmap.md#2-honest-limitations-today)) |
| **4.2 Scalability and reusability** (5) | [evidence/scalability.md](../evidence/scalability.md) | **Measured** at 48,340 and 483,400 deliveries (load, first request, memory, 11 endpoints). What breaks at 10x (memory, cold start) and how to fix it. Reuse for another client by settings only; the x10 run itself used `--data-dir` | ✅ |
| **5.1 Innovation** (10) | [14 Business benefit, section 2](14-business-benefit-and-innovation.md#2-each-innovation-before-after-evidence) | 9 innovations with before/after and evidence: grace rule (729 late deliveries avoided a year), address from history, morning risk board (63% vs 29%, AUC 0.81 on unseen months), carrier penalty recovery ($261,900 in 6 months), AI reads / rules decide, vendor decision. Section 3: the pattern solves a class of problems | ✅ |

## 5. Presentation

| Row | Open this | Status |
|---|---|---|
| **6.1 Demo video** (5) | [demo-video/DeliveryLens-demo-full.mp4](../demo-video/DeliveryLens-demo-full.mp4) (6:37, narrated, subtitled, real app; teaser [DeliveryLens-demo.mp4](../demo-video/DeliveryLens-demo.mp4) 2:36); script [narration.md](../demo-video/narration.md); storyboard [video-plan.md](../demo-video/video-plan.md) | ✅ Real running app, main flow end to end (email in → 10 steps → a person approves → WMS), held order + client one-click page (3:41); **bad input shown at 5:30** (teaser: 1:57): a prompt-injection email is blocked at the safety screen and an unclear order goes to a person, with the result explained on screen. SharePoint: [Infinity Stacks folder][sharepoint-video] |
| **6.2 Story and business value** (5) | [deck/DeliveryLens-pitch.pptx](../deck/DeliveryLens-pitch.pptx), [03 What the data says](03-what-the-data-says.md) | ✅ 15 slides, one idea each, with speaker notes: problem (71% vs 94%, $680K tool), five causes, features, AI safety, AWS, before/after with method (71.0 → 90.2%, $1.44M), limits and 10x roadmap |
| **6.3 Clarity** (3) | Same deck; [00 Start here](00-START-HERE.md) | ✅ Short headlines, one visual per slide, same colours as the app (orange = problem, teal = fix) |

## 6. Delivery and operations

| Row | Open this | Evidence | Status |
|---|---|---|---|
| **7.1 Deployment and DevOps** (5) | [13 Environments, sections 1-2](13-environments-and-security.md), `.github/workflows/`, `infra/scripts/` | Live URLs above. CI on every push (SQLite + PostgreSQL 16 + frontend + numbers + scans); deploy on `main` with OIDC, ECR, SSM, Amplify, health check. Separate config for dev (`.env` files), test (CI), prod (Secrets Manager + Amplify). From scratch: scripts 00-09, teardown 99 | ✅; the from-scratch AWS scripts are run by a person (on purpose: no agent changes AWS) |
| **7.2 Testing and QA** (4) | [evidence/README.md](../evidence/README.md) | Backend **387 passed, 1 skipped** (2026-10-29, [backend-tests.txt](../evidence/backend-tests.txt)); frontend **60 of 60, 0 type errors** ([frontend-tests.txt](../evidence/frontend-tests.txt)); browser e2e 22 of 22 (and 30 of 30 after round 3), 190 repeated runs 0 flaky ([e2e-results.txt](../evidence/e2e-results.txt)); edge cases E01-E30 and the 11 sample emails all tested; QA agent output in [qa-agent.md](../.claude/agents/qa-agent.md) | ✅; ⚠️ Playwright cannot run on the team's Windows laptops, so the e2e evidence is from 23 Oct |
| **7.3 Security** (3) | [13 Environments, section 3](13-environments-and-security.md#3-security-model), [security audit](security/security-audit-2026-10-29.md), [security-scan.txt](../evidence/security-scan.txt) | Secrets scan clean; credentials in Secrets Manager, no AWS keys (instance role, GitHub OIDC); least-privilege IAM in `infra/policies/`; website login; API rate limit and optional `X-Demo-Token`; private encrypted RDS; known gaps listed | ✅; ⚠️ human action: revoke the old Gemini key from the local `test.py` |
| **7.4 Gaps and roadmap** (3) | [12 Scalability and roadmap](12-scalability-and-roadmap.md) | 9 honest limitations; 9-step prioritised roadmap including 10x load (pre-aggregation, ECS, shared rate limit, SQS) | ✅ |

## Submission checklist (pass / fail)

| # | Item | Where | Status |
|---|---|---|---|
| 1 | Source code + README with setup and run steps | This repo; [README](../README.md) | ✅ |
| 2 | Discovery document (Markdown): problem, users, requirements, scope | [10 Discovery and requirements](10-discovery-and-requirements.md) (+ [02](02-the-problem.md), [03](03-what-the-data-says.md)) | ✅ |
| 3 | Agent instruction files (Markdown) for Dev, DevOps and QA agents in `.claude/` | [dev-agent.md](../.claude/agents/dev-agent.md), [devops-agent.md](../.claude/agents/devops-agent.md), [qa-agent.md](../.claude/agents/qa-agent.md) | ✅ |
| 4 | Demo video linked in the README | README "For the jury" | ✅ SharePoint link in the README |
| 5 | Slides (optional) | [deck/DeliveryLens-pitch.pptx](../deck/DeliveryLens-pitch.pptx) | ✅ (optional) |

[sharepoint-video]: https://evokemail.sharepoint.com/:f:/r/sites/LearningandDevelopmentTeam2/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FLearningandDevelopmentTeam2%2FShared%20Documents%2FHackathon%202026%2FProblem%20Statement%202%2FInfinity%20Stacks&p=true&share=cgq678yscdAtRrTilZlSXpIUEgUCWQi868GNb9yfX%2DkVSP%2Ds6Q
