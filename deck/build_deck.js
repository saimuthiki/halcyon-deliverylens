// Builds deck/DeliveryLens-pitch.pptx: a 15-slide, 20-minute jury deck in the panel's order
// (discovery and problem → solution → live demo → architecture → AI agents → quality and security →
// impact → what's new → what's next). Few words, big numbers, one idea per slide.
// Run from the repo root:  node deck/build_deck.js && python deck/add_animations.py
// (needs `npm ci` in deck/ once). The second step adds the click-by-click animations and slide fades:
// every shape named anim_<click>_<effect>_<n> appears on that click (effect f = fade, w = wipe from the left).
// Numbers come from analysis/output/findings.json; the rest from PROJECT-PROGRESS.md and docs/.
// Colours follow DESIGN.md (orange = problem, teal = fix, purple = AI, blue = data, wine = guardrail).
// Font: Barlow (free Google font). Install it on the presenting laptop, or PowerPoint will substitute.
const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");

const ROOT = path.resolve(__dirname, "..");
const F = JSON.parse(fs.readFileSync(path.join(ROOT, "analysis/output/findings.json"), "utf8"));
const ASSET = (n) => path.join(__dirname, "assets", n);
const OUT = process.argv[2] || path.join(__dirname, "DeliveryLens-pitch.pptx");
// Speaker notes come from deck/presentation-script.md: one "## Slide N · ..." section per slide.
const SCRIPT = (() => {
  const out = {};
  try {
    const md = fs.readFileSync(path.join(__dirname, "presentation-script.md"), "utf8");
    md.split(/^## /m).forEach((sec) => {
      const m = sec.match(/^Slide (\d+)[^\n]*\n([\s\S]*)/);
      if (m) out[+m[1]] = m[2].replace(/\*([^*\n]+)\*/g, "($1)").trim();
    });
  } catch (e) { console.warn("no presentation-script.md: slides get no speaker notes"); }
  return out;
})();

const C = {
  ink: "15212B", inkSoft: "3A4852", paper: "F3F5F4", white: "FFFFFF", line: "D9DFDD", slate: "5E6B75",
  route: "0E6B63", routeTint: "E3F1EE", late: "A84F0B", lateTint: "FBEEE2",
  ai: "5B47B0", aiTint: "EEEBF9", data: "2C5D8F", dataTint: "E5EEF7", guard: "8A2F4E", guardTint: "F8E8EE",
  onInk: "A9D8D1", mist: "C9D1D6",
};
const FONT = "Barlow";
const W = 13.333, H = 7.5;

const pct0 = (x) => `${Math.round(x * 100)}%`;
const usdK = (x) => `$${Math.round(x / 1e3).toLocaleString("en-US")}K`;
const usdM = (x) => `$${(x / 1e6).toFixed(2)}M`;
const S = Object.fromEntries(F.scenarios.map((x) => [x.name, x]));
// Pilot target (deck/target_scenario.py): how far each fix must work to pass the 94% benchmark.
const TG = JSON.parse(fs.readFileSync(path.join(__dirname, "target-scenario.json"), "utf8"));
const dl = TG.scenario, tool = S["Routing vendor only (ceiling)"];
const pts = Object.fromEntries(F.causes.map((c) => [c.cause, c.fair_share_points]));
const saves = (x) => x.sla_penalties_avoided_usd + x.redelivery_avoided_usd;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
pres.author = "Team InfinityStacks";
pres.title = "Halcyon DeliveryLens";
pres.theme = { headFontFace: FONT, bodyFontFace: FONT };

// ---------- helpers ----------
let uid = 0, page = 0;
// Animation tag: the shape appears on click `step` (fade, or wipe from the left).
const A = (step, effect = "f") => ({ objectName: `anim_${step}_${effect}_${++uid}` });
function txt(s, text, o) {
  s.addText(text, { fontFace: FONT, margin: 0, isTextBox: true, color: C.ink, valign: "top", ...o });
}
function rect(s, o, fill, anim) {
  s.addShape(pres.shapes.RECTANGLE, { ...o, fill: { color: fill }, line: { color: fill }, ...(anim || {}) });
}
function slide(title, bg = C.paper) {
  page += 1;
  const s = pres.addSlide();
  if (SCRIPT[page]) s.addNotes(SCRIPT[page]);
  s.background = { color: bg };
  if (title) txt(s, title, { x: 0.7, y: 0.55, w: 11.9, h: 1.0, fontSize: 38, bold: true, valign: "middle", color: bg === C.paper ? C.ink : C.white });
  txt(s, String(page), { x: 12.3, y: 6.95, w: 0.4, h: 0.3, fontSize: 11, color: bg === C.paper ? C.slate : C.mist, align: "right" });
  return s;
}
// Full-bleed photo with a dark wash so white text reads on top.
function photoSlide(file, wash = 45) {
  page += 1;
  const s = pres.addSlide();
  if (SCRIPT[page]) s.addNotes(SCRIPT[page]);
  s.background = { color: C.ink };
  s.addImage({ path: ASSET(file), x: 0, y: 0, w: W, h: H });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: H, fill: { color: C.ink, transparency: wash }, line: { color: C.ink, transparency: 100 } });
  return s;
}

