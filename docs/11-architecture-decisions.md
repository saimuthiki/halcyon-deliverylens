# 11. Architecture decision log

The diagrams and the tech stack are in [04 Solution and architecture](04-solution-and-architecture.md) (C4 context,
containers, AWS services, data flow, agent sequence). This page records **why** each big choice was made: the
options we looked at, what we chose, and what it costs us. Short form of an ADR (architecture decision record).

## Tech stack in one table

| Layer | Choice | Version / size |
|---|---|---|
| Website | React + TypeScript, Vite, Tailwind, Recharts | React Router 6.30.6 |
| API | Python FastAPI, pandas, SQLAlchemy, Pydantic | Python 3.11 in Docker (3.12 also works locally) |
| Database | PostgreSQL 16 on Amazon RDS (db.t4g.micro); SQLite on a laptop | 48,340 deliveries |
| AI | Claude Haiku and Sonnet on Amazon Bedrock; Gemini or mock on a laptop | provider set by `LLM_PROVIDER` |
| Hosting | API: Docker on one EC2 t3.small with Caddy for HTTPS. Website: AWS Amplify | |
| CI/CD | GitHub Actions: CI on every push and PR; deploy on `main` with OIDC | `.github/workflows/ci.yml`, `deploy.yml` |
| Infra as code | Bash + AWS CLI scripts, run in order 00 to 10, plus a teardown | `infra/scripts/` |
| Monitoring | CloudWatch logs, dashboard, 3 alarms; every AI call in the `agent_runs` table | `infra/scripts/08-cloudwatch.sh` |

## Decisions

### ADR-01. Rules and data decide; AI only reads and writes text
- **Context:** the client must trust the numbers, and a language model can be talked into things ("URGENT!!!").
- **Options:** (a) let an AI agent decide end to end; (b) AI for reading and writing, code for every number and
  decision; (c) no AI at all.
- **Decision:** (b). The AI extracts fields, reads urgency (with a quote), and drafts messages. Code checks the
  quote, applies the cutoff rule, picks the warehouse and carrier, and computes every KPI. A person approves.
- **Trade-off:** less "magic" and more code to write. In return every number is repeatable (CI re-checks
  71.0 / 90.2 / 99.0) and every AI output is checked (number guardrail, quote check, injection check).

### ADR-02. FastAPI (Python) for the API
- **Options:** FastAPI; Node/Express; Django.
- **Decision:** FastAPI. The analysis is already in pandas, so the API reuses the same maths. Pydantic gives input
  validation and readable 422 errors for free (see [evidence/bad-inputs.md](../evidence/bad-inputs.md)), and
  `/docs` documents the API.
- **Trade-off:** two languages in the repo (Python and TypeScript).

### ADR-03. React + Vite single-page app on Amplify
- **Options:** Next.js (server rendering); a Python dashboard (Streamlit/Dash); React + Vite.
- **Decision:** React + Vite, a static build hosted on Amplify. No server needed for the website; Amplify gives
  HTTPS and basic auth.
- **Trade-off:** no server rendering (not needed for an internal tool). Streamlit would have been faster to start
  but cannot give the Order desk animation and the guided, plain-language UI.

### ADR-04. Amazon Bedrock (Claude) in production; Gemini and mock locally
- **Options:** OpenAI API; Bedrock; one provider only.
- **Decision:** one `LLMClient` with three providers. **Bedrock** on AWS: data stays in the AWS account, no API key
  (IAM role), pay per call. **Gemini** on a laptop for real answers without AWS. **Mock** (canned, deterministic) for
  tests, CI and offline demos.
- **Trade-off:** three code paths to test. Covered by `test_llm_client.py` and `test_gemini.py`. Fast model
  (Haiku) for reading emails, smart model (Sonnet) for writing plans and briefs, to keep cost low.

### ADR-05. One EC2 server with Docker, not Lambda or ECS
- **Options:** AWS Lambda + API Gateway; ECS Fargate; EC2 + Docker.
- **Decision:** EC2 + Docker Compose (API + Caddy). It was in the list of services the team requested; the same
  image runs on a laptop and in AWS; the API keeps the dataset in memory, which suits a long-running process.
