# Halcyon DeliveryLens: instructions for Claude Code

## Always
- **At the start of every session, read `PROJECT-PROGRESS.md`.** It holds the shared context for the whole hackathon: what is built, what runs on AWS, decisions and open items.
- **Before you finish any session that changed something, update `PROJECT-PROGRESS.md`:**
  - fix any section that is now out of date;
  - add one dated line to its Change log (date, who, what changed).

  This applies to every team member's sessions, so everyone's Claude stays in sync after `git pull`.
- Pushing to `main` deploys to the live AWS site automatically. Run the tests first:
  - backend: `cd backend && .venv/Scripts/python.exe -m pytest`;
  - frontend: `cd frontend && npx tsc -b --noEmit && npx vitest run`.
- Never read, print or commit secrets: `backend/.env`, `infra/config.env`, `infra/.state/`, `test.py`, keys, `.pem` files.
- Follow `DESIGN.md` for any UI change.
