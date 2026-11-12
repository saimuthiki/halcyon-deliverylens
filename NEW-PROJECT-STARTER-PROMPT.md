# Starter prompt for a new business-solution project (Claude Code)

What this is: every GitHub repository, plugin, skill, agent source and website used to set up Claude Code
for the Halcyon DeliveryLens hackathon (EvoHack 2026), in one place, plus a ready prompt to reuse them.

Where it comes from: `local-archive/tools/fde-toolkit/` in this repo (`repos.tsv`, `plugins.tsv`,
`curated-skills.tsv`, `skill-index.tsv`, `README.md`, `config/`) and the `.provenance` file in each
`.claude/skills/<name>/` folder. The very first chat message itself was not saved, so this file is
rebuilt from those lists. Nothing here is guessed: every repo and site below appears in those files.

How to use it:
1. Start a new Claude Code session in an empty project folder.
2. Copy everything inside "THE PROMPT" below, fill in the two `<...>` lines, and send it.
3. Claude sets up the toolkit first, then works on the business problem stage by stage.

---

## THE PROMPT (copy from here)

```text
I am starting a new business-solution project with Claude Code.
Business problem: <describe the client, the problem, and the data/documents you have>
Deadline and deliverables: <e.g. working app on AWS + pitch deck + demo video, in N days>

STEP 1. Set up the toolkit before any project work. Rules:
- Do NOT install everything. Every active skill costs context and overlapping skills fight.
  Keep about 90 curated skills active; keep the rest searchable in a local "vault" only.
- Before installing any skill, vet its scripts: grep for pipe-to-shell, outbound POSTs, eval,
  telemetry and credential access. Skip anything risky and tell me.
- Write a `.provenance` file in every installed skill folder: source repo, path, commit, stage.
- Only use approved AI tools (Claude). Skip anything that routes traffic to other model providers.
- Ask me before installing plugins, MCP servers or anything that needs an API key or account.

1a. Clone these repos into a vault (~/.claude/skill-vault/) and build a searchable index
    (kind, name, source_repo, path, description) of every skill, agent and command:
    anthropics/skills, anthropics/claude-plugins-official, obra/superpowers, obra/superpowers-lab,
    addyosmani/agent-skills, mattpocock/skills, multica-ai/andrej-karpathy-skills,
    OthmanAdi/planning-with-files, garrytan/gstack, DietrichGebert/ponytail,
    affaan-m/everything-claude-code, Yeachan-Heo/oh-my-claudecode, coleam00/Archon, wshobson/agents,
    msitarzewski/agency-agents, alirezarezvani/claude-skills, davila7/claude-code-templates,
    ComposioHQ/awesome-claude-skills, saimuthiki/claude_skills_mastery, Shubhamsaboo/awesome-llm-apps,
    mhattingpete/claude-skills-marketplace, nextlevelbuilder/ui-ux-pro-max-skill, numman-ali/openskills,
    shareAI-lab/learn-claude-code, shanraisshan/claude-code-best-practice,
    x1xhlol/system-prompts-and-models-of-ai-tools, BehiSecc/awesome-claude-skills,
    travisvn/awesome-claude-skills, punkpeye/awesome-mcp-servers, thedotmack/claude-mem,
    Obidel/Agentmemory, colbymchenry/codegraph, Graphify-Labs/graphify, yamadashy/repomix,
    upstash/context7, steveyegge/beads, multica-ai/multica, BloopAI/vibe-kanban, firecrawl/firecrawl,
    github/github-mcp-server, microsoft/playwright-mcp, oraios/serena, farion1231/cc-switch,
    musistudio/claude-code-router, udeope/codex-plugin-cc, jarrodwatts/claude-hud, rtk-ai/rtk,
    headroomlabs-ai/headroom, JuliusBrussee/caveman, Leonxlnx/taste-skill
    Later additions: pbakaus/impeccable, latent-spaces/brag (brag-slim), secondsky/claude-skills
    (motion), freshtechbro/claudedesignskills (motion-framer), microsoft/playwright-cli.

1b. Copy the curated skills into .claude/skills/, grouped by stage (list in the appendix of
    NEW-PROJECT-STARTER-PROMPT.md, or curated-skills.tsv).
1c. Copy agent personas from msitarzewski/agency-agents into .claude/agents/ (product, design,
    engineering, quality/security, business; about 43). Then write 3 project agents of our own:
    dev-agent, devops-agent, qa-agent, each with role, scope, inputs, outputs and guardrails.
1d. Write 6 stage skills of our own: /fde-intake, /fde-discover, /fde-design, /fde-build,
    /fde-ship, /fde-pitch, each with an entry and exit gate.
1e. Add the context7 and playwright MCP servers to the project config. Offer (don't force) the
    plugins in plugins.tsv. Write a README listing all repos with ADOPT / OPTIONAL / SKIP and why.

STEP 2. Work the problem in 5 stages, with my approval at each gate:
Discover -> Design -> Build -> Test & Deploy -> Pitch.
Working rules:
- Interview me before building (grill-me / interview-me). Draft the stakeholder questions.
- Spec triad with approval gates: requirements -> design -> tasks.
- Thin vertical slices; a walking skeleton deployed early.
- One subagent per task, then a fresh-context review (spec compliance + code quality).
- Plans and progress on disk: keep PROJECT-PROGRESS.md and CLAUDE.md up to date every session,
  with a dated change-log line.
- Tests before every push; evidence (tests, screenshots, URLs) before saying "done".
- Docs from source (context7 / find-docs), not memory.
- Design tokens, 3-5 colours, max 2 fonts (DESIGN.md).
- In the product: "AI reads, rules decide, a person approves"; log every AI call.
- Never read, print or commit secrets (.env, keys, .pem). Confirm before costly or outward actions.
- Keep replies short, plain English, with emoji markers for decisions (✅ ❓ ⚠️ 🚀 ❌).

Start with STEP 1 and show me the plan before installing anything.
```