// ---------- 1. Title ----------
{
  const s = photoSlide("bg-01.jpg", 30);
  txt(s, "EVOHACK 2026", { x: 0.85, y: 1.45, w: 6, h: 0.4, fontSize: 16, bold: true, color: C.onInk, charSpacing: 3 });
  txt(s, [
    { text: "Team ", options: { color: C.white } },
    { text: "InfinityStacks", options: { color: C.onInk } },
  ], { x: 0.8, y: 1.85, w: 11.8, h: 1.3, fontSize: 76, bold: true });
  rect(s, { x: 0.85, y: 3.35, w: 6.6, h: 0.85 }, C.route);
  txt(s, "for  Halcyon Logistics", { x: 1.1, y: 3.35, w: 6.3, h: 0.85, fontSize: 34, bold: true, color: C.white, valign: "middle" });
  txt(s, "Sravan Kumar D   ·   Sai M   ·   Dinesh K", { x: 0.85, y: 4.45, w: 11, h: 0.5, fontSize: 22, color: C.white });
  rect(s, { x: 0.85, y: 5.55, w: 0.08, h: 0.75 }, C.late, A(1));
  txt(s, "Why are 29 of every 100 deliveries late?", { x: 1.15, y: 5.55, w: 11, h: 0.75, fontSize: 30, bold: true, color: C.white, valign: "middle", ...A(1) });
}

// ---------- 2. Discovery and the key problem ----------
{
  const s = slide("71 of every 100 deliveries arrive on time");
  txt(s, pct0(F.on_time_rate_today), { x: 0.7, y: 1.75, w: 4.2, h: 1.7, fontSize: 120, bold: true, color: C.late });
  txt(s, "on time today. The industry gets 94%.", { x: 0.75, y: 3.45, w: 5.2, h: 0.5, fontSize: 20, color: C.inkSoft });
  const costs = [
    [usdM(F.money.sla_penalties_6_months_usd * 2), "a year in late-delivery penalties"],
    ["$14.2M", "of yearly revenue from 9 clients ready to leave"],
    ["$680K", "routing software, ready to be signed"],
  ];
  costs.forEach(([v, l], i) => {
    const y = 4.3 + i * 0.85;
    txt(s, v, { x: 0.75, y, w: 2.3, h: 0.7, fontSize: 34, bold: true, color: i === 2 ? C.ink : C.late, valign: "middle", ...A(1 + i) });
    txt(s, l, { x: 3.1, y, w: 3.6, h: 0.7, fontSize: 18, color: C.inkSoft, valign: "middle", ...A(1 + i) });
  });
  rect(s, { x: 7.35, y: 1.85, w: 0.04, h: 4.95 }, C.line, A(4));
  txt(s, "What hurts the business today", { x: 7.75, y: 1.8, w: 5, h: 0.5, fontSize: 16, bold: true, color: C.late, ...A(4) });
  const pains = [
    ["Clients find out too late", "12 of 34 complaints: “nobody told us”"],
    ["Email orders typed by hand", "14 different layouts, 44.4 staff hours a week"],
    ["Same-day orders after 08:00", "only 39% arrive on time"],
  ];
  pains.forEach(([h, sub], i) => {
    const y = 2.4 + i * 1.5;
    txt(s, h, { x: 7.75, y, w: 5.2, h: 0.6, fontSize: 24, bold: true, color: C.ink, ...A(5 + i) });
    txt(s, sub, { x: 7.75, y: y + 0.62, w: 5.1, h: 0.45, fontSize: 17, color: C.slate, ...A(5 + i) });
  });
}

