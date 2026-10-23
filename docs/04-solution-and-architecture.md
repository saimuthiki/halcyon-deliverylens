# 4. Our solution and its architecture

**DeliveryLens** is a web app for Halcyon's leaders and teams. It:
1. shows **why** deliveries are late
2. **fixes** the causes with AI agents and simple rules
3. **proves** how much on-time delivery improves

Every diagram below is followed by a plain-English explanation.

---

## 4.1 What DeliveryLens does: one cause, one fix

```mermaid
flowchart LR
  subgraph CAUSE["What goes wrong (from the data)"]
    C1["Incomplete address<br/>−6.8 pts"]
    C2["Weak carrier on a lane<br/>−5.7 pts"]
    C3["Same-day order after 08:00<br/>−5.3 pts"]
    C4["Stock not at nearest warehouse<br/>−4.8 pts"]
    C5["Route deviation<br/>−3.0 pts"]
    C6["Client not told about delays<br/>12 of 34 complaints"]
  end
  subgraph FIX["What DeliveryLens does"]
    F1["Order Intake Agent (AI)<br/>reads the order, checks the address,<br/>asks the client for missing parts"]
    F2["Carrier Advisor<br/>best carrier for each region"]
    F3["Same-day Promise Check<br/>warns at intake, suggests next day<br/>or a second pick wave"]
    F4["Stock Placement view<br/>which regions run out most"]
    F5["Route Deviation watch<br/>the only part routing software fixes"]
    F6["Delay Alert Agent (AI)<br/>drafts a message to the client<br/>before they have to chase"]
  end
  C1 --> F1
  C2 --> F2
  C3 --> F3
  C4 --> F4
  C5 --> F5
  C6 --> F6
```

**What this shows:** every cause found in the data has its own fix, matching Swarna's
"different steps need different solutions".
- Example: an email order arrives without a postcode.
  1. The **Order Intake Agent** reads the email and spots the missing postcode.
  2. It drafts a short reply asking the client for it, before the order reaches the pick list.
  3. Today, that order would be on time only 35% of the time.

## 4.2 Who uses it (system context)

```mermaid
C4Context
  title System context: Halcyon DeliveryLens
  Person(coo, "COO / CFO", "Decides on the routing vendor; watches on-time %")
  Person(cs, "Customer success", "Handles email orders, complaints, client updates")
  Person(ops, "Warehouse & carrier managers", "Run pick lists and choose carriers")
  System(dl, "DeliveryLens", "Finds causes of late delivery, fixes them with AI, proves the impact")
  System_Ext(data, "Halcyon data", "Deliveries, clients, carriers, penalties, complaints (CSV export)")
  System_Ext(bedrock, "Amazon Bedrock", "Claude AI models")
  Rel(coo, dl, "Sees causes, vendor advice, what-if")
  Rel(cs, dl, "Checks orders, sends delay alerts, asks questions")
  Rel(ops, dl, "Uses carrier advice and cutoff warnings")
  Rel(dl, data, "Loads")
  Rel(dl, bedrock, "Calls AI agents", "HTTPS")
```

**What this shows**
- Three groups of people use DeliveryLens:
  - **leaders** look at the big picture and the vendor decision
  - **customer success** uses the AI agents every day
  - **operations** follow the carrier and cutoff advice
- DeliveryLens reads Halcyon's data and calls Claude through Amazon Bedrock.

## 4.3 The parts of the system (containers)

```mermaid
C4Container
  title Containers: Halcyon DeliveryLens
  Person(user, "User", "Leader, CS or operations")
  System_Boundary(dl, "DeliveryLens") {
    Container(web, "Web app", "React + TypeScript", "Dashboards, simulator, agent screens")
    Container(api, "API", "Python FastAPI", "Analytics, simulator, agents, guardrails")
    ContainerDb(db, "Database", "PostgreSQL", "Deliveries, clients, carriers, agent runs")
    Container(files, "File store", "Amazon S3", "Raw dataset, uploaded emails, reports")
  }
  System_Ext(ai, "Amazon Bedrock", "Claude models")
  Rel(user, web, "Uses", "HTTPS")
  Rel(web, api, "Calls", "JSON/HTTPS")
  Rel(api, db, "Reads and writes", "SQL")
  Rel(api, files, "Stores files", "S3 API")
  Rel(api, ai, "Asks AI", "Bedrock Converse API")
```

**What this shows:** the system has four parts.
- **Web app:** what people click on.
- **API:** the brain. It does the maths and runs the AI agents.
- **Database:** where the 48,340 deliveries and every AI call are stored.
- **File store:** keeps the original files.

The API is the only part that talks to the AI.

## 4.4 Where each AWS service is used

