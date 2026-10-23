# Halcyon DeliveryLens

**EvoHack 2026 · Team InfinityStacks** (Sravan Kumar D · Sai M · Dinesh K) · Problem 2: late deliveries at Halcyon Logistics

> **In one line:** DeliveryLens finds *why* deliveries are late, *fixes* each cause with AI agents
> (Claude on Amazon Bedrock) and simple rules, and *proves* how much on-time delivery improves.

## The answer in one picture

```mermaid
xychart-beta
  title "On-time delivery: today vs each option"
  x-axis ["Today", "Routing vendor only", "3 process fixes", "All 5 (realistic)", "All 5 (ceiling)", "Benchmark"]
  y-axis "On-time %" 0 --> 100
  bar [71.0, 80.2, 86.7, 90.2, 99.0, 94.0]
```

**What this shows:** Halcyon's leaders were about to spend **$680K on routing software**. The
data shows routing explains only a small part of the lateness:

| Option | On-time delivery | Net benefit per year |
|---|---|---|
| Today | 71% | – |
| Buy the routing tool alone (best case) | about 80% | about $0.15M (negative on penalties alone) |
| Fix the five causes, realistic case | about **90%** | about **$1.4M** |
| Fix the five causes completely (ceiling) | about 99% | about $2.2M |

The five causes: weak carrier on a lane (Carrier D everywhere, E and F on some lanes), incomplete
addresses, same-day orders after the 08:00 cutoff, stock not at the nearest warehouse, and route
deviation. Reaching the 94% benchmark needs each fix to work about 84% of the time. Costs and
effectiveness are our stated estimates.

Details: [docs/03-what-the-data-says.md](docs/03-what-the-data-says.md).

## Read the documents in this order

**New here? Start with [docs/00-START-HERE.md](docs/00-START-HERE.md)**, then the screen-by-screen
[user guide](docs/08-user-guide.md) (annotated screenshots of every page).

| # | Document | What it covers |
|---|---|---|
| 0 | [Start here](docs/00-START-HERE.md) | The problem, the five causes, where the AI is, how to run it with Gemini |
| 1 | [What the judges want](docs/01-what-the-judges-want.md) | Deadlines, the pass/fail checklist, how the 100 points are split |
| 2 | [The problem](docs/02-the-problem.md) | Halcyon's story, how an order travels, what the stakeholder said, our questions |
| 3 | [What the data says](docs/03-what-the-data-says.md) | The five causes, carrier lanes, the 08:00 cutoff, money, data quality |
| 4 | [Solution and architecture](docs/04-solution-and-architecture.md) | What we build, the C4 diagrams, where each AWS service is used and when |
| 5 | [The plan to 29 Oct](docs/05-five-day-plan.md) | Gantt chart, who does what, day-by-day tasks |
| 6 | [AWS setup guide](docs/06-aws-setup-guide.md) | Step-by-step scripts for Monday; placeholders to fill |
| 7 | [How we work with AI agents](docs/07-how-we-work-with-ai-agents.md) | The agent pipeline across roles, and where the proof lives |
| 8 | [User guide](docs/08-user-guide.md) | Every screen, every button, every number, the 12 sample emails, blockers |

Word versions of every document are in [`docs/downloads/`](docs/downloads/).

## Repository map

```mermaid
flowchart LR
  R["halcyon-deliverylens/"] --> D["data/halcyon-dataset<br/>the stakeholder's dataset"]
  R --> AN["analysis/<br/>root-cause script + findings"]
  R --> DOC["docs/<br/>7 guides + reference files"]
  R --> BE["backend/<br/>FastAPI: analytics + AI agents"]
  R --> FE["frontend/<br/>React app (13 screens)"]
  R --> IN["infra/<br/>AWS scripts, Caddy, compose"]
  R --> GH[".github/workflows/<br/>CI + deploy"]
  R --> AI["ai-logs/<br/>AI usage evidence"]
  R --> CL[".claude/ + tools/<br/>skills and agents"]
```

**What this shows:** where everything lives.
- `data/`: the original data, unchanged.
- `analysis/`: how we found the causes.
- `backend/` and `frontend/`: the app.
- `infra/`: how it goes onto AWS.
- `docs/`: the explanations.
- `ai-logs/`: proof of how we used AI agents.

## Run it on a laptop

Python 3.11+, Node 20 and Docker are needed for the full stack. The app works without AWS:
the AI agents run in **mock mode** (canned answers) by default. For real, dynamic AI answers on a
laptop, put a Google Gemini key in `backend/.env` (`LLM_PROVIDER=gemini`, `GEMINI_API_KEY=...`);
see [docs/00-START-HERE.md](docs/00-START-HERE.md#4-run-it-on-your-laptop-with-gemini-real-ai-answers).
On AWS the same agents use Claude on Amazon Bedrock.

```bash
# 1. Re-run the analysis (needs only pandas)
python analysis/root_cause_analysis.py

# 2. Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.loader            # loads the dataset + 12 sample emails into SQLite
uvicorn app.main:app --reload   # http://localhost:8000/api/docs

# 3. Frontend (new terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Or run everything at once with Docker: `docker compose up --build`, then open http://localhost:5173.

## AWS (from Monday 26 Oct)

Uses only the services the team requested: **Bedrock, IAM, S3, ECR, Secrets Manager, RDS
PostgreSQL, CloudWatch, Amplify, EC2**. See [docs/06-aws-setup-guide.md](docs/06-aws-setup-guide.md).

## Deliverables checklist (due 29 Oct)

- [x] Discovery questions asked (round 2 sent 23 Oct); [ ] answers recorded and applied (due Mon 26 Oct)
- [x] Agent pipeline across roles ([ai-logs/](ai-logs/INDEX.md))
- [x] AI inside the product (Order Intake, Client Reply, Delay Alert, Ask DeliveryLens agents; live Order desk); mock or Gemini locally, Bedrock from Monday
- [x] Usable UI and working backend; tests: backend 148, frontend 27, browser E2E 30 ([evidence/](evidence/README.md))
- [ ] Deployed on AWS (Monday 26 Oct, once access arrives)
- [ ] Evidence pack and final AI logs (Wed 28 Oct)
