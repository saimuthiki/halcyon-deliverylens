# Action items for the team (what only humans can do)

Everything else is built, tested and pushed. These need a person.

## Today / this weekend
- [ ] **Submit the round-2 discovery questions** to L&D: `docs/working/discovery-question-log-round2-InfinityStacks.xlsx` (12 questions, in their template).
- [ ] **Review the numbers and assumptions** in `docs/03-what-the-data-says.md`, especially the cost and effectiveness assumptions in the business case. Change them in `analysis/root_cause_analysis.py` (REALISTIC_EFFECTIVENESS, FIX_COST_USD_PER_YEAR) and re-run if you disagree.
- [ ] **Assign the human reviewer** for each `ai-logs/INDEX.md` row (names are suggestions).
- [ ] **Try the app locally**: see README "Run it on a laptop".

## Monday 26 Oct (AWS day)
- [ ] Get from L&D / Satya: **AWS region, account ID, and confirmation that Claude models are enabled in Bedrock**.
- [ ] Fill `infra/config.env` (copy from `config.env.example`): region, account, Bedrock model IDs (printed by `infra/scripts/00-check-access.sh`), your public IP.
- [ ] Run `infra/scripts/00` to `08` in order (guide: `docs/06-aws-setup-guide.md`).
- [ ] Add GitHub repository secrets: `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `AWS_ACCOUNT_ID`, `EC2_HOST`, `EC2_SSH_KEY`, `EC2_SG_ID`.
- [ ] Connect **Amplify** to this GitHub repo (branch `main`), set `VITE_API_URL=https://<ip-with-dashes>.sslip.io`, add the SPA rewrite rule from `frontend/README.md`.
- [ ] Optional: set `DEMO_TOKEN` in the secret and `VITE_DEMO_TOKEN` in Amplify to protect the AI endpoints.
- [ ] **Record the discovery answers** in the xlsx and update `docs/02` and `docs/03` if any answer changes an assumption.
- [ ] Run the order-intake evaluation on real Bedrock (`evidence/ai_eval.py`) and save the result in `evidence/`.

## Tuesday 27 – Wednesday 28 Oct
- [ ] Run the Playwright suite against the live Amplify URL (`E2E_BASE_URL=...`).
- [ ] Two timed demo rehearsals (20 min + 10 min Q&A); record a backup video.
- [ ] Tag `v1.0-submission`.

## Thursday 29 Oct
- [ ] Submit the repo link, the live URL and the AI usage logs (`ai-logs/`).
- [ ] Final deck: `deck/DeliveryLens-pitch.pptx` (regenerate with `node deck/build_deck.js` after any number changes).