## (end of prompt)

---

## Appendix A. All repositories, what they are and how we used them

ADOPT = used. OPTIONAL = install on demand. SKIP = deliberately not used. Vault = indexed only.

| Repo | What it is | Verdict |
|---|---|---|
| anthropics/skills | Official skills (frontend-design, webapp-testing, docs) | ADOPT |
| anthropics/claude-plugins-official | Official plugin directory | ADOPT (plugins) |
| obra/superpowers | Brainstorm → plan → subagent TDD → review | ADOPT (12 skills) |
| obra/superpowers-lab | Experimental extras | SKIP |
| addyosmani/agent-skills | Define → plan → build → verify → ship | ADOPT (15 skills) |
| mattpocock/skills | grill-me, to-spec, to-tickets, handoff | ADOPT (8 skills) |
| multica-ai/andrej-karpathy-skills | 4 coding rules | ADOPT |
| OthmanAdi/planning-with-files | Plans and progress on disk | ADOPT |
| garrytan/gstack | "Virtual eng team" (/office-hours, /plan-ceo-review) | OPTIONAL (needs bun) |
| DietrichGebert/ponytail | "Lazy senior dev" reuse review | OPTIONAL |
| affaan-m/everything-claude-code | Mega harness (311 skills) | Cherry-pick (3) |
| Yeachan-Heo/oh-my-claudecode | Autopilot, /deep-interview | OPTIONAL |
| coleam00/Archon | YAML workflow engine | SKIP |
| wshobson/agents | 94 plugins | Cherry-pick (3 skills + plugins) |
| msitarzewski/agency-agents | 300+ agent personas | ADOPT (agents) |
| alirezarezvani/claude-skills | Product, C-level, engineering skills | ADOPT (~30 skills) |
| davila7/claude-code-templates (aitmpl.com) | ~1,900 components | Cherry-pick (3) |
| ComposioHQ/awesome-claude-skills | Skills list + app connectors | Vault only (no licence) |
| saimuthiki/claude_skills_mastery | Your own aggregated mirror (38 domains) | Vault |
| Shubhamsaboo/awesome-llm-apps | LLM app examples + agent_skills | Cherry-pick (thinking-out-loud) |
| mhattingpete/claude-skills-marketplace | Diagram, flowchart, dashboard, timeline creators | ADOPT |
| nextlevelbuilder/ui-ux-pro-max-skill | Design intelligence DB | ADOPT |
| Leonxlnx/taste-skill | Anti-slop frontend art direction | ADOPT |
| numman-ali/openskills | Skill loader for Cursor/Copilot | OPTIONAL |
| shareAI-lab/learn-claude-code | Build-your-own-agent course | SKIP (reference) |
| shanraisshan/claude-code-best-practice | 83 practices | ADOPT (practices) |
| x1xhlol/system-prompts-and-models-of-ai-tools | Leaked system prompts | Read-only, never copy |
| BehiSecc/awesome-claude-skills | Curated list | Reference |
| travisvn/awesome-claude-skills | Curated list | Reference |
| punkpeye/awesome-mcp-servers | MCP list | Reference |
| upstash/context7 | Current library docs (find-docs + MCP) | ADOPT |
| microsoft/playwright-mcp | Browser automation MCP | ADOPT |
| github/github-mcp-server | GitHub MCP | ADOPT if on GitHub |
| yamadashy/repomix | Pack a repo for AI | ADOPT |
| Graphify-Labs/graphify | Knowledge graph of code and docs | OPTIONAL |
| colbymchenry/codegraph | Code graph MCP | OPTIONAL |
| oraios/serena | Code-aware MCP tools | Listed (mcp-tools) |
| steveyegge/beads | Task tracker for agents | OPTIONAL |
| multica-ai/multica | Agents as issue-board assignees | OPTIONAL |
| thedotmack/claude-mem | Cross-session memory | SKIP (records tool output) |
| Obidel/Agentmemory | Memory UI + MCP | SKIP (unverified) |
| firecrawl/firecrawl | Web scraping API | SKIP (AGPL, paid key) |
| farion1231/cc-switch | Route Claude Code to other providers | SKIP (non-approved models) |
| musistudio/claude-code-router | Route to other providers | SKIP (non-approved models) |
| udeope/codex-plugin-cc | Review via OpenAI Codex | SKIP (not approved) |
| BloopAI/vibe-kanban | Agent kanban | SKIP (sunsetting) |
| jarrodwatts/claude-hud | Status line: context, agents, todos | ADOPT (laptop) |
| rtk-ai/rtk | Shell-output compression | OPTIONAL |
| headroomlabs-ai/headroom | Context-compression proxy | SKIP (MITM proxy) |
| JuliusBrussee/caveman | Terse mode | ADOPT (skill only) |
| pbakaus/impeccable | UI design / polish / animate | ADOPT (added later) |
| latent-spaces/brag | /brag-slim launch video | ADOPT (added later) |
| secondsky/claude-skills | motion skill | ADOPT (added later) |
| freshtechbro/claudedesignskills | motion-framer skill | ADOPT (added later) |
| microsoft/playwright-cli | playwright-cli skill | ADOPT (added later) |