// ---------- 3. Five causes: fix them one by one, 71% climbs past the 94% benchmark ----------
{
  const s = slide("Is it really the routes? The data says no.");
  txt(s, "Fix one cause at a time: on-time delivery climbs (pilot targets, 70–95% of each cause removed)", { x: 0.7, y: 1.5, w: 11.9, h: 0.4, fontSize: 16, color: C.slate });
  const st = TG.steps_points;
  const today = TG.on_time_today * 100, best = dl.on_time_rate * 100;
  const causes = [
    ["Weak carrier\non a lane", st.weak_carrier_lane, true],
    ["Incomplete\naddress", st.incomplete_address, false],
    ["Same-day order\nafter 08:00", st.same_day_after_cutoff, false],
    ["Stock not at the\nnearest warehouse", st.stock_not_at_nearest, false],
    ["Driver leaves\nthe route", st.route_deviation, true],
  ];
  const x0 = 1.45, colW = 1.6, barW = 1.1, yTop = 2.35, yBot = 5.75, lo = 60, hi = 100;
  const Y = (v) => yBot - ((v - lo) / (hi - lo)) * (yBot - yTop);
  [60, 70, 80, 90, 100].forEach((v) => {
    s.addShape(pres.shapes.LINE, { x: x0 - 0.1, y: Y(v), w: colW * 7 + 0.1, h: 0, line: { color: C.line, width: 0.75 } });
    txt(s, `${v}%`, { x: 0.6, y: Y(v) - 0.15, w: 0.7, h: 0.3, fontSize: 12, color: C.slate, align: "right" });
  });
  const bx = (i) => x0 + i * colW + (colW - barW) / 2;
  const label = (i, t, anim) => txt(s, t, { x: x0 + i * colW - 0.05, y: yBot + 0.08, w: colW + 0.1, h: 0.55, fontSize: 13, color: C.ink, align: "center", ...(anim || {}) });
  // Today: the orange starting bar.
  rect(s, { x: bx(0), y: Y(today), w: barW, h: Y(lo) - Y(today) }, C.late);
  txt(s, `${today.toFixed(0)}%`, { x: bx(0) - 0.2, y: Y(today) - 0.45, w: barW + 0.4, h: 0.4, fontSize: 22, bold: true, color: C.late, align: "center" });
  label(0, "Today");
  // Each fix adds its green step on its own click.
  let level = today;
  causes.forEach(([name, v], i) => {
    const step = 1 + i, x = bx(i + 1);
    s.addShape(pres.shapes.LINE, { x: bx(i) + barW, y: Y(level), w: x - bx(i) - barW, h: 0, line: { color: C.slate, width: 1, dashType: "dash" }, ...A(step) });
    rect(s, { x, y: Y(level + v), w: barW, h: Y(level) - Y(level + v) }, C.route, A(step));
    txt(s, `+${v.toFixed(1)}`, { x: x - 0.2, y: Y(level + v) - 0.42, w: barW + 0.4, h: 0.38, fontSize: 18, bold: true, color: C.route, align: "center", ...A(step) });
    label(i + 1, name, A(step));
    level += v;
  });
  // The 94% industry benchmark.
  s.addShape(pres.shapes.LINE, { x: x0 - 0.1, y: Y(94), w: colW * 7 + 0.1, h: 0, line: { color: C.late, width: 1.5, dashType: "dash" }, ...A(6) });
  txt(s, "Industry 94%", { x: x0, y: Y(94) - 0.36, w: 1.8, h: 0.32, fontSize: 13, bold: true, color: C.late, ...A(6) });
  // The finish: all five fixes at their pilot targets.
  rect(s, { x: bx(6), y: Y(best), w: barW, h: Y(lo) - Y(best) }, C.route, A(6));
  txt(s, `${best.toFixed(0)}%`, { x: bx(6) - 0.2, y: Y(best) - 0.45, w: barW + 0.4, h: 0.4, fontSize: 22, bold: true, color: C.route, align: "center", ...A(6) });
  label(6, "With\nDeliveryLens", A(6));
  // Where a routing tool can help: only 2 of the 5.
  causes.forEach(([, , routing], i) => {
    if (routing) txt(s, "▲ routing tool helps", { x: x0 + (i + 1) * colW - 0.4, y: 6.4, w: colW + 0.8, h: 0.3, fontSize: 12, bold: true, color: C.ink, align: "center", ...A(7) });
  });
  txt(s, "A routing tool touches only 2 of the 5 causes. It’s not really the routes.", { x: 0.7, y: 6.75, w: 11.2, h: 0.35, fontSize: 15, bold: true, color: C.late, ...A(7) });
}

// ---------- 4. The reveal: DeliveryLens ----------
{
  const s = slide(null, C.ink);
  txt(s, "OUR SOLUTION", { x: 0.85, y: 1.7, w: 6, h: 0.4, fontSize: 16, bold: true, color: C.onInk, charSpacing: 3 });
  txt(s, "DeliveryLens", { x: 0.8, y: 2.1, w: 11.8, h: 1.5, fontSize: 96, bold: true, color: C.white });
  txt(s, "Find why deliveries are late. Fix it. Prove it.", { x: 0.85, y: 3.7, w: 11.5, h: 0.7, fontSize: 30, color: C.white });
  rect(s, { x: 0.85, y: 4.95, w: 11.6, h: 0.02 }, C.inkSoft, A(1));
  [["AI reads.", C.white], ["Rules decide.", C.onInk], ["A person approves.", C.white]].forEach(([t, col], i) => {
    txt(s, t, { x: [0.85, 3.65, 6.95][i], y: 5.25, w: [2.7, 3.2, 5.4][i], h: 0.7, fontSize: 30, bold: true, color: col, ...A(1) });
  });
}

