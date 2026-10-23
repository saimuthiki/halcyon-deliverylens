# AI usage log index

One row per AI agent session. Required deliverable: "AI usage logs, agent logs in your repo" (due 29 Oct).

| Date | Role | Agent / skills | Task | Output | Human reviewer |
|---|---|---|---|---|---|
| 2026-10-20 | Toolkit / enablement | Claude Code (lead) + 3 research sub-agents | Surveyed 50 skill repos and 11 skill sites; installed and vetted the curated skills and agents | `.claude/`, `tools/fde-toolkit/` | Sai M |
| 2026-10-23 | Business analyst | Claude Code (lead) | Analysed the kickoff transcripts, the guidelines PDF and Swarna's briefing; drafted the discovery questions | `docs/01`, `docs/02` | Sai M |
| 2026-10-23 | Data analyst | Claude Code (lead), pandas | Profiled 48,340 deliveries; found the 5 causes; Shapley attribution; money impact | `analysis/`, `docs/03` | Sai M |
| 2026-10-23 | Architect | Claude Code (lead) + skills `fde-design`, `c4-architecture` | Solution design, C4 and AWS diagrams, phase plan | `docs/04`, `docs/05` | Sai M |
| 2026-10-23 | DevOps | Claude Code (lead) | AWS CLI deploy kit, IAM policies, Caddy, CloudWatch | `infra/`, `docs/06` | Sai M |
| 2026-10-23 | Backend developer | Backend Architect agent + `test-driven-development`, `api-and-interface-design`, `find-docs` | FastAPI analytics, simulator, AI agents, tests | `backend/`, `ai-logs/backend-agent-2026-10-23.md` | Sai M |
| 2026-10-23 | Frontend developer | Frontend Developer agent + `frontend-design`, `ui-ux-pro-max`/`taste-skill`, `kpi-dashboard-design` | 9-screen React dashboard | `frontend/`, `ai-logs/frontend-agent-2026-10-23.md` | Dinesh K |
| 2026-10-23 | Tester / QA | Test Automation Engineer agent + `webapp-testing`, `verification-before-completion` | Playwright e2e suite (19 tests), evidence pack (tests, coverage, security scan, AI agent evaluation), 2 bugs fixed | `e2e/`, `evidence/`, `ai-logs/test-agent-2026-10-23.md` | Dinesh K |
| 2026-10-23 | Reviewer (judge's eye) | Reality Checker agent | Independent review against the L1 checklist and L2 scoring; found the Carrier D under-count, the overstated "96.6%", and the missing ROI | `ai-logs/reality-check-2026-10-23.md` | Sai M |
| 2026-10-23 | Data analyst (round 2) | Claude Code (lead) | Re-derived the carrier cause on clean deliveries (7 lanes), out-of-time check, realistic case, business case | `analysis/`, `docs/03` | Sai M |
| 2026-10-23 | Backend developer (round 2) | Backend Architect agent + `test-driven-development`, `security-and-hardening` | Review fixes: ROI, stock and route endpoints, forward-looking delay alert, rate limit, demo token, PII-safe archive, Postgres CI; 106 tests | `backend/`, `ai-logs/backend-agent-round2-2026-10-23.md` | Sai M |
| 2026-10-23 | Frontend developer (round 2) | Frontend Developer agent + `frontend-design`, `kpi-dashboard-design` | Honest framing, business-case table, Stock & routes page, offline labels | `frontend/`, `ai-logs/frontend-agent-round2-2026-10-23.md` | Dinesh K |
| 2026-10-23 | Backend developer (round 3) | Backend Architect agent + `test-driven-development`, `find-docs`, `agent-workflow-designer` | Gemini provider, Order desk (12-email inbox, 10-step agent pipeline, WMS orders), "How the agents work"; 148 tests | `backend/`, `data/sample-inbox/`, `ai-logs/backend-agent-round3-2026-10-23.md` | Sai M |
| 2026-10-23 | Frontend developer (round 3) | Frontend Developer agent + `frontend-design`, `ux-researcher-designer` | How it works landing page (process map, Today vs With DeliveryLens), Order desk (live) with pipeline trace and WMS table, help panel on every page, AI provider badge, offline desk fixtures; 27 unit + 30 e2e tests | `frontend/`, `e2e/`, `ai-logs/frontend-agent-round3-2026-10-23.md` | Dinesh K |
| 2026-10-23 | DevOps (round 2) | Claude Code (lead) | Deploy job opens SSH to its own runner IP only during the deploy | `.github/workflows/deploy.yml`, `infra/` | Sai M |
| 2026-10-23 | Pitch / adoption | Claude Code (lead) + `pptx` skill | 20-slide deck in the organisers' 7-section order, generated from findings.json; Word versions of all docs | `deck/`, `docs/downloads/` | Sravan Kumar D |
