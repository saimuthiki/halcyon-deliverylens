# Security audit report: Halcyon DeliveryLens

- **Report written:** 2026-10-29
- **Audit run:** 2026-10-28, with the Cloudflare `security-audit` skill, "quick" profile
- **Code checked again for this report:** commit `d96284b` (the newest `main` on 2026-10-29)
- **Machine-readable records:** [`security-audit-2026-10-28-findings.json`](security-audit-2026-10-28-findings.json)
  (the audit's own records, in the skill's `report-schema.json` format; it passes the skill's validator)

## Summary

**The audit found no confirmed security holes.** It found one real risk in the deploy pipeline. That risk is now **fixed**.

The rest are small "make it stronger" ideas. None of them need action before the hackathon demo.

| # | Severity | Item | Status | One-line fix |
|---|---|---|---|---|
| 1 | High risk if real (never confirmed) | A pull request from someone else's copy of the repo might deploy their code to our live server | ✅ Fixed in `4ec0d3b` | Done: deploy now runs only for a real push to `main` in our own repo |
| 2 | Action needed (outside the code) | A Gemini API key sits in the local file `test.py` | ⚠️ Open | Revoke the key in Google AI Studio and make a new one; keep it in an environment variable |
| 3 | Accepted for the demo | The API has no login; anyone with the URL can call it | Accepted | After the hackathon, set `DEMO_TOKEN` or add a real login |
| 4 | Accepted for the demo | The website uses one shared password (Amplify basic auth) | Accepted | Share the password only with judges and the team; turn the site off after the event |
| 5 | Low (hardening) | "Send now" on the Weekly Brief has no time limit | Open | Put back a short cooldown, or require the demo token for sending |
| 6 | Low (hardening) | "Run all" on the Order desk makes about 20 AI calls per click | Open | Lower the per-minute limit for this button, or set a daily AI budget alarm |
| 7 | Low (hardening) | Address confirmation links never expire | Open | Add an expiry time (for example 7 days) |
| 8 | Low (hardening) | Deploy add-ons use version tags, and the server runs the `latest` image | Open | Pin GitHub Actions to exact commit IDs; deploy the image by its commit ID |
| 9 | Low (hardening) | The technical API page (`/docs`) is public | Open | Hide `/docs` in production after the hackathon |
| 10 | Low (hardening) | Emails typed on the Order desk can be read by anyone who opens the API | Open | Tell demo users not to paste real customer data |

"Severity" here is a plain guide, not a formal score. The audit itself gives no severity to item 1, because it could not prove the attack works.

## What was checked

The audit read the code only. It did **not** run the app, attack the live site, or log in to AWS. It never opened the secret files (`backend/.env`, `infra/config.env`, `infra/.state/`, `test.py`, keys).

**Areas covered:**
- the API routes in `backend/app` (agents, Order desk, Weekly Brief, simulate);
- AI input and output: email text sent to the AI, the safety checks after the AI answers, and the Ask agent's fixed list of tools;
- email sending: who receives emails and how headers are built;
- the website code in `frontend/src` (how it shows server and AI text);
- the deploy pipeline (`.github/workflows`) and AWS setup (`infra/`: roles, policies, server, HTTPS proxy).

**Not covered:**
- known bugs in the libraries we use (dependency CVEs);
- the end-to-end tests (`e2e/`), `docs/` and the website's nginx file;
- heavy-traffic abuse of the analytics and simulate routes;
- live GitHub and AWS settings, because the audit only reads code.

**Limits of this audit:**
- It was a **partial pass** ("quick" profile, 12 helper runs), not a full audit.
- The code changed while it ran (from `4ca71aa` to `3463d98`), so some backend files were read at two versions.
- On 2026-10-29 the backend, `infra/` and the deploy pipeline were re-checked against `d96284b`. Since `3463d98` the only security change is the deploy fix (item 1). The other new commits only change the website's look.

## Details

### 1. A pull request might deploy to the live server (✅ fixed)

**What the risk was:**
- Our CI tests run for every pull request, including one from a stranger's copy (a "fork") of the repo.
- The deploy pipeline started after any CI run that passed on a branch *named* `main`.
- A stranger could name their own branch `main` and open a pull request. If GitHub allowed it, their code would be built and deployed to our live server.

**Why it matters:** the deploy runs commands as the admin user on the server, and it can change the website. That would give a stranger control of the live demo.

**Why it was never confirmed:** it depends on GitHub settings that the code cannot show. These are whether the repo is private, and whether fork pull requests need approval.

**The fix (commit `4ec0d3b`):**
- `.github/workflows/deploy.yml` (line 36) now deploys only when the CI run was for a **push** to our **own** repo.
- The website deploy job waits for this API job, so it is protected too.
- Our normal pushes to `main` still deploy as before.

**Optional extra step:** in GitHub settings, require approval before workflows run for pull requests from outside collaborators.

### 2. Gemini API key in a local file (⚠️ action needed)

- The local file `test.py` has a Gemini API key written inside it.
- `test.py` is listed in `.gitignore`, so it is not committed.
- Two hidden local save points that held it were deleted. A check showed it was never pushed to GitHub.
- But the key has existed in plain text on a laptop and in older local history. Treat it as exposed.

**What to do:**
1. In Google AI Studio, delete (revoke) this key and create a new one.
2. Put the new key in an environment variable or in `backend/.env`. Never write it in code.
3. Delete `test.py` when you no longer need it.

### 3. The API has no login (accepted)

- The API at `https://35-175-32-49.sslip.io` is open on purpose, so judges can try it.
- The code has an optional shared token (`DEMO_TOKEN`) for the routes that change data or call the AI. It is not switched on in production.
- What protects the API now:
  - a limit of 30 AI requests per minute from each internet address;
  - size limits on every request body;
  - email recipients that are fixed on the server, so no caller can choose them.
- Anyone can reset the demo, approve orders or spend AI credits, up to the rate limit. That is fine for a demo with sample data only.

**After the hackathon:** set `DEMO_TOKEN`, or add a real login, or turn the API off.

### 4. The website has one shared password (accepted)

- The Amplify website asks for a username and password (basic auth).
- The password is **not** stored in the repo. Keep it that way.
- Basic auth only protects the website pages. The API behind them is still open (see item 3).

### 5. "Send now" on the Weekly Brief has no time limit (low)

- The 10-minute cooldown was removed on 2026-10-28 (commit `d31cefb`).
- Each reporting week can now be sent once per day. There are about 26 weeks in the data, so one person could send about 26 emails a day.
- They always go to the fixed list on the server, and in test mode to test addresses only. Nobody outside can be targeted.
- **Fix if wanted:** put back a short cooldown, or require the demo token for sending.

### 6. "Run all" uses many AI calls (low)

- One click on "Run all" on the Order desk processes about 11 emails with about 2 AI calls each.
- The 30-per-minute limit counts this as one request, so one person could cause roughly 600 AI calls a minute.
- **Fix if wanted:** count "Run all" as many requests, or set an AWS budget alarm for Bedrock.

### 7. Confirmation links never expire (low)

- Each address confirmation link has a long random code, which is good. It works only while the order is waiting for confirmation.
- But the link has no end date. A real product should add one.

### 8. Deploy pipeline hardening (low)

- GitHub Actions are referenced by version tags such as `@v4`. Pinning them to exact commit IDs stops a changed add-on from running in our deploy.
- The server pulls the `latest` image. Deploying the exact image built for a commit makes deploys repeatable and easier to roll back.

### 9. Public API page `/docs` (low)

- `/docs` lists every API route. It helps judges, so keep it for the demo.
- Hide it in production after the hackathon.

### 10. Typed emails are visible to other visitors (low)

- An email typed on the Order desk is saved as message `U01`.
- Anyone can read it through `GET /api/desk/inbox/U01` until someone else types a new one.
- Tell demo users to use sample data only.

## Things that are already done well

- **Email recipients are fixed on the server.** No request can choose who gets an email. Line breaks in headers are rejected.
- **Text is escaped.** Email templates escape HTML, and the website never inserts raw HTML.
- **AI output is checked by code.** It is checked for prompt injection, hidden personal data and wrong numbers. Orders stay as drafts until a person approves them.
- **The Ask agent can only use a fixed list of tools.**
- **The token check is safe.** The demo token is compared in constant time.
- **The AWS setup is tight:**
  - the server role can only reach this project's bucket, secret and topic;
  - the server requires IMDSv2;
  - the API runs as a normal user, not admin, behind an HTTPS proxy with security headers;
  - deploys use short-lived GitHub sign-in (OIDC), not stored AWS keys.
- **Secret files are ignored by git:** `backend/.env`, `infra/config.env`, `infra/.state/` and `test.py`.

## Ideas the audit checked and set aside

These looked like problems at first, but they are not real security holes in this demo:

- **The Order desk "reply" route can confirm an address without the link's code.** Set aside because the code is shown to every visitor anyway, and the reply route is a planned demo feature.
- **A typed email can add a wrong address to a client's address book.** Set aside because the same visitor can already change or reset everything in the open demo. Also, there are no real clients.
- **The Weekly Brief send limit is per week, not per day.** Set aside because this is the intended design. Item 5 covers the time limit.

Smaller notes from the AI review (not urgent):
- Approving an order does not check that the order is the same one the person reviewed.
- The client can also be picked from a name in the email body, not only from the sender address.
- Learned addresses should be labelled as "not verified".

## Next steps

1. **Now:** revoke the Gemini key (item 2).
2. **Optional, before the demo:** in GitHub settings, require approval for workflows from fork pull requests.
3. **After the hackathon:** turn off or lock down the API and the website (items 3 and 4), or work through items 5 to 10 if the project continues.