```mermaid
flowchart TB
  U(["Judges / users<br/>(browser)"]) -->|HTTPS| AMP
  subgraph AWS["AWS account (the 9 services we requested)"]
    AMP["AWS Amplify<br/>hosts the React web app<br/>rebuilds on every GitHub push"]
    subgraph EC2B["Amazon EC2 (one t3.large server)"]
      CAD["Caddy<br/>HTTPS front door"]
      API["FastAPI container<br/>analytics + agents"]
    end
    RDS[("Amazon RDS<br/>PostgreSQL<br/>all the data")]
    S3[("Amazon S3<br/>dataset, emails,<br/>reports, evidence")]
    BR["Amazon Bedrock<br/>Claude models<br/>(the AI)"]
    SM["AWS Secrets Manager<br/>passwords and settings"]
    CW["Amazon CloudWatch<br/>logs, alarms, dashboard"]
    ECR["Amazon ECR<br/>stores the API container image"]
    IAM["AWS IAM<br/>who may do what<br/>(least privilege)"]
  end
  GH["GitHub<br/>code + Actions"] -->|"build & push image"| ECR
  GH -->|"auto-deploy web app"| AMP
  AMP -->|"/api calls over HTTPS"| CAD --> API
  ECR -->|"docker pull"| API
  API --> RDS
  API --> S3
  API --> BR
  API --> SM
  API -->|logs| CW
  IAM -.->|"permissions for EC2,<br/>GitHub and Bedrock"| API
```

**What this shows, one service at a time**

| AWS service | Job in DeliveryLens | Example |
|---|---|---|
| **Amplify** | Hosts the website | The judges open `https://main.<id>.amplifyapp.com` |
| **EC2** | Runs our API in a Docker container | One server; Caddy adds HTTPS |
| **ECR** | Keeps the API container image | GitHub builds the image, EC2 pulls it |
| **RDS (PostgreSQL)** | Stores the data and the AI logs | 48,340 deliveries, 280 clients, every agent run |
| **S3** | Stores files | The original dataset, uploaded emails, generated reports |
| **Bedrock** | The AI | Claude reads an email order and finds the missing postcode |
| **Secrets Manager** | Keeps passwords out of the code | Database password, demo login |
| **CloudWatch** | Watches the app | Error logs, an alarm if the API stops |
| **IAM** | Controls access | The EC2 server may call Bedrock but cannot delete S3 data |

## 4.5 When each AWS service comes in (phases)

```mermaid
flowchart LR
  subgraph P1["Phase 1 · Build locally<br/>Fri 23 – Sun 25"]
    L1["Laptops + Docker<br/>local Postgres<br/>AI in 'mock' mode<br/>(Bedrock if keys exist)"]
  end
  subgraph P2["Phase 2 · Foundation<br/>Mon 26 morning"]
    A1["IAM roles"] --> A2["S3 bucket"] --> A3["ECR repo"] --> A4["Secrets Manager"] --> A5["RDS PostgreSQL"]
  end
  subgraph P3["Phase 3 · Go live<br/>Mon 26 afternoon"]
    B1["EC2 + Docker + Caddy"] --> B2["Amplify web app"] --> B3["Bedrock switched on"]
  end
  subgraph P4["Phase 4 · Automate & watch<br/>Tue 27"]
    C1["GitHub Actions CI/CD"] --> C2["CloudWatch logs, alarms, dashboard"]
  end
  subgraph P5["Phase 5 · Harden & prove<br/>Wed 28"]
    D1["IAM least-privilege review<br/>security groups, encryption"] --> D2["Evidence pack<br/>+ demo rehearsals"]
  end
  P1 --> P2 --> P3 --> P4 --> P5 --> SUB[["Thu 29: submit"]]
```

**What this shows**
- We build and test everything on laptops first; AWS arrives Monday 26.
- On Monday we create the basic AWS pieces (IAM, S3, ECR, Secrets Manager, RDS), then put the app
  online (EC2, Amplify, Bedrock).
- Tuesday adds automatic deployment and monitoring; Wednesday is for security and proof.
- Example: on Monday afternoon we switch the setting `LLM_PROVIDER=mock` to `bedrock`, and the
  same Order Intake Agent starts using real Claude.

## 4.6 How a request flows (data flow)

```mermaid
flowchart LR
  CSV["Dataset CSVs<br/>(data/halcyon-dataset)"] -->|"loader (one command)"| DB[("PostgreSQL")]
  DB --> TAG["Tag each delivery<br/>with the 5 causes"]
  TAG --> CALC["Calculate:<br/>on-time %, fair share per cause,<br/>what-if, vendor assessment"]
  CALC --> APIR["API answers<br/>(/api/causes, /api/simulate ...)"]
  APIR --> UI["Web app charts"]
  EM["Email order pasted<br/>or uploaded"] --> G1["Guardrails:<br/>hide personal data,<br/>block prompt tricks"] --> AG["AI agent<br/>(Claude on Bedrock)"] --> CHK["Rule checks:<br/>address complete?<br/>same-day after 08:00?"] --> UI
  AG --> LOG[("agent_runs log<br/>every AI call recorded")]
```

**What this shows**
- **Top row, the numbers:** we load the CSVs, tag each delivery with its causes, and calculate
  the results. The maths is plain Python, so the same data always gives the same number.
