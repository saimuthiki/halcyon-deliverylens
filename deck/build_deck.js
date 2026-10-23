// Builds deck/DeliveryLens-pitch.pptx in the organisers' 7-section order.
// Run from the repo root:  node deck/build_deck.js
// Numbers come from analysis/output/findings.json (re-run the analysis to refresh them).
const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");

const ROOT = path.resolve(__dirname, "..");
const F = JSON.parse(fs.readFileSync(path.join(ROOT, "analysis/output/findings.json"), "utf8"));
const SHOT = (n) => path.join(ROOT, "docs/screenshots", n);
const ASSET = (n) => path.join(__dirname, "assets", n);
const OUT = path.join(__dirname, "DeliveryLens-pitch.pptx");
const APPLY_THEME = process.env.PPTX_APPLY_THEME; // path to the pptx skill's scripts/apply_theme.js (optional)

const THEME = {
  name: "DeliveryLens",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "15212B", lt1: "FFFFFF", dk2: "0E6B63", lt2: "F3F5F4",
    accent1: "0E6B63", accent2: "A84F0B", accent3: "5E6B75", accent4: "15212B",
    accent5: "7FB7B0", accent6: "E6A671", hlink: "0E6B63", folHlink: "5E6B75",
  },
};
const HEX = THEME.colors;
// Fit an image inside a w x h box, keeping its aspect ratio (reads PNG width/height from the header).
function fit(file, x, y, w, h) {
  const buf = fs.readFileSync(file);
  const iw = buf.readUInt32BE(16), ih = buf.readUInt32BE(20);
  const scale = Math.min(w / iw, h / ih);
  return { path: file, x, y, w: iw * scale, h: ih * scale };
}
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const usd = (x) => (x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : `$${Math.round(x / 1e3)}K`);

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
pres.author = "Team InfinityStacks";
pres.title = "Halcyon DeliveryLens";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

const footer = { text: "Halcyon DeliveryLens · Team InfinityStacks · EvoHack 2026", options: { x: 0.6, y: 7.0, w: 9, h: 0.3, fontSize: 10, color: C.accent3 } };

pres.defineSlideMaster({
  title: "TITLE_DARK",
  background: { color: HEX.dk1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.2, w: 11.7, h: 1.4, fontSize: 48, bold: true, color: C.background1, fontFace: THEME.headFontFace }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.7, w: 11.7, h: 1.6, fontSize: 22, color: C.accent5 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "SECTION",
  background: { color: HEX.dk2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.6, w: 11.7, h: 1.2, fontSize: 40, bold: true, color: C.background1 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.8, w: 11.7, h: 1.0, fontSize: 20, color: C.background2 }, text: "" } },
  ],
  slideNumber: { x: 12.3, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: C.background2 },
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: HEX.lt1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.9, fontSize: 32, bold: true, color: C.text1 }, text: "" } },
    { text: footer },
  ],
  slideNumber: { x: 12.3, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: C.accent3 },
});