- **Why not Lambda:** a cold start loads and tags 48,340 rows (about 1.8 s, see
  [evidence/scalability.md](../evidence/scalability.md)) on every new instance, and pandas makes the package large.
- **Why not ECS:** more setup (load balancer, task roles) for one container; not in the requested list.
- **Trade-off:** one server is a single point of failure, and scaling is manual. Mitigated by Docker health checks,
  `restart: always`, CloudWatch alarms and a rollback image. ECS Fargate is the first step in the
  [roadmap](12-scalability-and-roadmap.md).

### ADR-06. Caddy and sslip.io for HTTPS
- **Context:** the website is HTTPS, and browsers block an HTTPS page from calling a plain HTTP API.
- **Options:** buy a domain + load balancer + ACM certificate; CloudFront in front of EC2; Caddy on the server.
- **Decision:** Caddy with an automatic Let's Encrypt certificate for `<ip-with-dashes>.sslip.io`. No domain needed.
- **Trade-off:** depends on the sslip.io DNS service. With a real domain, switch to it in `infra/Caddyfile`.

### ADR-07. PostgreSQL on RDS in AWS; SQLite on a laptop
- **Options:** DynamoDB; Aurora; RDS PostgreSQL; SQLite everywhere.
- **Decision:** RDS PostgreSQL (private, encrypted, small) in AWS; SQLite locally so the app runs with no setup.
  SQLAlchemy hides the difference. CI runs the whole test suite on **both** databases.
- **Trade-off:** two databases to keep compatible; dialect differences have their own tests (for example
  `test_order_desk.py::test_add_column_sql_per_dialect`).

### ADR-08. AWS CLI scripts instead of CDK or Terraform
- **Options:** CDK; Terraform; CloudFormation; numbered CLI scripts.
- **Decision:** numbered, re-runnable Bash scripts (`00-check-access.sh` to `10-smtp-secret.py`, `99-teardown.sh`).
  The team was new to AWS; each script maps to one console page and can be read line by line.
- **Trade-off:** no drift detection or plan/preview. The scripts check "exists already?" before creating, so they
  can be re-run. Moving to CDK is on the roadmap.

### ADR-09. GitHub Actions with OIDC, deploy through Systems Manager
- **Options:** stored AWS keys in GitHub secrets + SSH; OIDC + SSM.
- **Decision:** OIDC (no stored keys) and SSM Run Command (no open SSH port). Only a CI-passed push to `main` of this
  repository deploys (fixed after the security audit, commit `4ec0d3b`).
- **Trade-off:** more IAM setup once (`infra/policies/github-trust.json`, `github-deploy-policy.json`).

### ADR-10. Amazon SNS for the weekly brief, not SES
- **Context:** evoketechnologies.com has DMARC `p=reject`, so mail sent for it by another service is rejected.
- **Decision:** SNS email subscriptions now; a shared email module (`app/email`) with SMTP/Brevo back ends ready
  for a domain the client controls. See [09 Email service](09-email-service.md).
- **Trade-off:** SNS sends plain text only.

### ADR-11. In-memory analytics with a cache
- **Options:** compute every request in SQL; pre-aggregate tables; load once into pandas and cache.
- **Decision:** load once, cache in the process. Every analytics call is under 0.1 s on today's data.
- **Trade-off:** memory grows with the data (75 MB today, 750 MB at 10x). The fix at scale is pre-aggregation in
  PostgreSQL ([evidence/scalability.md](../evidence/scalability.md)).

### ADR-12. Complaint search with plain filters, no vector database
- 34 short complaints in 4 fixed categories: a filter and a join to the delivery data are exact and explainable.
  A vector store would add a service and fuzzy matches for no gain. Revisit if free-text complaints grow to thousands.

### ADR-13. A person approves before the WMS; clients confirm suggested addresses
- The step that commits stock and a truck stays with a person. An address filled from history is only a suggestion
  until the client confirms it. Slower than full automation, but no wrong order ships because the AI guessed.
