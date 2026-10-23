# Evidence that DeliveryLens was tested

All results below come from real runs on 23 Oct 2026, on the code in this repository. Every file linked here
holds the full, unedited output of the command, so anyone can check it.

## Summary

| What was tested | How | Result | Proof |
|---|---|---|---|
| Backend: analytics, simulator, API, AI agents, guardrails, storage | 48 automatic tests (pytest), with code coverage | **48 of 48 pass. 91% of backend code is run by the tests** | [backend-tests.txt](backend-tests.txt) |
| The numbers match the original analysis | One of the backend tests compares every figure with `analysis/output/findings.json` | Pass: exact match | [backend-tests.txt](backend-tests.txt) |
| Frontend: waterfall maths, simulator maths, order-intake parser, components | 12 automatic tests (vitest) and a strict TypeScript check | **12 of 12 pass. 0 type errors** | [frontend-tests.txt](frontend-tests.txt) |
| The whole app in a real browser (end to end) | 19 Playwright tests drive Chromium against the production build and the live API. They click through the same steps a user would | **19 of 19 pass** | [e2e-results.txt](e2e-results.txt) |
| The browser tests are reliable, not lucky | Every browser test was run 10 times in a row (190 runs) | **190 of 190 pass, 0 flaky** | [e2e-results.txt](e2e-results.txt) |
| Screens behave as described | One screenshot per main browser test | 10 screenshots | [e2e-screenshots/](e2e-screenshots/) |
| AI agent quality | The order-intake agent read the 5 sample emails. Its answers were compared with what a person expects, plus one prompt-injection email | **36 of 36 checks match. The injection email is blocked** | [ai-agent-eval.md](ai-agent-eval.md) |
| Security of our Python code | bandit (static code scan) | **0 issues** | [security-scan.txt](security-scan.txt) |
| Security of Python libraries | pip-audit (known vulnerabilities) | **0 known vulnerabilities** | [security-scan.txt](security-scan.txt) |
| Security of browser libraries | npm audit, production packages only | 3 high issues found in React Router. **Fixed** by updating it to 6.30.6. 2 moderate issues remain; they need React Router 7. The risk is low for this app (see the file) | [security-scan.txt](security-scan.txt) |

## What the browser tests check

| # | Test | What it proves | Screenshot |
|---|---|---|---|
| 1 | Overview | Shows 71.0% today, 96.6% with all fixes and $14.2M revenue at risk, with no browser errors | [01-overview.png](e2e-screenshots/01-overview.png) |
| 2 | Why deliveries are late | The waterfall chart draws. Choosing a cause lists real late deliveries. Opening one shows its timeline and the reason it was late. **Draft delay alert** returns a message from the agent | [02-why-late-delay-alert.png](e2e-screenshots/02-why-late-delay-alert.png) |
| 3 | Vendor decision | Shows that the routing vendor alone reaches only 78.6%, and shows the recommendation ("do not sign as scoped") | [03-vendor-decision.png](e2e-screenshots/03-vendor-decision.png) |
| 4 | What-if simulator | Moving a slider changes the projected on-time %, and the API recalculates it | [04-simulator.png](e2e-screenshots/04-simulator.png) |
| 5 | Carriers | The carrier × region heatmap shows a recommended carrier for every region | [05-carriers-heatmap.png](e2e-screenshots/05-carriers-heatmap.png) |
| 6 | Order intake, incomplete address | Street, ZIP code and country are flagged as missing, and a follow-up email is drafted | [06-order-intake-incomplete-address.png](e2e-screenshots/06-order-intake-incomplete-address.png) |
| 7 | Order intake, same-day after 08:00 | The cutoff warning appears | [07-order-intake-after-cutoff.png](e2e-screenshots/07-order-intake-after-cutoff.png) |
| 8 | Ask DeliveryLens | A suggested question gets an answer that contains a number from the data | [08-ask.png](e2e-screenshots/08-ask.png) |
| 9 | Agent activity | Agent runs are listed with their status | [09-agent-activity.png](e2e-screenshots/09-agent-activity.png) |
| 10 | API down | If the API cannot be reached, the **Showing sample data** banner appears and the pages still work | [10-api-down-sample-data.png](e2e-screenshots/10-api-down-sample-data.png) |
| 11–19 | Smoke test of all 9 pages | Each page loads live data. No section shows an error. The browser console shows no errors | (none) |

## Problems the tests found and we fixed

1. **Carrier heatmap column headers were not announced to screen readers.** The browser showed the header cells
   ("Carrier A" … "Recommended") as plain cells, so a screen-reader user heard numbers without knowing which carrier
   they belonged to. Fix: `scope="col"` on the header cells in `frontend/src/pages/Carriers.tsx`. The browser test
   failed before the fix and passes after it.
2. **React Router had 3 high-severity security advisories (open redirect).** Fix: updated `react-router-dom` from 6.26.2 to
   6.30.6 (same major version) in `frontend/package.json` and `package-lock.json`. The build and all tests pass after the update.

## How to run the tests again

```bash
# Backend tests with coverage
cd backend && .venv/bin/python -m pytest --cov=app --cov-report=term-missing

# Frontend tests
cd frontend && npm test

# End-to-end browser tests (two terminals for the servers, then the tests)
cd backend && .venv/bin/python -m app.loader && CORS_ORIGINS=http://localhost:4173 .venv/bin/uvicorn app.main:app --port 8000
cd frontend && VITE_API_URL=http://localhost:8000 npm run build && npm run preview      # http://localhost:4173
cd e2e && npm install && npx playwright test                                            # E2E_BASE_URL to point elsewhere

# AI agent evaluation (backend running)
python3 evidence/ai_eval.py http://localhost:8000 backend/sample_emails evidence/ai-agent-eval.md
```

The end-to-end tests can also run against the deployed site: set `E2E_BASE_URL` to the Amplify URL and
`E2E_API_URL` to the API URL.

## Limits we know about

- The AI agents ran with the offline `mock` provider, because Bedrock access starts on 26 Oct. The tests prove
  the product flow, the fixed rules and the guardrails. They do not yet measure Claude's own answers. Rerun
  `ai_eval.py` with `LLM_PROVIDER=bedrock` once Bedrock is connected.
- The browser tests use Chromium on a desktop-sized screen. Firefox, Safari and phone sizes were not tested.
- Build and test tools (Vite, Vitest, Tailwind 3) still have npm audit findings. These tools run only on developer
  machines and in CI; nothing from them is shipped to users. Details are in [security-scan.txt](security-scan.txt).