let section = "";
function slide(master, title) {
  const s = pres.addSlide({ masterName: master, sectionTitle: section });
  s.addText(title, { placeholder: "title" });
  return s;
}
function sectionStart(title, subtitle) {
  section = title;
  pres.addSection({ title });
  const s = slide("SECTION", title);
  s.addText(subtitle, { placeholder: "body" });
  return s;
}
function stat(s, x, y, w, big, label, color, name) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 1.6, fill: { color: HEX.lt2 }, line: { color: HEX.lt2 }, rectRadius: 0.08, objectName: `${name}-card` });
  s.addText(big, { x: x + 0.25, y: y + 0.15, w: w - 0.5, h: 0.8, fontSize: 36, bold: true, color, margin: 0, isTextBox: true, objectName: `${name}-value` });
  s.addText(label, { x: x + 0.25, y: y + 0.95, w: w - 0.5, h: 0.55, fontSize: 14, color: C.accent3, margin: 0, isTextBox: true, objectName: `${name}-label` });
}
function bullets(s, items, opts) {
  s.addText(items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1 } })),
    { fontSize: 16, color: C.text1, paraSpaceAfter: 8, valign: "top", isTextBox: true, ...opts });
}
const chartText = { catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt", titleFontFace: "+mn-lt" };
const causes = [...F.causes].sort((a, b) => b.fair_share_points - a.fair_share_points);
const scenarios = [["Today", F.on_time_rate_today], ["Routing vendor only", F.on_time_if_only_routing_fixed], ["Our 3 process fixes", F.on_time_if_only_process_fixed], ["All 5 fixes", F.on_time_if_all_fixed]];

// ---------- 0. Title ----------
section = "Opening";
pres.addSection({ title: section });
{
  const s = slide("TITLE_DARK", "Halcyon DeliveryLens");
  s.addText("Why 29% of deliveries are late, and why the $680K routing engine is not the main fix", { placeholder: "body" });
  s.addText("Team InfinityStacks · Sravan Kumar D · Sai M · Dinesh K · EvoHack 2026, Problem 2", { x: 0.8, y: 6.3, w: 11.7, h: 0.5, fontSize: 16, color: C.background2, isTextBox: true });
  s.addNotes("Open as advisers to Halcyon's COO and CFO. One sentence: before you sign the routing contract, here is what the data says.");
}

// ---------- 1. Discovery insights & the key problem ----------
sectionStart("1 · Discovery insights & the key problem", "What we were told, what we asked, what the data says");
{
  const s = slide("CONTENT", "The brief: \"routing is broken, sign the vendor\"");
  stat(s, 0.6, 1.5, 2.9, pct(F.on_time_rate_today), "On-time today (benchmark 94%)", C.accent2, "otd");
  stat(s, 3.7, 1.5, 2.9, "34", "Formal complaints in 90 days", C.accent2, "complaints");
  stat(s, 6.8, 1.5, 2.9, "$14.2M", "Annual revenue at risk (9 clients)", C.accent2, "risk");
  stat(s, 9.9, 1.5, 2.8, "$680K", "Routing vendor budget, 2 weeks to sign", C.text1, "vendor");
  bullets(s, [
    "Leadership's view: carrier routing and selection is inefficient; a smarter routing engine will fix on-time delivery and stop churn",
    "The stakeholder's warning (Swarna): don't assume. Map the whole chain, find where lateness really starts, prove each fix with numbers",
    "Our job as FDEs: establish what is really happening, with evidence, before the contract is signed",
  ], { x: 0.6, y: 3.5, w: 12.1, h: 3.0 });
  s.addNotes("Discovery: we asked 12 data-driven questions through the L&D log (docs/working). Main reframe: lateness starts before the truck.");
}
{
  const s = slide("CONTENT", "Five causes explain the gap, not one");
  s.addChart(pres.charts.BAR, [{ name: "Points lost", labels: causes.map((c) => c.label), values: causes.map((c) => c.fair_share_points) }], {
    x: 0.6, y: 1.4, w: 7.4, h: 5.3, barDir: "bar", chartColors: [HEX.accent2], showValue: true, dataLabelPosition: "outEnd",
    dataLabelFormatCode: "0.0", dataLabelColor: HEX.dk1, dataLabelFontSize: 12, catAxisLabelColor: HEX.dk1, catAxisLabelFontSize: 12,
    valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" }, showLegend: false,
    showTitle: true, title: "On-time points lost to each cause (fair share)", titleFontSize: 14, titleColor: HEX.dk1, catAxisOrientation: "maxMin", ...chartText,
  });
  stat(s, 8.4, 1.5, 4.3, pct(F.on_time_rate_with_no_problem), "On-time for deliveries with none of the 5 problems (already above 94%)", C.accent1, "clean");
  bullets(s, [
    `${F.deliveries.toLocaleString()} deliveries, Apr–Sep 2026; causes found by tagging every delivery`,
    "Holds on unseen months: rules picked on Apr–Jun give 96.3% on Jul–Sep",
    "Biggest single cause: incomplete addresses, 28% of email orders",
  ], { x: 8.4, y: 3.4, w: 4.3, h: 3.2, fontSize: 15 });
  s.addNotes("Fair share = Shapley split, so overlapping causes are not double counted. The five sum from 71.0% to 96.6%.");
}

// ---------- 2. Solution approach & architecture ----------
sectionStart("2 · Solution approach & architecture", "One fix per cause, on AWS");
{
  const s = slide("CONTENT", "DeliveryLens: one fix for each cause");
  const rows = [
    ["Cause (points lost)", "Fix in DeliveryLens"],
    ["Incomplete address (6.8)", "Order Intake Agent reads the order, flags missing fields, drafts a request to the client"],
    ["Weak carrier on a lane (5.7)", "Carrier Advisor: best carrier per region (e.g. not F to the Southeast)"],
    ["Same-day after 08:00 (5.3)", "Promise check at intake: next-day or second pick wave"],
    ["Stock not at nearest warehouse (4.8)", "Stock placement view: regions that run out most"],
    ["Route deviation (3.0)", "Route deviation watch: the part routing software fixes"],
    ["\"Nobody told us\" (12 of 34 complaints)", "Delay Alert Agent drafts a proactive message, a person approves"],
  ];
  s.addTable(rows.map((r, i) => r.map((t) => ({ text: t, options: { bold: i === 0, color: i === 0 ? HEX.lt1 : HEX.dk1, fill: { color: i === 0 ? HEX.dk2 : i % 2 ? HEX.lt2 : HEX.lt1 } } }))),
    { x: 0.6, y: 1.4, w: 12.1, colW: [4.0, 8.1], fontSize: 15, rowH: 0.6, border: { type: "solid", color: HEX.lt2, pt: 1 }, valign: "middle" });
}
{
  const s = slide("CONTENT", "Architecture: only the 9 AWS services we requested");
  s.addImage({ ...fit(ASSET("aws-architecture.png"), 0.6, 1.3, 9.0, 5.5), objectName: "aws-diagram" });
  bullets(s, [
    "Amplify hosts the React web app",
    "EC2 runs the FastAPI container (image from ECR), HTTPS via Caddy",
    "RDS PostgreSQL holds data and every AI call",
    "Bedrock (Claude) powers the agents",
    "S3, Secrets Manager, CloudWatch, IAM least privilege",
  ], { x: 9.8, y: 1.5, w: 2.9, h: 5.0, fontSize: 14 });
}

// ---------- 3. AI agents used ----------
sectionStart("3 · AI agents used", "Inside the product, and across every role that built it");
{
  const s = slide("CONTENT", "AI agents inside DeliveryLens");
  const agents = [
    ["Order Intake Agent", "Reads an email order, finds the missing postcode, drafts the follow-up. Rules check the result."],
    ["Delay Alert Agent", "Tells the client before they chase: what is late, why, the new date. A person approves."],
    ["Ask DeliveryLens", "Leaders ask in plain English; answers quote the numbers from our analysis."],
  ];
  agents.forEach(([h, t], i) => {
    const y = 1.5 + i * 1.75;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y, w: 5.6, h: 1.5, fill: { color: HEX.lt2 }, line: { color: HEX.lt2 }, rectRadius: 0.08, objectName: `agent-${i}` });
    s.addText(h, { x: 0.85, y: y + 0.12, w: 5.1, h: 0.45, fontSize: 18, bold: true, color: C.accent1, margin: 0, isTextBox: true });
    s.addText(t, { x: 0.85, y: y + 0.58, w: 5.1, h: 0.85, fontSize: 14, color: C.text1, margin: 0, isTextBox: true });
  });
  s.addImage({ ...fit(SHOT("order-intake.png"), 6.6, 1.4, 6.1, 5.4), objectName: "order-intake-shot" });
  s.addNotes("Guardrails: PII redacted in logs, prompt injection blocked, AI never computes KPIs, every call logged in agent_runs.");
}
{
  const s = slide("CONTENT", "AI-first delivery: an agent in every role");
  s.addImage({ ...fit(ASSET("agent-pipeline.png"), 0.6, 1.5, 12.1, 1.3), objectName: "pipeline" });
  bullets(s, [
    "Business analyst: transcripts → assumptions and 12 discovery questions",
    "Data analyst: found and sized the 5 causes; holdout check",
    "Architect: C4 + AWS design · DevOps: AWS scripts, CI/CD",
    "Backend and frontend developer agents built in parallel; test agent wrote E2E tests",
    "Reality Checker reviewed the solution like a judge · every session logged in ai-logs/",
  ], { x: 0.6, y: 3.0, w: 12.1, h: 3.6 });
}

