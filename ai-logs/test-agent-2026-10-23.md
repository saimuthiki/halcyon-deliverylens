# Test agent log, 2026-10-23

**Role:** Tester / QA (Test Automation Engineer agent, Claude Code)
**Task:** Produce the testing evidence the judges ask for ("evidence the solution was tested") and add end-to-end browser tests.
**Human reviewer:** to be assigned by the lead. The lead commits; the agent ran no git commands.

## What was done

1. **Built an end-to-end test project in `e2e/`.** It is a standalone Playwright (TypeScript) project: `package.json`,
   `playwright.config.ts`, `tsconfig.json` and `tests/`. It uses the preinstalled Chromium at `/opt/pw-browsers/chromium`
   when that path exists or `PW_CHROMIUM_PATH` is set. The base URL comes from `E2E_BASE_URL` (default `http://localhost:4173`).
   - `tests/decision.spec.ts`: Overview (71.0%, 96.6%, $14.2M), Why late (waterfall → cause → delivery drawer with timeline
     and explanation → **Draft delay alert**), Vendor (78.6% and the recommendation), Simulator (a slider moves the projected rate).
   - `tests/operations.spec.ts`: Carriers heatmap, with a recommended carrier on every region row.
   - `tests/agents.spec.ts`: Order intake (incomplete address, then same-day after cutoff), Ask (the answer contains a number),
     Agent activity. The activity test creates its own agent run through the API first, so it does not depend on test order.
   - `tests/offline.spec.ts`: API down. The test blocks the API in the browser and checks that the "Showing sample data"
     banner appears and the headline numbers still show.
   - `tests/smoke.spec.ts`: all 9 routes load live data, no section shows an error, and the console shows no errors.
   - Rules followed: no fixed sleeps; the tests wait on conditions and on the network responses that matter. Selectors use roles,
     labels and visible text; no `data-testid` was added. Every test that touches the live API asserts that the sample-data banner
     is absent, so a silent fallback cannot pass as live. A screenshot from each main test goes to `evidence/e2e-screenshots/`.
     Traces, video and screenshots are kept for any failure.
2. **Ran the real stack.** Backend: existing `backend/.venv`, `python -m app.loader`, uvicorn on :8000 with `LLM_PROVIDER=mock`
   and `CORS_ORIGINS=http://localhost:4173`. Frontend: production build with `VITE_API_URL=http://localhost:8000`, served by
   `vite preview` on :4173. Both servers were stopped afterwards.
3. **Evidence pack in `evidence/`:** backend pytest with coverage, frontend vitest and typecheck, e2e results, a security scan
   (bandit, pip-audit, npm audit) with an honest summary, an AI agent evaluation with its script (`ai_eval.py`), and a
   plain-English `README.md`.

## Skills used

- **webapp-testing:** reconnaissance before action. Each page was rendered and its accessibility tree read before the selectors
  were chosen, and the network had to settle before any assertion. On the first run, two selectors failed. In the waterfall, the
  first `.recharts-bar-rectangle` is the invisible base bar, so the test now counts the drawn bar paths. In the heatmap, the header
  cells were not exposed as column headers, which turned out to be a real bug (see below).
- **verification-before-completion:** no claim without a fresh run. The full suite was rerun after every app change: after the
  heatmap fix and after the React Router update, it ran once and then 10 times in a row (190 of 190 passed). The heatmap fix has a
  red-to-green record: the test failed on the old code and passes on the fixed code. Every evidence file holds output from the final
  code, captured by the command printed at its top.

## Results

| Check | Result |
|---|---|
| Backend pytest | 48 of 48 pass, 91% line coverage (`app/`) |
| Frontend vitest and typecheck | 12 of 12 pass, 0 type errors |
| Playwright e2e | 19 of 19 pass; 190 of 190 over 10 repeats (0 flaky) |
| AI agent evaluation (order intake, mock) | 36 of 36 checks match across 5 sample emails, and the prompt-injection email is blocked (HTTP 400) |
| bandit | 0 issues |
| pip-audit | 0 known vulnerabilities |
| npm audit --omit=dev | 3 high before the fix, 0 high after it; 2 moderate remain (they need React Router 7; low risk, explained) |

## Bugs found and fixed

1. **Accessibility: heatmap column headers.** In `frontend/src/pages/Carriers.tsx`, the heatmap's `<thead>` header cells were
   exposed to assistive tech as plain cells. The body rows use `<th scope="row">`, and Chromium's header heuristics then left the
   column headers out, so a screen reader read "71%" without saying which carrier it belonged to. Fix: `scope="col"` on the three
   header `<th>` elements. The e2e test checks the `columnheader` role for "Carrier A" and "Recommended".
2. **Security: React Router advisories.** `react-router-dom` 6.26.2 had 3 high-severity advisories (GHSA-2w69-qvjg-hvjx and
   GHSA-2j2x-hqr9-3h42, open redirect). It was updated to 6.30.6, still within version 6 and pinned exactly, in
   `frontend/package.json` and `frontend/package-lock.json`. The build, vitest and all e2e tests pass after the update.

## Not fixed (reported only)

- The 2 remaining moderate React Router advisories need a major upgrade to v7. The app has no SSR, and every link target is a
  fixed internal path.
- Dev and build tool advisories (vite/esbuild, postcss, tailwind 3's watcher, vitest/tinypool). None of these tools ships in `dist/`.
- When the drawer is open, the fixed-position sidebar and drawer cut off in full-page screenshots. This only affects the
  screenshots; the drawer screenshot is therefore taken at viewport size.

## Files

- New: `e2e/` (package.json, package-lock.json, playwright.config.ts, tsconfig.json, tests/*.ts), `evidence/*`, this log.
- Changed: `frontend/src/pages/Carriers.tsx`, `frontend/package.json`, `frontend/package-lock.json`, `.gitignore` (e2e test-results
  and report folders), `ai-logs/INDEX.md` (one row).