Also used, installed at user level (not from the lists above): Cloudflare's `security-audit` skill and the
AWS agent skills (`amazon-bedrock`, `aws-iam`, `aws-cdk`, … in `~/.claude/skills/`).

## Appendix B. Plugins offered (plugin@marketplace)

feature-dev, pr-review-toolkit, security-guidance, commit-commands, claude-md-management, playground
(@claude-plugins-official) · document-skills@anthropic-agent-skills · superpowers · agent-skills (addyosmani)
· mattpocock-skills · andrej-karpathy-skills · planning-with-files · ui-ux-pro-max · taste-skill · context7
· product-skills, pm-skills, c-level-skills, code-to-prd, demo-video (alirezarezvani) ·
full-stack-orchestration, startup-business-analyst, c4-architecture, tdd-workflows, llm-application-dev,
agent-teams (wshobson) · visual-documentation-skills (mhattingpete) · repomix-commands · claude-hud · caveman

MCP servers: context7 (`npx -y @upstash/context7-mcp@latest`), playwright (`npx -y @playwright/mcp@latest --headless --isolated`).
MCP shortlist for enterprise apps: markitdown-mcp, playwright, github, supabase-mcp, genai-toolbox / postgres-mcp,
mcp-atlassian, Azure MCP / awslabs MCP, mcp-mermaid / mcp-server-chart, excel-mcp-server.