// ---------- 4. Quality, validation & security ----------
sectionStart("4 · Quality, validation & security", "Evidence, not claims");
{
  const s = slide("CONTENT", "Tested, validated and secured");
  stat(s, 0.6, 1.5, 2.9, "48", "Backend tests (numbers match the analysis exactly)", C.accent1, "be");
  stat(s, 3.7, 1.5, 2.9, "12", "Frontend tests + browser E2E on every screen", C.accent1, "fe");
  stat(s, 6.8, 1.5, 2.9, "96.3%", "Out-of-time check (Jul–Sep)", C.accent1, "hold");
  stat(s, 9.9, 1.5, 2.8, "0", "High-severity bandit findings", C.accent1, "sec");
  bullets(s, [
    "CI on every push: tests, security scan, and a re-run of the analysis that must reproduce 71.0% / 96.6%",
    "AI guardrails: personal data hidden in logs, prompt injection blocked, human approval before any client message",
    "AWS: HTTPS only, database not public, least-privilege IAM, secrets in Secrets Manager, synthetic data only",
  ], { x: 0.6, y: 3.5, w: 12.1, h: 3.0 });
}

// ---------- 5. Metrics & business impact ----------
sectionStart("5 · Metrics & business impact", "What each option buys Halcyon");
{
  const s = slide("CONTENT", "Routing alone: 78.6%. Fixing the causes: 96.6%");
  s.addChart(pres.charts.BAR, [{ name: "On-time %", labels: scenarios.map((x) => x[0]), values: scenarios.map((x) => +(x[1] * 100).toFixed(1)) }], {
    x: 0.6, y: 1.4, w: 7.6, h: 5.3, barDir: "col", chartColors: [HEX.accent2, HEX.accent3, HEX.accent5, HEX.accent1], invertedColors: [HEX.accent2],
    showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.0", dataLabelColor: HEX.dk1, dataLabelFontSize: 14,
    valAxisMinVal: 50, valAxisMaxVal: 100, valAxisLabelColor: HEX.accent3, catAxisLabelColor: HEX.dk1, catAxisLabelFontSize: 12,
    valGridLine: { color: HEX.lt2, size: 1 }, catGridLine: { style: "none" }, showLegend: false,
    showTitle: true, title: "On-time delivery % (industry benchmark 94%)", titleFontSize: 14, titleColor: HEX.dk1, ...chartText,
  });
  stat(s, 8.6, 1.5, 4.1, "$2.39M / yr", "Penalties + redelivery avoided if all 5 are fixed", C.accent1, "all");
  stat(s, 8.6, 3.3, 4.1, "$1.52M / yr", "From the 3 process fixes alone (no new software)", C.accent1, "proc");
  stat(s, 8.6, 5.1, 4.1, "$0.70M / yr", "From routing-related fixes (vs $680K budget)", C.accent3, "route");
  s.addNotes("Money = 6 months of penalties and redelivery costs x2, for late deliveries that become on time. Revenue protected (9 clients, $14.2M) comes on top.");
}
{
  const s = slide("CONTENT", "Our recommendation: don't sign as scoped, reshape it");
  const steps = [
    ["Weeks 1–4", "Fix the process causes", "Address check at intake, same-day promise rule or second pick wave, monthly stock rebalancing → about 87%"],
    ["Weeks 2–6", "Choose carriers by region", "Stop the 5 weak carrier–region pairs; no new software → most of the remaining gap"],
    ["Then", "Small routing pilot", "Only on lanes with high route deviation; measure before scaling → last ~3 points"],
  ];
  steps.forEach(([when, head, body], i) => {
    const x = 0.6 + i * 4.1;
    s.addShape(pres.shapes.OVAL, { x, y: 1.6, w: 0.7, h: 0.7, fill: { color: HEX.dk2 }, line: { color: HEX.dk2 }, objectName: `step-${i}` });
    s.addText(String(i + 1), { x, y: 1.6, w: 0.7, h: 0.7, fontSize: 20, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true });
    s.addText(when, { x: x + 0.85, y: 1.6, w: 3.0, h: 0.35, fontSize: 13, color: C.accent3, margin: 0, isTextBox: true });
    s.addText(head, { x: x + 0.85, y: 1.95, w: 3.0, h: 0.45, fontSize: 18, bold: true, color: C.text1, margin: 0, isTextBox: true });
    s.addText(body, { x, y: 2.6, w: 3.8, h: 1.8, fontSize: 15, color: C.text1, margin: 0, isTextBox: true });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 4.8, w: 12.1, h: 1.6, fill: { color: HEX.lt2 }, line: { color: HEX.lt2 }, rectRadius: 0.08, objectName: "target" });
  s.addText([
    { text: "Target: above 94% on time. ", options: { bold: true, color: HEX.dk2 } },
    { text: "Protects the $14.2M at risk and avoids ~$2.4M a year in penalties and redeliveries, while spending less than the $680K routing contract on the smallest cause." },
  ], { x: 0.85, y: 4.95, w: 11.6, h: 1.3, fontSize: 17, color: C.text1, valign: "middle", isTextBox: true });
}

