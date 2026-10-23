# 1. What the judges want

This page explains the hackathon rules in simple words, so the whole team aims at the same target.

## The journey, one picture

```mermaid
flowchart LR
  A["1 · Discover<br/>22–23 Oct<br/>ask the client questions"] --> B["2 · Design<br/>after discovery<br/>plan the fix"]
  B --> C["3 · Build<br/>until 28 Oct<br/>make it work"]
  C --> D["4 · Test & Deploy<br/>by 28 Oct<br/>prove it works, put it online"]
  D --> E["5 · Demo & Pitch<br/>first week of Nov<br/>convince the client"]
  D -.-> F[["Submit by 29 Oct:<br/>code + live app + AI logs"]]
```

**What this shows**
- The hackathon has five steps, in order. You cannot skip one.
- The hard deadline is **29 October**. By then we must hand in three things:
  1. the code on GitHub
  2. a working app that is online
  3. logs showing how we used AI agents
- The presentation comes later, in the first week of November.

## Round 1: the pass/fail checklist

```mermaid
flowchart TB
  subgraph MUST["All seven must be true, or we are out"]
    M1["Discovery<br/>we asked questions and used the answers"]
    M2["Agent pipeline<br/>AI agents in every role, not only coding"]
    M3["AI inside the app<br/>the product itself uses AI"]
    M4["Live app<br/>deployed and working"]
    M5["UI<br/>a usable front end"]
    M6["Backend<br/>working APIs, data and logic"]
    M7["Testing<br/>proof we tested it"]
  end
  MUST --> PASS{All yes?}
  PASS -->|Yes| R2[Go to Round 2]
  PASS -->|No| OUT[Eliminated]
```

**What this shows**
- Round 1 is a checklist. Every box must be ticked.
- For example: if we build a beautiful app but it only runs on a laptop, "Live app" is missing,
  and we are out.
- We are also out if we:
  - miss the deadline
  - drift away from the problem
  - break the rules (for example by using real customer data)

## Round 2: how the 100 points are split

```mermaid
pie showData
  title Round 2 points (out of 100)
  "AI-first delivery (agents in every role)" : 30
  "Solution design & completeness" : 25
  "Problem fit & business outcome (ROI)" : 20
  "Technical creativity & UX" : 15
  "Communication & future scope" : 10
```

**What this shows**
- The biggest slice, 30 points, is about **how we used AI agents across the whole project**:
  business analysis, design, coding, testing, deployment, documentation.
  - Example: "The BA agent turned the stakeholder call into a list of assumptions. The test agent
    wrote and ran our browser tests." We must be able to show logs for this.
- 20 points are for thinking like a consultant:
  1. name the real problem
  2. propose the fix
  3. prove the return on investment
- **The judges play the client** (Halcyon's COO and CFO). We speak to them as a client, not as
  our managers.

## The "FDE lens": what good thinking looks like

```mermaid
flowchart LR
  S["SEE<br/>understand the system<br/>15%"] --> D["DECONSTRUCT<br/>name the real problem<br/>20%"]
  D --> R["REFRAME<br/>design the outcome<br/>20%"]
  R --> B["BUILD<br/>a working slice<br/>20%"]
  B --> P["PROVE<br/>show the evidence<br/>20%"]
  P --> C["CUSTOMER STORY<br/>tie it together<br/>5%"]
```

**What this shows, using our problem as the example**
- **See:** we mapped how an order travels, from the client's email to the truck and the doorstep.
- **Deconstruct:** the data shows five different reasons for late deliveries, not one.
- **Reframe:** leadership asked for "a routing engine". We say "fix the five causes, starting with
  the three cheap ones".
- **Build:** DeliveryLens, a working app.
- **Prove:** on-time delivery goes from 71% toward 96.6% in the data, cause by cause.
- **Customer story:** "Here is why you were about to spend $680K on the wrong fix."

## The presentation (30 minutes)

```mermaid
flowchart LR
  P1["1 Discovery insights<br/>& the key problem"] --> P2["2 Solution &<br/>architecture"] --> P3["3 AI agents used"] --> P4["4 Quality, validation<br/>& security"] --> P5["5 Metrics &<br/>business impact"] --> P6["6 Future scope"]
  P7["7 Live demo<br/>(can go anywhere)"] -.-> P1
```

**What this shows**
- 20 minutes of talk and demo, then 10 minutes of questions.
- These seven sections are compulsory, in this order. The live demo can sit anywhere.
- At least one team member must present.