- **Bottom row, the AI:** text such as an email order passes through guardrails, then to Claude.
  The answer is checked by simple rules, and every AI call is recorded.
- Example: Claude extracts "ship to: 12 Harbor Rd, Savannah" and a rule notices the postcode is
  missing, so the order is flagged "incomplete address" before it is picked.

## 4.7 The AI agents inside the product

```mermaid
sequenceDiagram
  autonumber
  actor CS as Customer success
  participant UI as Web app
  participant API as API (EC2)
  participant GR as Guardrails
  participant AI as Claude (Bedrock)
  participant DB as PostgreSQL
  CS->>UI: Paste an email order
  UI->>API: POST /api/agents/order-intake
  API->>GR: Remove personal data from the log,<br/>check for prompt tricks
  API->>AI: "Extract client, items, address, date"
  AI-->>API: Structured order (JSON)
  API->>API: Rules: missing address fields?<br/>same-day after 08:00?
  API->>DB: Save agent run (model, time, tokens)
  API-->>UI: Order + warnings + draft reply to client
  CS->>UI: Review, then send the reply
```

**What this shows:** the life of one AI call, using the Order Intake Agent as the example. AI
does the reading; simple rules do the checking; a person approves before anything goes to a client.

| Agent | What it does | Example |
|---|---|---|
| **Order Intake Agent** | Reads an email order, finds missing address parts, flags same-day-after-08:00 | "Postcode missing. Draft: 'Please confirm the postcode for order ORD-1234.'" |
| **Delay Alert Agent** | Writes a message to the client before they chase | "Your order D012345 will arrive 1 day late because the nearest warehouse ran out; it ships from W2 today." |
| **Ask DeliveryLens** | Answers leaders' questions with numbers from our analysis | "Which carrier is worst in the Southeast?" → "Carrier F, 53% on time (A is 75%)." |

**Safety rules for all agents:**
- AI never calculates the KPIs; the code does.
- Personal data is hidden in the logs, and prompt-injection attempts are blocked.
- A person approves every message before it goes out.
- Every call is logged.

## 4.8 The screens

```mermaid
flowchart TB
  NAV["Left menu"] --> S1["Overview<br/>71% vs 94%, money at risk"]
  NAV --> S2["Why late<br/>waterfall of the 5 causes,<br/>click → example deliveries"]
  NAV --> S3["Vendor decision<br/>routing only 78.6% vs<br/>our fixes 96.6%"]
  NAV --> S4["What-if simulator<br/>sliders per fix → new on-time %"]
  NAV --> S5["Carriers<br/>carrier × region heatmap,<br/>best carrier per region"]
  NAV --> S6["At-risk clients<br/>the 9 clients, $14.2M"]
  NAV --> S7["Order intake agent<br/>paste email → checked order"]
  NAV --> S8["Ask DeliveryLens<br/>questions in plain English"]
  NAV --> S9["Agent activity<br/>log of every AI call"]
```

**What this shows:** the nine screens.
- **Leaders** mostly use the first four: overview, why late, vendor decision, simulator.
- **Teams** use carriers, at-risk clients, order intake and ask.
- **Agent activity** is our evidence for the judges.

## 4.9 Security in one picture

```mermaid
flowchart LR
  I["Internet"] -->|"HTTPS only"| AMP["Amplify"]
  I -->|"HTTPS 443 only"| EC2["EC2: Caddy → API"]
  EC2 -->|"5432, only from EC2"| RDS[("RDS: not public,<br/>encrypted")]
  EC2 -->|"instance role:<br/>Bedrock, S3 bucket,<br/>one secret, logs"| AWSAPI["AWS APIs"]
  SM["Secrets Manager"] -.->|"DB password, login"| EC2
  GR["Guardrails in the API:<br/>PII hidden, injection blocked,<br/>human approval"] -.-> EC2
```

**What this shows**
- Only HTTPS is open to the internet.
- The database can't be reached from outside; only our server can talk to it.
- The server has exactly the AWS permissions it needs and no more.
- Passwords live in Secrets Manager, not in the code.
- The AI has guardrails, and a person approves every client message.
- We use only the synthetic hackathon data, no real personal data.

## 4.10 Main design choices (and why)

| Choice | Why, in one line |
|---|---|
| One EC2 server running Docker | It is one of the services we requested, and it runs the same way on a laptop and in AWS |
| Amplify for the website | Requested; free HTTPS; deploys itself from GitHub |
| PostgreSQL on RDS | 48k rows is small; SQL is enough; requested |
| Maths in plain Python, AI only for reading and writing text | Numbers are always correct and repeatable; the AI cannot invent a KPI |
| Claude through Bedrock | Data stays in AWS; no API keys; requested |
| "Mock" AI mode | The app works and tests pass even before Bedrock access arrives |
| Caddy for HTTPS on EC2 | Browsers block an HTTPS page from calling a plain HTTP API; Caddy fixes this with no domain needed (`<ip>.sslip.io`) |