// ---------- 6. Future scope ----------
sectionStart("6 · Future scope", "From hackathon slice to Halcyon rollout");
{
  const s = slide("CONTENT", "Next 90 days and beyond");
  bullets(s, [
    "Live feeds: WMS orders and carrier events (APIs for A–C; portal/batch for D–F) instead of CSV exports",
    "Order Intake Agent in the email inbox itself, before orders reach the pick list",
    "Daily at-risk shipment scoring and automatic delay alerts with approval",
    "Measure weekly: on-time %, penalties, complaints, for the 9 at-risk clients first",
    "Reusable for other Evoke logistics and manufacturing clients: same causes, same agents",
  ], { x: 0.6, y: 1.5, w: 7.2, h: 5.0 });
  s.addImage({ ...fit(SHOT("what-if.png"), 8.1, 1.4, 4.6, 5.4), objectName: "whatif-shot" });
}

// ---------- 7. Live demo ----------
sectionStart("7 · Live demo", "Running on AWS with Claude on Bedrock");
{
  const s = slide("CONTENT", "Demo path (6 minutes)");
  bullets(s, [
    "Overview: 71% today vs 96.6% possible",
    "Why late: waterfall → click a cause → open a delivery → Draft delay alert (AI)",
    "Vendor decision: routing only 78.6%",
    "Order intake: paste an email with a missing postcode → flagged + follow-up drafted (AI)",
    "What-if: switch on the 3 process fixes → about 87%",
    "Ask DeliveryLens: \"Which carrier is worst in the Southeast?\"",
  ], { x: 0.6, y: 1.5, w: 6.0, h: 5.2 });
  s.addImage({ ...fit(SHOT("overview.png"), 6.9, 1.4, 5.8, 5.4), objectName: "overview-shot" });
}
{
  const s = slide("TITLE_DARK", "Fix the five causes, not just the routes");
  s.addText(`71% → 96.6% on time · $2.4M a year in penalties and redeliveries avoided · $14.2M of revenue protected`, { placeholder: "body" });
}

pres.writeFile({ fileName: OUT }).then(async () => {
  if (APPLY_THEME) {
    const { applyTheme } = require(APPLY_THEME);
    await applyTheme(OUT, THEME);
  }
  console.log("wrote", OUT);
});