// ---------- 5. One fix per cause, and the safe AI flow ----------
{
  const s = slide("Our answer: one fix for each cause");
  const fixes = [
    ["Weak carrier on a lane", "Pick the carrier that is strong on that lane, not the cheapest"],
    ["Incomplete address", "Fill it from the client’s past deliveries; client confirms in one click"],
    ["Same-day after 08:00", "A grace hour to 09:00; urgent orders only until 10:00"],
    ["Stock not nearby", "Ship from the nearest warehouse that has the stock"],
    ["Driver leaves the route", "Show which lanes drift; a $100K routing pilot only there, not $680K"],
  ];
  fixes.forEach(([cause, fix], i) => {
    const y = 1.55 + i * 0.55;
    txt(s, cause, { x: 0.7, y, w: 4.0, h: 0.5, fontSize: 17, bold: true, color: C.late, valign: "middle", ...A(1 + i) });
    txt(s, "→", { x: 4.75, y, w: 0.5, h: 0.5, fontSize: 20, color: C.slate, valign: "middle", ...A(1 + i) });
    txt(s, fix, { x: 5.3, y, w: 7.5, h: 0.5, fontSize: 16, color: C.ink, valign: "middle", ...A(1 + i) });
  });
  // How every order is handled: guardrail → AI → rules → person → live tracker.
  const flow = [
    ["Guardrail", ["Blocks prompt attacks (16 tested)", "Strips hidden text and code", "20,000-character limit", "Masks emails, phones in logs"], C.guard, C.guardTint],
    ["AI", ["Email agent reads the order", "Pulls parts, qty, address", "Drafts the client reply", "Fills fixed fields only"], C.ai, C.aiTint],
    ["Rules", ["Address complete?", "Before the cutoff?", "Stock at nearest?", "Best carrier on lane"], C.route, C.routeTint],
    ["Human in the loop", ["Approves each order before it enters the WMS", "Can edit or reject", "Approves every client message"], C.ink, "E7ECEA"],
    ["Live tracker", ["Every AI call, live", "Tokens and cost", "Time and agent", "Guardrail flags"], C.data, C.dataTint],
  ];
  const bw = 2.2, gap = 0.26, fy = 4.4, fh = 2.4;
  flow.forEach(([h, t, col, tint], i) => {
    const x = 0.7 + i * (bw + gap), step = 6 + i;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: fy, w: bw, h: fh, fill: { color: tint }, line: { color: col, width: 1.5 }, rectRadius: 0.1, ...A(step) });
    if (h === "AI") s.addImage({ path: ASSET("agent-icon.png"), x: x + 0.22, y: fy + 0.1, w: 0.42, h: 0.42, ...A(step) });
    txt(s, h, { x: x + 0.1, y: fy + 0.1, w: bw - 0.2, h: 0.42, fontSize: h.length > 14 ? 14 : h.length > 10 ? 17 : 20, bold: true, color: col, align: "center", valign: "middle", ...A(step) });
    s.addText(t.map((line, k) => ({ text: line, options: { bullet: { indent: 10 }, breakLine: k < t.length - 1 } })),
      { x: x + 0.1, y: fy + 0.62, w: bw - 0.18, h: fh - 0.72, fontFace: FONT, fontSize: 12.5, color: C.ink, paraSpaceAfter: 4, valign: "top", margin: 0, isTextBox: true, ...A(step) });
    if (i < flow.length - 1) s.addShape(pres.shapes.ISOSCELES_TRIANGLE, { x: x + bw + 0.04, y: fy + fh / 2 - 0.12, w: 0.18, h: 0.24, rotate: 90, fill: { color: C.slate }, line: { color: C.slate }, ...A(step) });
  });
}

// ---------- 6. Impact: DeliveryLens vs the routing tool ----------
{
  const s = slide("Don’t buy the $680K tool. Fix the causes.");
  const colX = [0.7, 5.2, 8.95], colW = [4.3, 3.6, 3.7];
  txt(s, "Buy the routing tool", { x: colX[1], y: 1.75, w: colW[1], h: 0.5, fontSize: 20, bold: true, color: C.slate, ...A(1) });
  txt(s, "DeliveryLens", { x: colX[2], y: 1.75, w: colW[2], h: 0.5, fontSize: 20, bold: true, color: C.route, ...A(2) });
  const rows = [
    ["On time (today 71%)", pct0(tool.on_time_rate), pct0(dl.on_time_rate)],
    ["Saves a year", usdK(saves(tool)), usdM(saves(dl))],
    ["Costs a year", usdK(tool.cost_per_year_usd), usdK(dl.cost_per_year_usd)],
  ];
  rows.forEach(([l, a, b], i) => {
    const y = 2.3 + i * 0.85;
    rect(s, { x: 0.7, y: y + 0.78, w: 11.95, h: 0.02 }, C.line);
    txt(s, l, { x: colX[0], y, w: colW[0], h: 0.8, fontSize: 22, color: C.inkSoft, valign: "middle" });
    txt(s, a, { x: colX[1], y, w: colW[1], h: 0.8, fontSize: 34, bold: true, color: C.slate, valign: "middle", ...A(1) });
    txt(s, b, { x: colX[2], y, w: colW[2], h: 0.8, fontSize: 34, bold: true, color: C.route, valign: "middle", ...A(2) });
  });
  const yn = 2.3 + 3 * 0.85;
  txt(s, "Halcyon keeps a year", { x: colX[0], y: yn, w: colW[0], h: 0.9, fontSize: 22, bold: true, color: C.ink, valign: "middle", ...A(3) });
  txt(s, usdK(tool.net_benefit_per_year_usd), { x: colX[1], y: yn, w: colW[1], h: 0.9, fontSize: 40, bold: true, color: C.slate, valign: "middle", ...A(3) });
  txt(s, usdM(dl.net_benefit_per_year_usd), { x: colX[2], y: yn, w: colW[2], h: 0.9, fontSize: 40, bold: true, color: C.route, valign: "middle", ...A(3) });
  rect(s, { x: 0.7, y: 5.95, w: 11.95, h: 0.8 }, C.route, A(4));
  txt(s, `That’s ${usdM(dl.net_benefit_per_year_usd - tool.net_benefit_per_year_usd)} more a year, and $14.2M of client revenue protected.`, { x: 0.95, y: 5.95, w: 11.5, h: 0.8, fontSize: 22, bold: true, color: C.white, valign: "middle", ...A(4) });
  txt(s, "Saves = penalties + redelivery costs avoided, modelled on Halcyon’s 48,340 deliveries. DeliveryLens = pilot targets; the pilot measures them.", { x: 0.7, y: 6.95, w: 11.3, h: 0.35, fontSize: 12, color: C.slate });
}

