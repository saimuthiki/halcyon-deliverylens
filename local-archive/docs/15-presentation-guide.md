# 15. Presentation guide: the jury round

**When:** Thursday 5 November 2026, in person, 30 minutes.
**Who:** Team InfinityStacks: Sravan Kumar D, Sai M, Dinesh K.
**Format** (from [01 What the judges want](01-what-the-judges-want.md#the-presentation-30-minutes)):
- 20 minutes of talk and demo, then 10 minutes of questions.
- Seven sections, in this order: 1 discovery and the key problem, 2 solution and architecture, 3 AI agents used,
  4 quality, validation and security, 5 metrics and business impact, 6 future scope. The 7th, the live demo, can sit anywhere.
- The judges play the client: Halcyon's COO and CFO. Speak to them as the client.

Every number in this guide comes from the repo. If you are asked for a number that is not here, say
"I will check and send it", and do not guess.

---

## 1. Who does what

| Person | Role in the room | Why |
|---|---|---|
| **Sravan Kumar D** | Opens and closes. Problem, data, business impact | Business and pitch lead ([07](07-how-we-work-with-ai-agents.md)) |
| **Sai M** | Solution, architecture, AI agents, security, roadmap. Backup demo driver | Architecture, AI and AWS lead |
| **Dinesh K** | Drives the live demo. Quality and testing | Full-stack and testing lead |

**One laptop, two windows:** the deck (PowerPoint, presenter view) and the browser (website already logged in).
Switch with Alt+Tab. Dinesh sits at the laptop during the demo.

---

## 2. The run sheet (30 minutes)

Slide numbers are from [deck/DeliveryLens-pitch.pptx](../deck/DeliveryLens-pitch.pptx) (15 slides).

### Part A: Discovery and the key problem (0:00 to 4:00), Sravan

| Time | Screen | Say this |
|---|---|---|
| 0:00 to 1:00 | Slide 1 (title) | **The hook** (see section 3 below). Then: "We are Team InfinityStacks. Our product is DeliveryLens. Find why. Fix it. Prove it." |
| 1:00 to 2:00 | Slide 2 (the problem) | "We read all 48,340 deliveries from April to September. Only 71% arrived on time. The benchmark is 94%." "Penalties cost about $1.74M a year. Nine clients, worth $14.2M a year, may leave. And leaders were ready to sign a $680K routing tool." |
| 2:00 to 2:45 | Slide 3 (who feels it) | "Customer success spends 64% of its week on complaints. Staff type email orders by hand, 44.4 hours a week. 12 of the 34 complaints say: nobody told us." |
| 2:45 to 4:00 | Slide 4 (five causes) | "In discovery, Swarna told us: do not assume routing is the problem. She was right." "Deliveries with none of five problems are 99% on time. Five causes explain 28 of the 29 points lost. Route deviation, the only thing the routing tool fixes, is the smallest: 3.1 points." |

### Part B: Solution and architecture (4:00 to 6:00), Sai

| Time | Screen | Say this |
|---|---|---|
| 4:00 to 4:45 | Slide 5 (our answer) | "The routing tool alone reaches about 80%. Fixing the five causes reaches about 90%." "So we say: fix the causes first. Then a small routing pilot, only where routes are the problem." |
| 4:45 to 5:20 | Slide 11 (AI done safely) | "Our design rule is simple. AI reads. Rules decide. A person approves." "AI reads messy emails and writes replies. Cutoffs, carrier choice and accept-or-hold are fixed rules. So the same order always gets the same answer." |
| 5:20 to 6:00 | Slide 12 (architecture) | "The website runs on Amplify. The API runs in Docker on EC2, with a private, encrypted PostgreSQL database on RDS. The AI is Claude on Amazon Bedrock." "Every push to main runs the tests and deploys itself, with no stored keys." |

### Part C: LIVE demo (6:00 to 12:00), Dinesh drives, Dinesh speaks

Before you start: the Order desk is reset (see the checklist). Say: "Now the real app, live on AWS."

| Time | Screen | Do this | Say this |
|---|---|---|---|
| 6:00 to 7:30 | Website → **Order desk (live)** → email **M01** | Click M01. Run it. Watch the 10 steps. Click **Approve into WMS**. | "A clean email from an at-risk client. The safety screen passes. The AI reads the client, items, address and date. The rules check address, stock, carrier and cutoff." "Accepted. But nothing reaches the warehouse until a person approves. Now it is Ready for pick list." |
| 7:30 to 9:00 | Email **M02** (missing postcode), then the client page | Run M02. The envelope stops, orange. Open the client confirm link. Click confirm. | "This email has no postcode. That is cause 2: 28% of email orders have an incomplete address." "DeliveryLens finds the one past delivery site that matches, and holds the order." "The client gets one address and one button. No login. Confirmed, and the order moves on." |
| 9:00 to 9:45 | Email **M10** (prompt injection) | Run M10. Step 2 turns red. | "This email hides an instruction to the AI. It is blocked at the safety screen. Nothing reaches the AI. Nothing reaches the warehouse." |
| 9:45 to 11:30 | **Type your own** | Ask one juror: "Please give us an order, any words you like." Type it. Sender `orders@client-055.example`. Click **Run DeliveryLens on this email**. | "This email is new. Nobody has seen it before. The same 10 steps run." If it is vague: "It does not guess. It goes to a person." Invite: "Try removing the postcode, or writing URGENT." |
| 11:30 to 12:00 | **Agent activity** | Open the log. | "Every AI call is logged: model, tokens, time and guardrail flags. A person can check every one." |

**Rules for the demo:**
- Do not click **Run all** more than once. It makes about 20 AI calls in one click.
- Ask the juror to use made-up data only. A typed email can be read through the open API until the next one replaces it.
- If an answer takes more than 15 seconds, say "The AI is thinking; while we wait, here is what it will do", and explain the next step.

#### Fallback if Wi-Fi or the live site fails

| What fails | What you see | Do this |
|---|---|---|
| The website does not load in 20 seconds | Blank page or login loop | Try the phone hotspot (30 seconds only). Still down: play **`demo-video/DeliveryLens-demo.mp4`** (2:36, music only) from the laptop, full screen, and talk over it; the bad-input part is at 1:57. If you have more time, play the narrated **`DeliveryLens-demo-full.mp4`** (6:37; bad input at 5:30). |
| The website loads, the API is down | A banner: **"Showing sample data"** | Say so honestly: "The live server is not reachable, so the site shows sample data." Show the Order desk results on sample data. Skip **Type your own** (it needs the live server). Then play the video for the live flow. |
| The AI is slow or answers 429 | A "rate limited" message | 30 AI requests a minute per internet address. The whole room shares one address. Wait for the Retry-After time, or switch to the video. |

After the video, go back to slide 7 (Order desk) and continue. Do not try to fix the site in front of the jury.

### Part D: AI agents used to build it (12:00 to 13:30), Sai

| Time | Screen | Say this |
|---|---|---|
| 12:00 to 13:30 | GitHub repo: `.claude/agents/` and `ai-logs/` (or [07](07-how-we-work-with-ai-agents.md) diagram) | "We used AI agents in every role, not only coding. Business analysis, data analysis, architecture, development, testing, security, DevOps and documents." "Three humans each lead a group of agents. We give the direction and review every output." "The Dev, DevOps and QA agent files are in `.claude/agents/`. They state the role, the scope, the inputs and outputs, and the guardrails. For example, no agent changes AWS; a person runs the scripts." "The proof: 9 session logs in `ai-logs/`, and every commit." |

### Part E: Quality, validation and security (13:30 to 15:30), Dinesh then Sai

| Time | Who | Screen | Say this |
|---|---|---|---|
| 13:30 to 14:30 | Dinesh | `evidence/README.md` or `docs/SCORECARD-EVIDENCE.md` | "Backend: 387 tests passed, 1 skipped. Frontend: 60 of 60, 0 type errors. Browser tests: 30 of 30, and 190 repeated runs with 0 flaky." "We sent 33 bad inputs: empty, blank, malformed, oversized, injection, large. 0 server errors. Every answer is readable." "We have 30 edge cases. Each one links to the test that handles it." |
| 14:30 to 15:30 | Sai | `docs/security/security-audit-2026-10-29.md` | "A security audit found no confirmed holes. One deploy risk was found and fixed." "No AWS keys anywhere: an instance role and GitHub OIDC. Secrets in Secrets Manager. Private, encrypted database." "Honest gaps: the API is open for the demo and rate-limited; the website has one shared login. The fix is in week 1 of the roadmap." |

### Part F: Metrics and business impact (15:30 to 18:00), Sravan

| Time | Screen | Say this |
|---|---|---|
| 15:30 to 16:00 | Slide 8 (grace hour) | "The 08:00 pick list stays, as the business owner asked. A grace hour to 09:00, then urgent orders only to 10:00." "Replayed on 4,826 real late orders: 729 late deliveries avoided a year." |
| 16:00 to 16:30 | Slide 9 (risk board) | "At 08:00, the risk board ranks today's shipments. On two months it never saw, 63% of its daily top 20 were really late, against 29% overall." |
| 16:30 to 17:00 | Slide 10 (money and clients) | "$261,900 in penalties in six months where the carrier alone was at fault. $128,700 from Carrier D. The AI drafts the claim letter." |
| 17:00 to 18:00 | Slide 13 (before and after) | "71.0% today. 90.2% in the realistic case. About $1.44M a year net." "The routing tool alone: 80.2%, and minus $160K a year on penalties alone." "These are model estimates from history. A pilot will measure the real gain every week." |

### Part G: Future scope (18:00 to 19:15), Sai

| Time | Screen | Say this |
|---|---|---|
| 18:00 to 19:15 | Slide 14 (limits and roadmap) | "Week 1: pilot the three process fixes at one warehouse, carrier choice by lane, and a real login." "Weeks 2 to 4: connect the real inbox and the WMS, and get ready for 10 times the load." "We measured 10 times the data: 483,400 deliveries, no errors. Memory is the first limit; the fix is pre-computed tables and two servers." "Week 6 and later: a small routing pilot, only on lanes with high route deviation." |

### Part H: Close (19:15 to 20:00), Sravan

| Time | Screen | Say this |
|---|---|---|
| 19:15 to 20:00 | Slide 15 (close) | **The closing line** (section 3). Then: "We are happy to take questions, or show any screen." |

### Part I: Questions (20:00 to 30:00), everyone

- Sravan picks who answers. Business and money: Sravan. Architecture, AI, security, AWS: Sai. Tests, data quality, demo: Dinesh.
- Answer in 20 to 40 seconds. Give the number, then where the proof is.
- If you do not know: "Good question. We have not measured that. Here is how we would."

---

## 3. The opening hook and the closing line

**Opening hook (Sravan, about 40 seconds, slow):**
> Imagine you run a busy shop. Your stock was promised for this morning. You told your own customers it would be
> on the shelf by noon. Noon comes. The truck does not. Nobody calls. Nobody explains.
> At Halcyon Logistics, this happens to 29 of every 100 deliveries.
> This is DeliveryLens. Find why. Fix it. Prove it.

**Closing line (Sravan, slow, look at the jury):**
> So, back to your shop. The truck arrives. And if it is going to be late, you hear first.
> From 71% to about 90% on time. About $1.44M a year. Without the $680K tool.
> DeliveryLens. Find why. Fix it. Prove it.

---

## 4. Likely jury questions, with short honest answers

"Where" = the file to open if they want proof.

### Problem and scope

**Q1. What is the real problem, in one sentence?**
Only 71% of deliveries are on time, and five causes explain 28 of the 29 points lost. Routing is the smallest cause, at 3.1 points.
Where: [03](03-what-the-data-says.md#the-five-causes), [10 section 1](10-discovery-and-requirements.md#1-problem-statement-one-page).

**Q2. How do you know the causes are real and not fitted to the data?**
We picked the weak lanes with a fixed rule on April to June only. The rule found the same 7 lanes. On July to September they stayed weak: 64% on time against 99%.
Where: [03](03-what-the-data-says.md#did-we-just-fit-the-data-a-fair-test).

**Q3. What did discovery change in your design?**
The business owner said the 08:00 pick list must not change. That killed our "second pick wave" idea. So we built the grace hour and the urgent window instead. Other round-2 answers did not come back, so we wrote them as assumptions.
Where: [10 sections 1 and 4](10-discovery-and-requirements.md#4-assumptions).

**Q4. What are your requirements, and what is out of scope?**
20 functional and 10 non-functional requirements, each linked to a feature and a test. Out of scope: no live WMS or carrier link, no real inbox, no routing engine, no automatic sending to clients, no user accounts, no file upload.
Where: [10 sections 2, 3 and 6](10-discovery-and-requirements.md#2-functional-requirements).

### Working product, edge cases and errors

**Q5. Which edge cases do you handle?**
30 edge cases, each linked to a test. For example: missing postcode, two past sites match (no guess), vague quantity, "URGENT!!!" with no reason, order after the 10:00 hard stop, AI returns broken JSON, API down.
Where: [10 section 7](10-discovery-and-requirements.md#7-edge-cases-and-the-test-that-handles-each).

**Q6. What happens with input you have never seen?**
Try it now: Order desk → Type your own. The same 10 steps run. If the AI is not sure (confidence below 0.6), the order goes to a person. It does not guess.
Where: [evidence/bad-inputs.md](../evidence/bad-inputs.md) B07, B08; [user guide](08-user-guide.md#try-your-own-email-type-your-own).

**Q7. What about bad or broken input?**
We sent 33 bad inputs: empty, blank, missing fields, bad JSON, wrong types, too long, injection, large. 0 server errors. Each answer has a readable message. We found one gap (blank text reached the AI) and fixed it with a test.
Where: [evidence/bad-inputs.md](../evidence/bad-inputs.md).

**Q8. What if the AI service fails?**
The Order desk shows a readable 502 message. If the AI returns broken JSON, we fall back to the rule parser. If the whole API is down, the website shows sample data and still works.
Where: [10](10-discovery-and-requirements.md#7-edge-cases-and-the-test-that-handles-each) E19, E20, E27.

### Engineering

**Q9. Can someone else run it from the README?**
Yes. We checked it on a clean clone on 29 October. It found 2 problems, and they are now troubleshooting tips. It runs without AWS and without an AI key (mock mode).
Where: [README](../README.md#run-it-on-a-laptop), [evidence/clean-machine-setup.md](../evidence/clean-machine-setup.md).

**Q10. Show us your Dev, DevOps and QA agents. Are they real or just files?**
They are in `.claude/agents/`. Each has a role, scope, inputs, outputs and guardrails, and links to its real output: 9 session logs in `ai-logs/`, the commits, the CI workflows and the evidence folder. Humans review every output.
Where: [.claude/agents/](../.claude/agents/), [ai-logs/INDEX.md](../ai-logs/INDEX.md), [07](07-how-we-work-with-ai-agents.md).

**Q11. Why EC2, and not Lambda or ECS?**
The API keeps the data in memory. Lambda would reload and tag 48,340 rows on each cold start. ECS needs more setup for one container. The cost: one server is a single point of failure. ECS Fargate with 2 tasks is on the roadmap.
Where: [11 ADR-05](11-architecture-decisions.md#adr-05-one-ec2-server-with-docker-not-lambda-or-ecs).

**Q12. Why scripts and not CDK or Terraform?**
The team was new to AWS. Each numbered script maps to one console page and can be read line by line. The cost: no drift detection. CDK is on the roadmap.
Where: [11 ADR-08](11-architecture-decisions.md#adr-08-aws-cli-scripts-instead-of-cdk-or-terraform).

**Q13. Do you have hard-coded values?**
Settings are read from the environment in `backend/app/config.py`. A scan found no secret and no local path in app code. The only fixed URL in app code is the Brevo email endpoint. Deploy targets are in one block at the top of `deploy.yml`. The business-case estimates are two named constants in the analysis script.
Where: [SCORECARD row 3.4](SCORECARD-EVIDENCE.md#3-engineering), [evidence/security-scan.txt](../evidence/security-scan.txt).

### Business value

**Q14. How did you measure the benefit?**
We tagged each delivery with its five causes. Deliveries with none are 99.0% on time. A fix moves a delivery to the on-time rate of deliveries with its other causes. Points are split fairly (Shapley), so nothing counts twice. Money = avoided late deliveries times that client's past penalty, plus the redelivery cost.
Where: [14 section 1](14-business-benefit-and-innovation.md#1-the-sponsors-kpi-on-time-delivery-and-the-money).

**Q15. What are the limits of that number?**
It is a model, not a measured result. The fix success rates are our estimates: address 80%, same-day 70%, stock 50%, carrier 90%, route 50%. The $34 redelivery cost may be a recording rule, so we also show penalties only: $806K a year net. A pilot must measure the real gain.
Where: [12 section 2](12-scalability-and-roadmap.md#2-honest-limitations-today), [10 assumptions](10-discovery-and-requirements.md#4-assumptions).

**Q16. Why not just buy the routing tool?**
It can touch only 2 of the 5 causes. Best case: 80.2% on time. On penalties alone it loses about $160K a year. Fixing all five causes, realistic case: 90.2% and $1.44M a year net, for about $359K a year of cost. Our advice is "reshape, not reject": a small routing pilot later, only on lanes with high route deviation.
Where: [14 section 1](14-business-benefit-and-innovation.md#1-the-sponsors-kpi-on-time-delivery-and-the-money), Vendor decision page.

**Q17. Can you reach the 94% benchmark?**
Only if each fix works about 84% of the time. The ceiling, all five fully fixed, is 99%. You can test any mix in the What-if simulator.
Where: [README](../README.md#the-answer-in-one-picture), What-if simulator page.

**Q18. What happens at 10 times the load?**
We measured it: 483,400 deliveries, all calls answered, no errors. What breaks first: memory (750 MB on a 2 GB server) and a 21-second first request after a deploy. The fix: pre-computed tables in PostgreSQL, a cache warm-up, ECS with 2 tasks, a shared rate limit, and a queue for emails.
Where: [evidence/scalability.md](../evidence/scalability.md), [12 section 1](12-scalability-and-roadmap.md#1-how-far-it-scales-today-measured).

**Q19. Can it be reused for another client?**
Yes, by settings only: the data folder, the cutoff times and the time zone. The 10x test itself used a different dataset with no code change.
Where: [evidence/scalability.md](../evidence/scalability.md#reuse-for-another-client-or-use-case).

**Q20. What is new here? What is the innovation?**
Nine innovations, each with before and after. The top three: find the real causes before buying software; the grace rule (729 late deliveries avoided a year); the morning risk board (63% of its top 20 really late, AUC 0.81, on unseen months). Also penalty recovery: $261,900 in six months.
Where: [14 section 2](14-business-benefit-and-innovation.md#2-each-innovation-before-after-evidence).

### Presentation and demo

**Q21. Is the demo real, or staged?**
It is the real app on AWS. You can type your own email. The 11 sample emails each have an expected result, and a test checks that every one meets it.
Where: Order desk; test `test_every_sample_email_meets_its_expected_decision_under_mock`.

### Delivery and operations

**Q22. How do you deploy?**
Every push to `main` runs CI: tests on SQLite and PostgreSQL 16, the frontend, the numbers check and scans. Then it deploys: image to ECR, restart through Systems Manager, website to Amplify, health check. GitHub signs in with OIDC, so no AWS keys are stored. Rollback: re-run the deploy on an older commit.
Where: [13 sections 1 and 2](13-environments-and-security.md), `.github/workflows/`.

**Q23. How did you test it?**
Backend 387 passed, 1 skipped. Frontend 60 of 60, 0 type errors. Browser tests 30 of 30, 190 repeated runs, 0 flaky. Honest gap: browser tests do not run on our Windows laptops, so that evidence is from 23 October.
Where: [evidence/README.md](../evidence/README.md).

**Q24. What is your security and login model? The API is open, isn't it?**
Yes, on purpose for the demo, so you can try it. The website has one shared login. The API has HTTPS, a limit of 30 AI requests a minute per address, size limits, and email recipients fixed on the server. An optional token lock (`DEMO_TOKEN`) is built and tested; one setting turns it on. Before real data: a real login with Cognito, token on, `/docs` hidden.
Where: [13 section 3](13-environments-and-security.md#3-security-model), [security audit](security/security-audit-2026-10-29.md) items 3 and 4.

**Q25. What did the security audit find?**
No confirmed holes. One deploy risk (a pull request from a fork might deploy) was fixed in commit `4ec0d3b`. One human action: revoke an old Gemini key from a local file that was never pushed. Six small hardening items are on the roadmap.
Where: [security audit](security/security-audit-2026-10-29.md).

**Q26. How do you stop the AI from making things up?**
The AI never computes a number or makes a decision. Every number it writes must match the facts it was given; if not, the template is used. Quotes are checked by code against the email. Ask DeliveryLens says when the data has no answer. A person approves every order and message.
Where: [10 NFR-01, NFR-02](10-discovery-and-requirements.md#3-non-functional-requirements), [bad-inputs](../evidence/bad-inputs.md) B14.

**Q27. How do you stop prompt injection?**
A safety check runs before any AI call. It blocks 16 tested injection variants. Input over 20,000 characters is refused before the AI.
Where: `test_guardrails.py::test_blocks_injection_variants`; [bad-inputs](../evidence/bad-inputs.md) B09, B10, L02.

**Q28. How much does the AI cost?**
About 2 AI calls per order email. A fast model (Claude Haiku) reads emails; a smart model (Sonnet) writes plans and briefs, to keep cost low. Bedrock is pay per call, no fixed cost. AWS is about $37 a month plus a small Bedrock charge, with a $100 budget alert. Honest gap: we have not measured the dollar cost per email; the Agent activity log shows the tokens.
Where: [11 ADR-04](11-architecture-decisions.md#adr-04-amazon-bedrock-claude-in-production-gemini-and-mock-locally), [PROJECT-PROGRESS.md](../PROJECT-PROGRESS.md), [12](12-scalability-and-roadmap.md) (daily budget alarm on the roadmap).

**Q29. What about data privacy?**
All data is synthetic, as the rules require. Personal data, like email addresses, is hidden in the AI log. The database is private and encrypted. AI calls go through Bedrock with the server's own role. One gap: an email typed on the Order desk can be read through the open API until the next one replaces it. So we ask people not to paste real data.
Where: [13 AI safety](13-environments-and-security.md#ai-safety-inside-the-product), [security audit](security/security-audit-2026-10-29.md) item 10.

**Q30. How well does the AI agent perform?**
The order-intake evaluation passed 36 of 36 checks. Honest gap: that run used mock mode. The live Bedrock agents were checked by hand, not by a scored evaluation.
Where: [evidence/ai-agent-eval.md](../evidence/ai-agent-eval.md), [12 limitation 9](12-scalability-and-roadmap.md#2-honest-limitations-today).

**Q31. What are your limitations?**
Nine, all written down. The biggest: the business case is a model; there are no live systems; security is demo-level; there is one AWS environment.
Where: [12 section 2](12-scalability-and-roadmap.md#2-honest-limitations-today).

**Q32. What must Halcyon give us to go live?**
- Access to the real order inbox and the WMS API.
- Carrier delay feeds: the Carrier D portal, and the E and F batch files.
- Confirmation that carrier contracts allow passing penalties on.
- Confirmation of the $34 redelivery cost.
- One warehouse for the pilot, and weekly on-time numbers to measure against 71%.
- Who should get the weekly brief, and who should log in.
Where: [12 roadmap](12-scalability-and-roadmap.md#3-roadmap-in-priority-order), [10 assumptions](10-discovery-and-requirements.md#4-assumptions).

**Q33. What would you do in the first 90 days?**
Week 1: pilot the three process fixes at one warehouse, carrier choice by lane, and production security. Weeks 2 to 4: the real inbox and WMS, and 10x readiness. Weeks 4 to 6: separate AWS environments and carrier delay feeds. Week 6 and later: a small routing pilot.
Where: [12 section 3](12-scalability-and-roadmap.md#3-roadmap-in-priority-order), slide 14.

---

## 5. Pre-demo checklist (the morning of 5 November)

Do this at least 60 minutes before you present. Two people check, one ticks.

**The site and the API**
- [ ] Open the website (https://main.d19tzovsk3zuvo.amplifyapp.com). Log in. The password is with the team; never write it on a slide or in the chat.
- [ ] Open the API health page: https://35-175-32-49.sslip.io/api/health. It should be ok, with 48,340 deliveries loaded.
- [ ] Open the Overview page once. This warms the cache (the first request after a restart is slower).
- [ ] Check the AI badge on the site. It should show Bedrock, not Mock.
- [ ] **Do not push to `main` that morning.** Every push redeploys and restarts the API.

**The AI**
- [ ] Bedrock: run one email on the Order desk. It should finish in a few seconds. Check the call appears in **Agent activity**.
- [ ] Gemini is only for laptops. If you run locally with Gemini, the free tier can answer 429; switch back to mock.
- [ ] Remember the limit: 30 AI requests a minute per address. The whole room shares one address. No "Run all" practice in the room.

**The Order desk**
- [ ] Click **Reset demo**. All 11 emails show as new. The WMS table is empty.
- [ ] Do one full rehearsal: M01, approve, M02, client page, M10, Type your own. Then **Reset demo** again.
- [ ] Have a short sample email ready to paste, in case no juror offers one.

**The laptop**
- [ ] Browser zoom at 125% to 150%, so the back row can read. Close other tabs. Turn off notifications.
- [ ] The **Barlow** font is installed (free Google font). Without it, PowerPoint changes the deck's font.
- [ ] Open the deck in presenter view. Check slides 1 to 15 and the speaker notes.
- [ ] Both videos (**`demo-video/DeliveryLens-demo.mp4`** and **`DeliveryLens-demo-full.mp4`**) are on the laptop (not only online). Test that it plays with sound.
- [ ] Charger and a video adapter (HDMI or USB-C).

**The network**
- [ ] Test the venue Wi-Fi with the site.
- [ ] Phone hotspot ready, with data, and tested once with the laptop.

**The team**
- [ ] Each person knows their minutes in the run sheet.
- [ ] One person watches the clock and shows "5 minutes" and "1 minute" signs.
