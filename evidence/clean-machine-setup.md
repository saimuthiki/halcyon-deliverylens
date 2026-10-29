# README checked on a clean copy

**Date:** 2026-10-29. **Machine:** Windows 11, Python 3.12.0, Node 24.22.1, npm 11.19.1, Git Bash. No Docker.
**What was done:** a fresh `git clone` of commit `390ce98` into an empty folder (no `backend/.env`, no
`infra/config.env`, no database, no `node_modules`), then the steps in [README "Run it on a laptop"](../README.md#run-it-on-a-laptop)
exactly as written, except the ports (8011 and 5180, because other copies of the app were already running).
The copy and its servers were deleted afterwards.

| Step from the README | Result | Time |
|---|---|---|
| `python analysis/root_cause_analysis.py` | Exit 0; `analysis/output/` unchanged (same numbers as in git) | 41 s |
| `python -m venv .venv` and `pip install -r requirements.txt` | Exit 0 | 109 s |
| `python -m app.loader` | Loaded every table, ending with `customer_success_time_study 18 rows`, `inbox_messages 11 rows` | 6 s |
| `uvicorn app.main:app` (port 8011) | `GET /api/health` = `{"status":"ok","db_ok":true,"deliveries_loaded":48340,"llm_provider":"mock",...,"llm_ready":true}`; `GET /docs` = 200 | |
| A typed order email (`POST /api/desk/own-email`) | 200, a full 10-step trace and a decision | < 1 s |
| `npm install` (frontend) | Exit 0 | 31 s |
| `npm run build` | "built in 18.70s" | 19 s |
| `npm run dev` (port 5180) | `GET /` = 200, page title "Halcyon DeliveryLens" | |

**Verdict: the README works on a clean machine with no secrets and no AWS.** The AI runs in mock mode by default.

## Two problems found, now in the README troubleshooting tips

1. **Windows "filename too long" during `pip install`.** The first try was in a very deep folder. pip failed with
   `OSError: [WinError 206] The filename or extension is too long` inside numpy. A short path (for example
   `C:\dl\`) fixed it. Another fix: turn on Windows long paths.
2. **CORS when the website runs on another port.** With no `backend/.env`, the API allows only
   `http://localhost:5173` and `http://localhost:3000`. A preflight from port 5180 got HTTP 400, so the website would
   show "Showing sample data". Fix: add the port to `CORS_ORIGINS` in `backend/.env`, or keep the default 5173.