// ---------- 7. Beyond the fixes: money back, clients kept, leaders told ----------
{
  const s = slide("Money back. Clients kept. Leaders told.");
  const tiles = [
    ["$261,900", "carrier-caused penalties in 6 months; Carrier D alone: $128,700. Claim letters drafted.", C.route],
    ["9 save plans", "one per at-risk client ($14.2M): talking points, agenda, email", C.route],
    ["Monday brief", "one page for the COO and CFO: on time vs 94%, money lost, three actions", C.data],
    ["Ask", `questions in plain English, answered from the same ${F.deliveries.toLocaleString("en-US")} deliveries`, C.ai],
  ];
  tiles.forEach(([v, l, col], i) => {
    const x = 0.7 + (i % 2) * 6.05, y = 1.85 + Math.floor(i / 2) * 2.45;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 5.85, h: 2.2, fill: { color: C.white }, line: { color: C.line, width: 1 }, rectRadius: 0.08, ...A(1 + i) });
    rect(s, { x, y: y + 0.25, w: 0.1, h: 1.7 }, col, A(1 + i));
    txt(s, v, { x: x + 0.4, y: y + 0.2, w: 5.2, h: 0.85, fontSize: 42, bold: true, color: col, valign: "middle", ...A(1 + i) });
    txt(s, l, { x: x + 0.4, y: y + 1.12, w: 5.2, h: 0.95, fontSize: 18, color: C.inkSoft, ...A(1 + i) });
  });
}

// ---------- 8. Architecture ----------
{
  const s = slide("Live on AWS, deployed on every push");
  // The architecture diagram (deck/assets/aws-architecture.png, 1610 x 947 px).
  const ix = 0.6, iy = 1.75, iw = 8.5, k = iw / 1610;
  s.addImage({ path: ASSET("aws-architecture.png"), x: ix, y: iy, w: iw, h: 947 * k, ...A(1) });
  // The diagram's EC2 label says t3.large; the live server is a t3.small.
  rect(s, { x: ix + 385 * k, y: iy + 384 * k, w: 316 * k, h: 22 * k }, "FFFFDE", A(1));
  txt(s, "Amazon EC2 (one t3.small server)", { x: ix + 385 * k, y: iy + 384 * k, w: 316 * k, h: 22 * k, fontFace: "Arial", fontSize: 7.5, color: "333333", align: "center", valign: "middle", ...A(1) });
  // Right: tech stack
  txt(s, "Tech stack", { x: 9.55, y: 1.75, w: 3.2, h: 0.4, fontSize: 18, bold: true, color: C.route, ...A(2) });
  const stack = [
    ["WEBSITE", "React, TypeScript, Vite"],
    ["API", "Python, FastAPI, pandas"],
    ["DATA", "PostgreSQL on RDS"],
    ["AI", "Claude on Amazon Bedrock"],
    ["CI/CD", "GitHub Actions → ECR, SSM, Amplify"],
  ];
  stack.forEach(([k, v], i) => {
    const y = 2.3 + i * 0.85;
    txt(s, k, { x: 9.55, y, w: 3.2, h: 0.32, fontSize: 12, bold: true, color: C.slate, charSpacing: 1, ...A(2) });
    txt(s, v, { x: 9.55, y: y + 0.32, w: 3.2, h: 0.4, fontSize: 17, color: C.ink, ...A(2) });
  });
}

// ---------- 9. AI agents used ----------
{
  const s = slide("Nine AI agents. Rules decide.");
  const list = [
    ["Order Intake Agent", "reads the client's email order", "Order desk"],
    ["Client Reply Agent", "drafts the confirmation or question", "Order desk"],
    ["Reply Reader Agent", "reads the client's answer", "Order desk"],
    ["Delay Alert Agent", "warns the client before a late delivery", "Why late"],
    ["Morning Note Agent", "writes the 08:00 huddle note", "Risk board"],
    ["Carrier Claims Agent", "drafts penalty claim letters", "Carriers"],
    ["Account Save Agent", "a save plan per at-risk client", "At-risk clients"],
    ["Weekly Brief Agent", "Monday one-pager for COO and CFO", "Weekly brief"],
    ["Ask agent", "answers with fixed data tools, no SQL", "Ask DeliveryLens"],
  ];
  list.forEach(([name, job, where], i) => {
    const x = 0.7 + (i % 3) * 4.05, y = 1.85 + Math.floor(i / 3) * 1.3, step = 1 + Math.floor(i / 3);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 3.85, h: 1.12, fill: { color: C.white }, line: { color: C.line, width: 1 }, rectRadius: 0.08, ...A(step) });
    s.addImage({ path: ASSET("agent-icon.png"), x: x + 0.18, y: y + 0.12, w: 0.42, h: 0.42, ...A(step) });
    txt(s, name, { x: x + 0.7, y: y + 0.13, w: 3.05, h: 0.4, fontSize: 19, bold: true, color: C.ai, ...A(step) });
    txt(s, `${job} · ${where}`, { x: x + 0.2, y: y + 0.56, w: 3.5, h: 0.5, fontSize: 14, color: C.inkSoft, ...A(step) });
  });
  rect(s, { x: 0.7, y: 5.85, w: 11.95, h: 0.95 }, C.ink, A(4));
  txt(s, [
    { text: "Built with AI agents too:  ", options: { bold: true, color: C.white } },
    { text: "Claude Code with our Dev, DevOps and QA agent files (.claude/agents/), each with role, scope, inputs, outputs and guardrails · every session logged in ai-logs/ · a person reviewed every change", options: { color: C.onInk } },
  ], { x: 0.95, y: 5.85, w: 11.5, h: 0.95, fontSize: 15, valign: "middle", ...A(4) });
}