## Appendix C. Curated skills by stage

- **Our stage skills:** fde-intake · fde-discover · fde-design · fde-build · fde-ship · fde-pitch
- **Meta:** karpathy-guidelines · planning-with-files · dispatching-parallel-agents · subagent-driven-development · context-engineering · handoff · caveman · find-docs · repomix-explorer · claude-md-improver
- **Discover:** brainstorming · grill-me · grill-with-docs · interview-me · idea-refine · to-questionnaire · requirements-clarity · thinking-out-loud · roast · product-discovery · ux-researcher-designer · process-mapper · meeting-analyzer · market-research · competitive-teardown · domain-modeling · product-lens · devil
- **Design:** product-strategist · product-manager-toolkit · spec-driven-development · to-spec · to-tickets · writing-plans · planning-and-task-breakdown · api-and-interface-design · documentation-and-adrs · senior-architect · tech-stack-evaluator · database-designer · rag-architect · agent-designer · agent-workflow-designer · experiment-designer · c4-architecture · ui-ux-pro-max · taste-skill · frontend-design · architecture-diagram-creator · flowchart-creator · impeccable
- **Build:** executing-plans · incremental-implementation · test-driven-development · prototype · senior-fullstack · frontend-ui-engineering · kpi-dashboard-design · dashboard-creator · systematic-debugging · using-git-worktrees · code-simplification · security-and-hardening · motion · motion-framer
- **Test & Deploy:** verification-before-completion · webapp-testing · requesting-code-review · receiving-code-review · doubt-driven-development · adversarial-reviewer · ship-gate · ci-cd-and-automation · shipping-and-launch · finishing-a-development-branch · observability-and-instrumentation · playwright-cli
- **Pitch:** ceo-advisor · cfo-advisor · cto-advisor · chief-ai-officer-advisor · executive-mentor · board-deck-builder · scenario-war-room · financial-analyst · market-sizing-analysis · sales-engineer · roadmap-communicator · data-storytelling · frontend-slides · ui-demo · demo-video · timeline-creator · brag-slim

The exact source path of each one is in `local-archive/tools/fde-toolkit/curated-skills.tsv`.

## Appendix D. Websites surveyed

| Site | Use |
|---|---|
| aitmpl.com | Catalog for claude-code-templates: `npx claude-code-templates@latest --skill/--agent/--mcp <cat>/<name>` |
| claude.com/plugins | Official plugin marketplace (@claude-plugins-official) |
| skills.sh | Vercel skills leaderboard: `npx skills add <owner/repo> --skill <name>` |
| claudeskills.info | Discovery only |
| claudeskills.club | Discovery only |
| openaitoolshub (skills map and blog) | Discovery only |
| mcpmarket (leaderboard) | Discovery only |
| skillsmp.com | Discovery only |
| chat2anyllm (catalog) | Discovery only |
| mcpservers.org/agent-skills | Was blocked (403) during the survey |

## Appendix E. 12 strategies we adopted

1. Interview before you build. 2. Spec triad with approval gates. 3. Vertical tracer-bullet slices.
4. Subagent per task with two-stage review. 5. Plans on disk. 6. Context hygiene (stay under ~40%,
compact with a focus hint). 7. Evidence before "done". 8. Fresh-context adversarial review.
9. Docs from source, not memory. 10. Design tokens and hard visual limits. 11. Anything done twice a
day becomes a skill. 12. Repeated mistakes become CLAUDE.md rules.

The ready-made tools from this project (install.sh, skill.sh, build_index.py, config/apply.py) are in
`local-archive/tools/fde-toolkit/`, so the new session can reuse them directly.