// ---------- 10. Who did what: role convergence ----------
{
  const s = slide("Three people. Every role. Agents helped.");
  const people = [
    ["Sravan", "Business & pitch", C.late, C.lateTint, ["Discover: stakeholder questions, transcripts", "Demo and pitch"], "Product Manager · Executive Summary · meeting-analyzer"],
    ["Sai", "Architecture, AI, AWS", C.ai, C.aiTint, ["Design: architecture, AWS", "Build: API and the AI agents", "Deploy: CI/CD to AWS"], "Software Architect · Backend Architect · AI Engineer · DevOps"],
    ["Dinesh", "Full-stack & testing", C.route, C.routeTint, ["Build: the website", "Test: unit, browser, security"], "Frontend Developer · Test Automation · Reality Checker · AppSec"],
  ];
  people.forEach(([name, role, col, tint, owns, agents], i) => {
    const x = 0.7 + i * 4.05, y = 1.75, w = 3.85, step = 1 + i;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 3.9, fill: { color: C.white }, line: { color: C.line, width: 1 }, rectRadius: 0.08, ...A(step) });
    rect(s, { x, y, w, h: 1.15 }, tint, A(step));
    txt(s, name, { x: x + 0.25, y: y + 0.1, w: w - 0.5, h: 0.6, fontSize: 30, bold: true, color: col, valign: "middle", ...A(step) });
    txt(s, role, { x: x + 0.25, y: y + 0.7, w: w - 0.5, h: 0.35, fontSize: 15, color: C.inkSoft, ...A(step) });
    s.addText(owns.map((t, k) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: k < owns.length - 1 } })),
      { x: x + 0.2, y: y + 1.3, w: w - 0.4, h: 1.45, fontFace: FONT, fontSize: 15, color: C.ink, paraSpaceAfter: 5, valign: "top", margin: 0, isTextBox: true, ...A(step) });
    s.addImage({ path: ASSET("agent-icon.png"), x: x + 0.25, y: y + 2.78, w: 0.28, h: 0.28, ...A(step) });
    txt(s, "AGENTS", { x: x + 0.6, y: y + 2.8, w: w - 0.85, h: 0.28, fontSize: 11, bold: true, color: C.slate, charSpacing: 1, ...A(step) });
    txt(s, agents, { x: x + 0.25, y: y + 3.08, w: w - 0.5, h: 0.75, fontSize: 13, color: C.ai, ...A(step) });
  });
  rect(s, { x: 0.7, y: 5.9, w: 11.95, h: 0.9 }, C.ink, A(4));
  txt(s, [
    { text: "Outside our usual roles:  ", options: { bold: true, color: C.white } },
    { text: "each of us discovered, built, tested and demoed. An agent does the work; a person checks it and owns it.", options: { color: C.onInk } },
  ], { x: 0.95, y: 5.9, w: 11.5, h: 0.9, fontSize: 17, valign: "middle", ...A(4) });
}

// ---------- 11. Quality, validation and security ----------
{
  const s = slide("Tested, validated, locked down");
  const cards = [
    ["Tested", "447", "automated tests on every push", C.route, C.routeTint, [
      "387 backend + 60 frontend tests",
      "30 browser tests, 190 repeat runs, 0 flaky",
      "33 bad inputs (empty, broken, huge): 0 crashes",
    ]],
    ["Validated", "11 / 11", "sample emails: the expected decision", C.data, C.dataTint, [
      `Causes hold on months the rules never saw: ${(F.holdout_check.jul_sep_on_time_with_no_problem * 100).toFixed(1)}%`,
      "16 “ignore all previous instructions” emails: all blocked",
      "A number an AI writes must match the data",
    ]],
    ["Secure", "9", "security controls, layered", C.guard, C.guardTint, [
      "Keys and DB login in Secrets Manager, none in code",
      "GitHub deploys with OIDC; least-privilege IAM",
      "Private, encrypted database; HTTPS only",
      "Website login; API rate limit",
      "Prompt guardrail; personal data masked in logs",
    ]],
  ];
  cards.forEach(([h, big, sub, col, tint, items], i) => {
    const x = 0.7 + i * 4.05, y = 1.7, w = 3.85, step = 1 + i;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 3.85, fill: { color: C.white }, line: { color: C.line, width: 1 }, rectRadius: 0.08, ...A(step) });
    rect(s, { x, y, w, h: 1.5 }, tint, A(step));
    txt(s, h.toUpperCase(), { x: x + 0.25, y: y + 0.12, w: w - 0.5, h: 0.3, fontSize: 13, bold: true, color: col, charSpacing: 1, ...A(step) });
    txt(s, big, { x: x + 0.25, y: y + 0.4, w: w - 0.5, h: 0.7, fontSize: 44, bold: true, color: col, valign: "middle", ...A(step) });
    txt(s, sub, { x: x + 0.25, y: y + 1.1, w: w - 0.5, h: 0.35, fontSize: 14, color: C.inkSoft, ...A(step) });
    s.addText(items.map((t, k) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: k < items.length - 1 } })),
      { x: x + 0.2, y: y + 1.62, w: w - 0.4, h: 2.15, fontFace: FONT, fontSize: items.length > 4 ? 13 : 14, color: C.ink, paraSpaceAfter: items.length > 4 ? 2 : 5, valign: "top", margin: 0, isTextBox: true, ...A(step) });
  });
  // The automated pipeline: nothing deploys unless every step passes.
  txt(s, "Every push to main, no human step:", { x: 0.7, y: 5.72, w: 6, h: 0.35, fontSize: 15, bold: true, color: C.route, ...A(4) });
  const pipe = ["Push to main", "Tests", "Image to ECR", "Deploy via SSM", "Website on Amplify", "Health check"];
  const pw = 1.85, pg = 0.17;
  pipe.forEach((t, i) => {
    const x = 0.7 + i * (pw + pg);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 6.12, w: pw, h: 0.6, fill: { color: i === pipe.length - 1 ? C.route : C.routeTint }, line: { color: C.route, width: 1 }, rectRadius: 0.1, ...A(4, "w") });
    txt(s, t, { x, y: 6.12, w: pw, h: 0.6, fontSize: 14, bold: true, color: i === pipe.length - 1 ? C.white : C.route, align: "center", valign: "middle", ...A(4, "w") });
    if (i < pipe.length - 1) s.addShape(pres.shapes.ISOSCELES_TRIANGLE, { x: x + pw + 0.02, y: 6.33, w: 0.13, h: 0.18, rotate: 90, fill: { color: C.slate }, line: { color: C.slate }, ...A(4, "w") });
  });
}

// ---------- 12. Path to adoption ----------
{
  const s = slide("Path to adoption: live in about 6 weeks");
  const groups = [
    ["Integration", C.data, [
      "Connect the order inbox to the mail service they already use",
      "WMS API: real-time order intake and pick list management",
      "Carrier delay feeds, so the client hears first",
    ]],
    ["Security & compliance", C.guard, [
      "Real logins and admin controls",
      "Separate dev, test and prod environments",
      "Confirm carrier contracts allow penalty claims",
    ]],
    ["Data access", C.route, ["A read-only daily export of deliveries, loaded with one command"]],
    ["Risk", C.late, ["Savings are estimates: a pilot measures them every week"]],
  ];
  let gy = 1.7;
  groups.forEach(([h, col, items], i) => {
    const step = 1 + i;
    txt(s, h, { x: 0.7, y: gy, w: 6.9, h: 0.4, fontSize: 18, bold: true, color: col, ...A(step) });
    s.addText(items.map((t, k2) => ({ text: t, options: { bullet: { indent: 16 }, breakLine: k2 < items.length - 1 } })),
      { x: 0.75, y: gy + 0.42, w: 6.9, h: items.length * 0.37, fontFace: FONT, fontSize: 16, color: C.ink, paraSpaceAfter: 3, valign: "top", margin: 0, isTextBox: true, ...A(step) });
    gy += 0.42 + items.length * 0.37 + 0.22;
  });
  txt(s, "Rollout", { x: 8.1, y: 1.7, w: 4.5, h: 0.45, fontSize: 18, bold: true, color: C.route, ...A(5) });
  const plan = [
    ["Week 1", "Pilot the 3 process fixes at one warehouse; carrier per lane; production security"],
    ["Weeks 2–4", "Connect the order inbox and the WMS; get ready for 10x"],
    ["Weeks 4–6", "Separate environments; carrier delay feeds"],
    ["Week 6+", "Routing pilot only on the lanes that drift"],
  ];
  rect(s, { x: 8.28, y: 2.35, w: 0.04, h: 4.2 }, C.routeTint, A(5));
  plan.forEach(([when, what], i) => {
    const y = 2.25 + i * 1.1, step = 5 + i;
    s.addShape(pres.shapes.OVAL, { x: 8.18, y: y + 0.08, w: 0.24, h: 0.24, fill: { color: C.route }, line: { color: C.route }, ...A(step) });
    txt(s, when, { x: 8.6, y, w: 4.0, h: 0.38, fontSize: 16, bold: true, color: C.route, ...A(step) });
    txt(s, what, { x: 8.6, y: y + 0.38, w: 4.05, h: 0.68, fontSize: 14, color: C.ink, ...A(step) });
  });
}

// ---------- 13. Live demo ----------
{
  const s = photoSlide("bg-07.jpg", 30);
  txt(s, "Let’s see it live", { x: 0.8, y: 0.55, w: 11, h: 1.0, fontSize: 54, bold: true, color: C.white });
  // The live site and its login, highlighted so the jury can try it.
  rect(s, { x: 0.85, y: 1.75, w: 11.6, h: 1.25 }, C.route);
  txt(s, "main.d19tzovsk3zuvo.amplifyapp.com", { x: 1.15, y: 1.83, w: 11.1, h: 0.6, fontSize: 30, bold: true, color: C.white, valign: "middle" });
  txt(s, [
    { text: "Username: ", options: { color: C.onInk } }, { text: "deliverylens", options: { bold: true, color: C.white } },
    { text: "      Password: ", options: { color: C.onInk } }, { text: "ssd@2001", options: { bold: true, color: C.white } },
  ], { x: 1.15, y: 2.45, w: 11.1, h: 0.45, fontSize: 20, valign: "middle" });
  const items = [
    "An email order becomes a checked warehouse order",
    "A missing postcode, fixed by the client in one click",
    "A hacking attempt hidden in an email, blocked",
    "One late order, replayed: today vs with DeliveryLens",
  ];
  items.forEach((t, i) => {
    const y = 3.35 + i * 0.8;
    txt(s, String(i + 1), { x: 0.85, y, w: 0.6, h: 0.6, fontSize: 30, bold: true, color: C.onInk, valign: "middle", ...A(1 + i) });
    txt(s, t, { x: 1.5, y, w: 10.5, h: 0.6, fontSize: 26, color: C.white, valign: "middle", ...A(1 + i) });
  });
}

// ---------- 14. Ready to grow: 10x and reuse ----------
{
  const s = slide("Ready to grow: 10x the data, any client");
  const rows = [
    ["Load the data", "1.8 s", "4.2 s"],
    ["Memory for the dataset", "75 MB", "310 MB"],
    ["On-time KPIs", "33 ms", "58 ms"],
    ["What-if simulator", "13 ms", "24 ms"],
    ["Morning risk board", "78 ms", "135 ms"],
    ["11 emails through the Order desk", "363 ms", "410 ms"],
    ["Errors", "0", "0"],
  ];
  const cx = [0.7, 4.75, 6.55], cw = [4.0, 1.75, 1.75];
  txt(s, "Today (48,340)", { x: cx[1], y: 1.7, w: cw[1], h: 0.45, fontSize: 15, bold: true, color: C.route, align: "right", ...A(1) });
  txt(s, "10x (483,400)", { x: cx[2], y: 1.7, w: cw[2], h: 0.45, fontSize: 15, bold: true, color: C.data, align: "right", ...A(2) });
  rows.forEach(([l, a, b], i) => {
    const y = 2.2 + i * 0.56;
    rect(s, { x: 0.7, y: y + 0.52, w: 7.6, h: 0.015 }, C.line);
    txt(s, l, { x: cx[0], y, w: cw[0], h: 0.5, fontSize: 17, color: C.ink, valign: "middle" });
    txt(s, a, { x: cx[1], y, w: cw[1], h: 0.5, fontSize: 20, bold: true, color: C.route, align: "right", valign: "middle", ...A(1) });
    txt(s, b, { x: cx[2], y, w: cw[2], h: 0.5, fontSize: 20, bold: true, color: C.data, align: "right", valign: "middle", ...A(2) });
  });
  txt(s, "10x: heavy numbers computed overnight, two servers. No code change.", { x: 0.7, y: 6.2, w: 7.6, h: 0.4, fontSize: 14, color: C.slate, ...A(2) });
  // Right: reuse, then next steps.
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.8, y: 1.75, w: 3.85, h: 1.85, fill: { color: C.dataTint }, line: { color: C.dataTint }, rectRadius: 0.08, ...A(3) });
  txt(s, "Reuse for another client", { x: 9.05, y: 1.88, w: 3.4, h: 0.4, fontSize: 17, bold: true, color: C.data, ...A(3) });
  txt(s, "Load their data with 1 command. Settings only, no code change.", { x: 9.05, y: 2.35, w: 3.4, h: 1.1, fontSize: 17, color: C.ink, ...A(3) });
  txt(s, "Ready for the real user", { x: 8.8, y: 3.9, w: 3.85, h: 0.4, fontSize: 16, bold: true, color: C.route, ...A(4) });
  ["A plain-English user guide", "A person approves every action", "Every AI call logged, auditable", "Alarms email the team"].forEach((t, i) => {
    const y = 4.35 + i * 0.58;
    txt(s, String(i + 1), { x: 8.8, y, w: 0.4, h: 0.5, fontSize: 22, bold: true, color: C.route, valign: "middle", ...A(4 + i) });
    txt(s, t, { x: 9.25, y, w: 3.45, h: 0.5, fontSize: 16, color: C.ink, valign: "middle", ...A(4 + i) });
  });
}

// ---------- 15. Close ----------
{
  const s = photoSlide("bg-08.jpg", 40);
  txt(s, "The truck arrives.", { x: 0.8, y: 1.4, w: 11, h: 1.0, fontSize: 54, bold: true, color: C.white });
  txt(s, "And if it’s going to be late, the client hears first.", { x: 0.85, y: 2.45, w: 11, h: 0.7, fontSize: 28, color: C.white, ...A(1) });
  txt(s, `71% → ${pct0(dl.on_time_rate)} on time  ·  ${usdM(dl.net_benefit_per_year_usd)} a year  ·  no $680K tool`, { x: 0.85, y: 3.55, w: 11.5, h: 0.6, fontSize: 26, bold: true, color: C.onInk, ...A(2) });
  txt(s, "DeliveryLens. Find why. Fix it. Prove it.", { x: 0.85, y: 4.6, w: 11, h: 0.7, fontSize: 30, bold: true, color: C.white, ...A(3) });
  txt(s, "Thank you  ·  main.d19tzovsk3zuvo.amplifyapp.com  ·  Team InfinityStacks", { x: 0.85, y: 6.5, w: 11.5, h: 0.4, fontSize: 16, color: C.mist, ...A(3) });
}

pres.writeFile({ fileName: OUT }).then(() => console.log("wrote", OUT));

