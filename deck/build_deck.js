// Builds deck/DeliveryLens-pitch.pptx: a short, visual jury deck (problem -> features -> impact).
// Run from the repo root:  node deck/build_deck.js   (needs `npm ci` in deck/ once)
// Headline numbers come from analysis/output/findings.json; feature numbers from PROJECT-PROGRESS.md
// and docs/03-what-the-data-says.md. Colours and font follow DESIGN.md
// (orange = problem, teal = fix, purple = AI only, blue = data, wine = guardrail).
// Font: Barlow (free Google font). Install it on the presenting laptop, or PowerPoint will substitute.
const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");

const ROOT = path.resolve(__dirname, "..");
const F = JSON.parse(fs.readFileSync(path.join(ROOT, "analysis/output/findings.json"), "utf8"));
const ASSET = (n) => path.join(__dirname, "assets", n);
const OUT = path.join(__dirname, "DeliveryLens-pitch.pptx");

const C = {
  ink: "15212B", inkSoft: "3A4852", paper: "F3F5F4", white: "FFFFFF", line: "D9DFDD", slate: "5E6B75",
  route: "0E6B63", routeTint: "E3F1EE", late: "A84F0B", lateTint: "FBEEE2",
  ai: "5B47B0", aiTint: "EEEBF9", data: "2C5D8F", dataTint: "E5EEF7", guard: "8A2F4E", guardTint: "F8E8EE",
  onInk: "A9D8D1",
};
const FONT = "Barlow";

const pct1 = (x) => `${(x * 100).toFixed(1)}%`;
const usdM = (x) => `$${(x / 1e6).toFixed(2)}M`;
const S = Object.fromEntries(F.scenarios.map((x) => [x.name, x]));
const realistic = S["All five fixes, realistic"], vendor = S["Routing vendor only (ceiling)"];
const pts = Object.fromEntries(F.causes.map((c) => [c.cause, c.fair_share_points]));
const penaltiesYear = F.money.sla_penalties_6_months_usd * 2;
const csShare = Math.round((F.customer_success_week.hours_on_complaints / F.customer_success_week.hours_total) * 100);

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
pres.author = "Team InfinityStacks";
pres.title = "Halcyon DeliveryLens";
pres.theme = { headFontFace: FONT, bodyFontFace: FONT };

const W = 13.333;
let n = 0;

// ---------- helpers ----------
function txt(s, text, o) {
  s.addText(text, { fontFace: FONT, margin: 0, isTextBox: true, color: C.ink, valign: "top", ...o });
}
function base(kicker, kickerColor, title) {
  n += 1;
  const s = pres.addSlide();
  s.background = { color: C.paper };
  if (kicker) {
    s.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: 0.5, w: 0.12, h: 0.36, fill: { color: kickerColor }, line: { color: kickerColor } });
    txt(s, kicker.toUpperCase(), { x: 0.85, y: 0.5, w: 8, h: 0.36, fontSize: 14, bold: true, color: kickerColor, charSpacing: 1, valign: "middle" });
  }
  txt(s, title, { x: 0.6, y: 0.95, w: 12.1, h: 0.95, fontSize: 36, bold: true, valign: "middle", fit: "shrink" });
  txt(s, `DeliveryLens · Team InfinityStacks · ${n}`, { x: 8.7, y: 7.02, w: 4.0, h: 0.3, fontSize: 11, color: C.slate, align: "right" });
  return s;
}
function card(s, x, y, w, h, fill = C.white, line = C.line) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: line, width: 1 }, rectRadius: 0.08 });
}
// Big number with a short label underneath.
function bigNum(s, x, y, w, value, label, color, size = 48) {
  txt(s, value, { x, y, w, h: size / 60, fontSize: size, bold: true, color, valign: "bottom" });
  txt(s, label, { x, y: y + size / 60 + 0.08, w, h: 0.7, fontSize: 16, color: C.inkSoft });
}
function shot(file, x, y, w, h, s) {
  const buf = fs.readFileSync(file);
  const iw = buf.readUInt32BE(16), ih = buf.readUInt32BE(20);
  const k = Math.min(w / iw, h / ih), dw = iw * k, dh = ih * k;
  const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
  s.addShape(pres.shapes.RECTANGLE, { x: dx - 0.04, y: dy - 0.04, w: dw + 0.08, h: dh + 0.08, fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: { type: "outer", blur: 6, offset: 2, angle: 90, color: "000000", opacity: 0.12 } });
  s.addImage({ path: file, x: dx, y: dy, w: dw, h: dh });
}
function chip(s, x, y, w, label, color, tint) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.42, fill: { color: tint }, line: { color }, rectRadius: 0.21 });
  txt(s, label, { x, y, w, h: 0.42, fontSize: 14, bold: true, color, align: "center", valign: "middle" });
}
function hbar(s, x, y, maxW, value, max, color, label, valueText, h = 0.62, inside = false) {
  txt(s, label, { x, y: y - 0.36, w: 7, h: 0.32, fontSize: 16, color: C.inkSoft });
  s.addShape(pres.shapes.RECTANGLE, { x, y, w: maxW, h, fill: { color: "E7ECEA" }, line: { color: "E7ECEA" } });
  s.addShape(pres.shapes.RECTANGLE, { x, y, w: (maxW * value) / max, h, fill: { color }, line: { color } });
  if (inside) txt(s, valueText, { x: x + (maxW * value) / max - 2.0, y, w: 1.85, h, fontSize: 28, bold: true, color: C.white, align: "right", valign: "middle" });
  else txt(s, valueText, { x: x + (maxW * value) / max + 0.15, y, w: 1.8, h, fontSize: 28, bold: true, color, valign: "middle" });
}

// ---------- 1. Title ----------
{
  n += 1;
  const s = pres.addSlide();
  s.background = { color: C.ink };
  s.addShape(pres.shapes.RECTANGLE, { x: 0.8, y: 1.55, w: 1.2, h: 0.1, fill: { color: C.late }, line: { color: C.late } });
  s.addShape(pres.shapes.RECTANGLE, { x: 2.0, y: 1.55, w: 1.2, h: 0.1, fill: { color: C.route }, line: { color: C.route } });
  txt(s, "DeliveryLens", { x: 0.8, y: 1.9, w: 11.5, h: 1.3, fontSize: 72, bold: true, color: C.white });
  txt(s, "Find why deliveries are late. Fix each cause. Prove it.", { x: 0.8, y: 3.3, w: 11.5, h: 0.7, fontSize: 30, color: C.onInk });
  txt(s, "Halcyon Logistics · EvoHack 2026 · Problem 2: late deliveries", { x: 0.8, y: 4.3, w: 11.5, h: 0.45, fontSize: 20, color: "C9D1D6" });
  txt(s, "Team InfinityStacks:  Sravan Kumar D  ·  Sai M  ·  Dinesh K", { x: 0.8, y: 6.2, w: 11.5, h: 0.45, fontSize: 20, bold: true, color: C.white });
  s.addNotes("We are Team InfinityStacks. Halcyon Logistics delivers late too often, and its leaders were about to buy a routing tool to fix it. DeliveryLens finds why deliveries are really late, fixes each cause every day, and proves the result with numbers.");
}

// ---------- 2. The problem ----------
{
  const s = base("The problem", C.late, "Only 71 of every 100 deliveries arrive on time");
  hbar(s, 0.6, 2.7, 9.0, F.on_time_rate_today * 100, 100, C.late, "Halcyon today", pct1(F.on_time_rate_today));
  hbar(s, 0.6, 3.85, 9.0, 94, 100, C.route, "Industry benchmark", "94%");
  const cards = [
    [`$${(penaltiesYear / 1e6).toFixed(2)}M`, "SLA penalties a year", C.late],
    ["$14.2M", "revenue from 9 clients who may leave", C.late],
    ["$680K", "routing tool, ready to sign in 2 weeks", C.ink],
  ];
  cards.forEach(([v, l, col], i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 4.75, 3.85, 1.95);
    bigNum(s, x + 0.3, 4.9, 3.3, v, l, col, 44);
  });
  txt(s, `${F.deliveries.toLocaleString()} deliveries, 1 Apr – 25 Sep 2026`, { x: 0.6, y: 1.8, w: 8, h: 0.35, fontSize: 16, color: C.slate });
  s.addNotes(`We looked at all ${F.deliveries.toLocaleString()} deliveries from April to September. Only 71% arrived on time; good logistics companies reach 94%. Late deliveries cost about $1.74M a year in penalties, and nine clients worth $14.2M a year say they may leave. Leadership's answer was a $680K routing tool. Our question: is routing really the problem?`);
}

// ---------- 3. Who hurts ----------
{
  const s = base("Who feels it", C.late, "Four groups feel it every day");
  const people = [
    ["Leaders", "COO and CFO", "$680K", "decision with no proof that routing is the cause"],
    ["CS team", "customer success", `${csShare}%`, "of their week spent on complaints"],
    ["Order desk", "warehouse staff", "28%", "of email orders arrive with an incomplete address, typed by hand"],
    ["Clients", "280 businesses", "12 of 34", "complaints say “nobody told us it would be late”"],
  ];
  people.forEach(([who, sub, big, line], i) => {
    const x = 0.6 + i * 3.08;
    card(s, x, 2.15, 2.88, 4.55);
    txt(s, who, { x: x + 0.25, y: 2.4, w: 2.4, h: 0.45, fontSize: 24, bold: true });
    txt(s, sub, { x: x + 0.25, y: 2.88, w: 2.4, h: 0.35, fontSize: 15, color: C.slate });
    s.addShape(pres.shapes.LINE, { x: x + 0.25, y: 3.4, w: 2.38, h: 0, line: { color: C.line, width: 1 } });
    txt(s, big, { x: x + 0.25, y: 3.6, w: 2.5, h: 0.9, fontSize: 44, bold: true, color: C.late, valign: "middle", fit: "shrink" });
    txt(s, line, { x: x + 0.25, y: 4.6, w: 2.4, h: 1.9, fontSize: 18, color: C.inkSoft });
  });
  s.addNotes(`Leaders must decide on $680K without proof. Customer success spends about ${csShare}% of its week on complaints. The order desk types email orders by hand, and 28% of them arrive with part of the address missing. Clients complain most that nobody told them a delivery would be late: 12 of the 34 complaints.`);
}

// ---------- 4. What the data says (waterfall) ----------
{
  const s = base("What the data says", C.late, `Five causes explain ${F.points_explained_by_the_five_causes} of the ${F.points_lost_today} points lost`);
  const steps = [
    ["Today", 0, F.on_time_rate_today * 100, C.late, "71.0"],
    ["Weak carrier\non a lane", null, pts.weak_carrier_lane, C.late],
    ["Incomplete\naddress", null, pts.incomplete_address, C.late],
    ["Same-day\nafter 08:00", null, pts.same_day_after_cutoff, C.late],
    ["Stock not at\nnearest warehouse", null, pts.stock_not_at_nearest, C.late],
    ["Route\ndeviation", null, pts.route_deviation, C.late],
    ["No problem\n(on time)", 0, F.on_time_rate_with_no_problem * 100, C.route, "99.0"],
  ];
  // Chart area: y axis 60..100 %.
  const x0 = 1.3, yTop = 2.2, yBot = 6.0, lo = 60, hi = 100, colW = 1.55, barW = 1.05;
  const Y = (v) => yBot - ((v - lo) / (hi - lo)) * (yBot - yTop);
  [60, 70, 80, 90, 100].forEach((v) => {
    s.addShape(pres.shapes.LINE, { x: x0 - 0.1, y: Y(v), w: colW * 7 + 0.1, h: 0, line: { color: C.line, width: 0.75 } });
    txt(s, `${v}%`, { x: 0.45, y: Y(v) - 0.15, w: 0.7, h: 0.3, fontSize: 12, color: C.slate, align: "right" });
  });
  let level = F.on_time_rate_today * 100;
  steps.forEach(([label, start, val, col, show], i) => {
    const x = x0 + i * colW + (colW - barW) / 2;
    let from, to;
    if (start === 0) { from = lo; to = val; } else { from = level; to = level + val; level = to; }
    s.addShape(pres.shapes.RECTANGLE, { x, y: Y(to), w: barW, h: Y(from) - Y(to), fill: { color: col }, line: { color: col } });
    txt(s, show || `+${val.toFixed(1)}`, { x: x - 0.2, y: Y(to) - 0.42, w: barW + 0.4, h: 0.38, fontSize: 18, bold: true, color: col, align: "center" });
    txt(s, label, { x: x0 + i * colW, y: yBot + 0.08, w: colW, h: 0.62, fontSize: 13, color: C.ink, align: "center" });
  });
  // Callout: routing tool fixes only route deviation.
  const xr = x0 + 5 * colW;
  s.addShape(pres.shapes.RECTANGLE, { x: xr + 0.05, y: 2.8, w: colW - 0.1, h: 0.62, fill: { color: C.white }, line: { color: C.ink, width: 1, dashType: "dash" } });
  txt(s, "The only one a routing tool fixes", { x: xr + 0.1, y: 2.82, w: colW - 0.2, h: 0.58, fontSize: 12, bold: true, align: "center", valign: "middle" });
  txt(s, "Points of on-time delivery each cause costs (fair share, no double counting). Axis starts at 60%.", { x: 0.6, y: 6.72, w: 9.5, h: 0.3, fontSize: 12, color: C.slate });
  s.addNotes(`We tagged every delivery with the problems it had. Deliveries with none of the five problems are on time 99% of the time, so Halcyon's normal operation works. The five causes explain ${F.points_explained_by_the_five_causes} of the ${F.points_lost_today} points lost. Weak carrier lanes and incomplete addresses are the biggest; route deviation, the only thing a routing tool fixes, is the smallest at ${pts.route_deviation} points. We checked this on months the rules never saw: July to September, still ${pct1(F.holdout_check.jul_sep_on_time_with_no_problem)} with no problem.`);
}

// ---------- 5. Our answer ----------
{
  const s = base("Our answer", C.route, "Fix the five causes, not just the routes");
  const rows = [
    ["Today", F.on_time_rate_today * 100, C.late],
    ["Routing tool only (best case)", F.on_time_if_only_routing_fixed * 100, C.slate],
    ["DeliveryLens plan (realistic)", F.on_time_realistic * 100, C.route],
  ];
  rows.forEach(([l, v, col], i) => hbar(s, 0.6, 2.55 + i * 1.3, 7.6, v, 100, col, l, `${v.toFixed(1)}%`, 0.62, true));
  // benchmark line at 94%
  const bx = 0.6 + 7.6 * 0.94;
  s.addShape(pres.shapes.LINE, { x: bx, y: 2.05, w: 0, h: 3.95, line: { color: C.ink, width: 1.5, dashType: "dash" } });
  txt(s, "94% benchmark", { x: bx - 0.9, y: 6.05, w: 1.8, h: 0.3, fontSize: 13, color: C.ink, align: "center" });
  card(s, 9.1, 2.0, 3.65, 2.15, C.routeTint, C.routeTint);
  bigNum(s, 9.35, 2.2, 3.2, usdM(realistic.net_benefit_per_year_usd), "a year, net benefit of our plan (realistic)", C.route, 40);
  card(s, 9.1, 4.35, 3.65, 2.15, C.lateTint, C.lateTint);
  bigNum(s, 9.35, 4.55, 3.2, `−$${Math.round(-vendor.net_benefit_penalties_only_usd / 1e3)}K`, "a year, routing tool alone (penalties only)", C.late, 40);
  s.addNotes(`If the routing tool fixed everything routing can fix, on-time would reach about ${pct1(F.on_time_if_only_routing_fixed)}. Fixing all five causes, with each fix working most but not all of the time, reaches about ${pct1(F.on_time_realistic)}, worth about ${usdM(realistic.net_benefit_per_year_usd)} a year net. Counting penalties only, the routing tool alone loses about $160K in year one. Our advice: process fixes first, choose carriers by lane, then a small routing pilot only where routes are the problem. To pass 94%, each fix must work about ${Math.round(F.effectiveness_needed_for_94_benchmark * 100)}% of the time.`);
}

// ---------- 6. See why ----------
{
  const s = base("1 · See why", C.data, "One order, ten steps: where it goes late");
  shot(ASSET("shot-journey.png"), 0.6, 2.05, 8.6, 4.8, s);
  const lines = [
    ["Orange", "where each cause hits, in on-time points", C.late],
    ["Badges", "the agent or rule we run at that step", C.route],
    ["Dashed box", "the only step a routing tool touches", C.ink],
  ];
  lines.forEach(([h, t, col], i) => {
    const y = 2.3 + i * 1.5;
    s.addShape(pres.shapes.RECTANGLE, { x: 9.6, y, w: 0.1, h: 1.1, fill: { color: col }, line: { color: col } });
    txt(s, h, { x: 9.85, y, w: 2.9, h: 0.42, fontSize: 22, bold: true, color: col });
    txt(s, t, { x: 9.85, y: y + 0.45, w: 2.9, h: 0.7, fontSize: 16, color: C.inkSoft });
  });
  s.addNotes("The How it works page follows one order from the client's email to the doorstep. Orange boxes show how many on-time points each cause costs at that step. Most lateness starts before the truck leaves; the routing tool acts only on the delivery drive. In the live app, a US map plays six real cases side by side: today versus with DeliveryLens.");
}

// ---------- 7. Order desk ----------
{
  const s = base("2 · Fix it every day", C.route, "Order desk: email in, checked order out");
  shot(ASSET("shot-order-desk.png"), 0.6, 2.0, 6.9, 4.9, s);
  const steps = [
    ["AI reads", "the messy email: items, address, urgency", C.ai, C.aiTint],
    ["Rules check", "address, 08:00 cutoff, stock, carrier lane", C.route, C.routeTint],
    ["A person approves", "before anything enters the WMS or goes to a client", C.ink, "E7ECEA"],
  ];
  steps.forEach(([h, t, col, tint], i) => {
    const y = 2.1 + i * 1.35;
    chip(s, 7.9, y, 2.6, h, col, tint);
    txt(s, t, { x: 7.95, y: y + 0.5, w: 4.8, h: 0.65, fontSize: 18, color: C.inkSoft });
  });
  card(s, 7.9, 6.1, 4.85, 0.75, C.routeTint, C.routeTint);
  txt(s, "11 of 11 sample emails give the expected result", { x: 8.1, y: 6.1, w: 4.6, h: 0.75, fontSize: 17, bold: true, color: C.route, valign: "middle" });
  s.addNotes("This is the live demo screen. An email order arrives; here the postcode is missing. The AI reads it, the rules find the gap and hold the order before picking, and the AI drafts a polite request to the client. A person approves every reply and every accepted order. All 11 sample emails, one per scenario, give the expected result.");
}

// ---------- 8. Late same-day orders ----------
{
  const s = base("2 · Fix it every day", C.route, "Late same-day orders: a grace hour");
  const x0 = 0.6, y = 2.35, h = 0.8;
  const segs = [
    ["08:00 – 09:00", "Grace period", "799 orders → 741 go today", 3.2, C.route],
    ["09:00 – 10:00", "Urgent only", "821 orders → at most 159 go today", 3.2, C.data],
    ["After 10:00", "Tomorrow", "3,206 orders → next day, told at order time", 5.7, C.late],
  ];
  let x = x0;
  segs.forEach(([time, name, line, w, col]) => {
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: w - 0.05, h, fill: { color: col }, line: { color: col } });
    txt(s, `${time}
${name}`, { x: x + 0.15, y, w: w - 0.3, h, fontSize: 18, bold: true, color: C.white, valign: "middle" });
    txt(s, line, { x: x + 0.15, y: y + h + 0.1, w: w - 0.3, h: 0.7, fontSize: 16, color: C.inkSoft });
    x += w;
  });
  txt(s, "4,826 same-day orders arrived after 08:00 (6 months)", { x: 0.6, y: 1.85, w: 9, h: 0.35, fontSize: 16, color: C.slate });
  const nums = [
    ["47%", "on time for these orders, up from 39%", C.route],
    ["729", "late deliveries avoided a year", C.route],
    ["$43K", "SLA penalties avoided a year", C.route],
  ];
  nums.forEach(([v, l, col], i) => {
    const cx = 0.6 + i * 4.1;
    card(s, cx, 4.45, 3.85, 1.85);
    bigNum(s, cx + 0.3, 4.6, 3.3, v, l, col, 44);
  });
  txt(s, "AI quotes the reason for urgency · code checks the quote · a rule decides · under 1 extra order per warehouse a day", { x: 0.6, y: 6.5, w: 12.1, h: 0.35, fontSize: 14, color: C.slate });
  s.addNotes("The business owner told us the 08:00 pick list must not change. So same-day orders that miss it get a grace hour until 09:00, then only urgent orders until 10:00, then honestly next-day. Replayed on 4,826 real late orders, this lifts them from 39% to 47% on time, avoids 729 late deliveries and $43K of penalties a year, with less than one extra order per warehouse per day. These are model estimates from history.");
}

// ---------- 9. Morning risk board ----------
{
  const s = base("2 · Fix it every day", C.route, "08:00 risk board: catch late orders before they ship");
  hbar(s, 0.6, 2.6, 7.2, 63, 100, C.late, "Top 20 riskiest shipments each morning: really late", "63%", 0.8);
  hbar(s, 0.6, 4.0, 7.2, 29, 100, C.slate, "All shipments: late", "29%", 0.8);
  txt(s, "Backtest on Aug–Sep, months the score never saw", { x: 0.6, y: 5.2, w: 8, h: 0.4, fontSize: 16, color: C.slate });
  card(s, 9.6, 2.1, 3.15, 2.2, C.white);
  bigNum(s, 9.9, 2.25, 2.7, "0.81", "AUC: how well the score ranks risk", C.data, 44);
  card(s, 9.6, 4.5, 3.15, 2.2, C.white);
  txt(s, "Then fix it:", { x: 9.9, y: 4.65, w: 2.7, h: 0.4, fontSize: 18, bold: true, color: C.route });
  txt(s, "confirm the address, switch the carrier, see the risk after", { x: 9.9, y: 5.1, w: 2.7, h: 1.4, fontSize: 16, color: C.inkSoft });
  s.addNotes("At 08:00 every shipment on the pick list gets a late risk, based on how often past deliveries with the same problems were late. On August and September, data it never saw, 63% of the daily top 20 were really late, against 29% overall; AUC 0.81. There is no AI in the score: it is plain history. The team gets the fixes still possible, and an AI-written note for the 08:00 huddle.");
}

// ---------- 10. Recover money and keep clients ----------
{
  const s = base("3 · Recover money, keep clients", C.route, "Get money back. Keep the clients. Tell the leaders.");
  const tiles = [
    ["$261,900", "carrier-caused penalties in 6 months; claim letters drafted ($128,700 from Carrier D)", C.route],
    ["9 save plans", "one per at-risk client ($14.2M): talking points, agenda, email, from their own data", C.route],
    ["Monday brief", "one page for the COO and CFO: on time vs 94%, money lost, three actions", C.data],
    ["Ask", "questions in plain English, answered from the same 48,340 deliveries", C.ai],
  ];
  tiles.forEach(([v, l, col], i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 2.1 + Math.floor(i / 2) * 2.4;
    card(s, x, y, 5.95, 2.2);
    s.addShape(pres.shapes.RECTANGLE, { x, y: y + 0.25, w: 0.1, h: 1.7, fill: { color: col }, line: { color: col } });
    txt(s, v, { x: x + 0.4, y: y + 0.2, w: 5.3, h: 0.8, fontSize: 40, bold: true, color: col, valign: "middle" });
    txt(s, l, { x: x + 0.4, y: y + 1.05, w: 5.3, h: 1.0, fontSize: 17, color: C.inkSoft });
  });
  s.addNotes("Carrier penalty recovery finds the penalties Halcyon paid where the carrier alone was at fault: $261,900 in six months, $128,700 from Carrier D, and drafts the claim letters; whether contracts allow passing penalties on must be confirmed. Save plans give each of the nine at-risk clients a plan built from their own deliveries. A one-page brief goes to the COO and CFO every Monday. And anyone can ask questions in plain English. Every number an AI writes must match the data, or the template is used.");
}

// ---------- 11. AI done safely ----------
{
  const s = base("AI done safely", C.ai, "AI reads. Rules decide. A person approves.");
  const flow = [
    ["Guardrail", "hide personal data, block prompt tricks", C.guard, C.guardTint],
    ["AI", "reads the email, writes the reply", C.ai, C.aiTint],
    ["Rules", "address, cutoff, stock, carrier", C.route, C.routeTint],
    ["Person", "approves every order and message", C.ink, "E7ECEA"],
    ["Log", "every AI call: tokens, time, flags", C.data, C.dataTint],
  ];
  const bw = 2.2, gap = 0.27;
  flow.forEach(([h, t, col, tint], i) => {
    const x = 0.6 + i * (bw + gap);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.3, w: bw, h: 2.3, fill: { color: tint }, line: { color: col, width: 1.5 }, rectRadius: 0.1 });
    txt(s, h, { x: x + 0.15, y: 2.5, w: bw - 0.3, h: 0.55, fontSize: 26, bold: true, color: col, align: "center" });
    txt(s, t, { x: x + 0.15, y: 3.2, w: bw - 0.3, h: 1.25, fontSize: 16, color: C.ink, align: "center" });
    if (i < flow.length - 1) s.addShape(pres.shapes.ISOSCELES_TRIANGLE, { x: x + bw + 0.04, y: 3.32, w: 0.2, h: 0.26, rotate: 90, fill: { color: C.slate }, line: { color: C.slate } });
  });
  const facts = [
    "Only 2 of the 10 order steps use AI",
    "AI never calculates a number: code does",
    "A number in AI text must match the data, or the template is used",
  ];
  facts.forEach((t, i) => {
    s.addShape(pres.shapes.OVAL, { x: 0.65, y: 5.12 + i * 0.55, w: 0.18, h: 0.18, fill: { color: C.ai }, line: { color: C.ai } });
    txt(s, t, { x: 1.0, y: 5.0 + i * 0.55, w: 11.5, h: 0.42, fontSize: 19, color: C.ink, valign: "middle" });
  });
  s.addNotes("AI is good at language, so it reads messy emails and writes replies. It is not trusted with arithmetic or decisions: cutoffs, carrier choice and accept-or-hold are fixed rules, so the same order always gets the same answer. A guardrail screens every email first, a person approves before anything reaches a client or the warehouse system, and every AI call is logged. The models are Claude Haiku and Sonnet on Amazon Bedrock.");
}

// ---------- 12. Architecture ----------
{
  const s = base("Built and running", C.data, "Live on AWS, deployed on every push");
  const box = (x, y, w, h, title, sub, col = C.ink, fill = C.white) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: col, width: 1.25 }, rectRadius: 0.06 });
    txt(s, title, { x: x + 0.1, y: y + 0.08, w: w - 0.2, h: 0.36, fontSize: 16, bold: true, color: col, align: "center" });
    if (sub) txt(s, sub, { x: x + 0.1, y: y + 0.44, w: w - 0.2, h: h - 0.5, fontSize: 12, color: C.inkSoft, align: "center" });
  };
  const arrow = (x1, y1, x2, y2) => s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), flipH: x2 < x1, flipV: y2 < y1, line: { color: C.slate, width: 1.25, endArrowType: "triangle" } });
  // AWS account frame
  s.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: 2.0, w: 8.5, h: 4.85, fill: { color: C.white }, line: { color: C.line, width: 1, dashType: "dash" } });
  txt(s, "AWS account (us-east-1)", { x: 0.75, y: 2.07, w: 4, h: 0.3, fontSize: 12, bold: true, color: C.slate });
  box(0.85, 2.5, 2.3, 1.0, "Amplify", "React website", C.data);
  box(3.65, 2.5, 2.9, 1.65, "EC2 (t3.small)", "Docker: Caddy (HTTPS)\n+ FastAPI: numbers + agents", C.ink);
  box(7.0, 2.5, 1.9, 1.0, "Bedrock", "Claude Haiku + Sonnet", C.ai, C.aiTint);
  box(3.65, 4.75, 2.9, 1.0, "RDS PostgreSQL", "private, encrypted", C.data);
  box(7.0, 3.85, 1.9, 0.95, "S3", "dataset, inputs", C.ink);
  box(7.0, 4.95, 1.9, 0.95, "Secrets Mgr", "settings, DB login", C.guard);
  box(0.85, 4.75, 2.3, 1.0, "ECR", "API images", C.ink);
  box(0.85, 3.75, 2.3, 0.8, "CloudWatch", "logs, 3 alarms", C.ink);
  txt(s, "IAM least privilege · GitHub signs in with OIDC: no access keys", { x: 0.85, y: 6.2, w: 8.1, h: 0.4, fontSize: 13, color: C.slate });
  arrow(3.15, 3.0, 3.65, 3.0);
  arrow(6.55, 3.0, 7.0, 3.0);
  arrow(5.1, 4.15, 5.1, 4.75);
  arrow(6.55, 3.9, 7.0, 4.3);
  arrow(6.55, 4.1, 7.0, 5.35);
  arrow(3.15, 5.25, 3.65, 3.9);
  // Right: quality numbers
  txt(s, "Every push to main", { x: 9.55, y: 2.0, w: 3.2, h: 0.4, fontSize: 18, bold: true, color: C.route });
  txt(s, "tests → build → deploy to AWS", { x: 9.55, y: 2.4, w: 3.2, h: 0.4, fontSize: 16, color: C.inkSoft });
  const q = [["387", "backend tests"], ["60", "frontend tests"], ["30", "browser end-to-end tests"]];
  q.forEach(([v, l], i) => {
    const y = 3.05 + i * 1.25;
    txt(s, v, { x: 9.55, y, w: 1.5, h: 0.75, fontSize: 40, bold: true, color: C.route, valign: "middle" });
    txt(s, l, { x: 11.05, y, w: 1.75, h: 0.75, fontSize: 16, color: C.inkSoft, valign: "middle" });
  });
  s.addNotes("The website runs on Amplify. The API runs in Docker on one small EC2 server, with Caddy for HTTPS, and talks to a private, encrypted PostgreSQL database on RDS. The AI is Claude on Amazon Bedrock. Every push to main runs the tests, builds the API image into ECR, restarts the server through Systems Manager and rebuilds the website, with no stored keys. Expected cost is about $37 a month plus a small Bedrock charge.");
}

// ---------- 13. Before vs after ----------
{
  const s = base("Measured impact", C.route, "Before and after, and how we measured it");
  const head = ["What", "Before", "After", "How we measured"];
  const rows = [
    ["On-time delivery", pct1(F.on_time_rate_today), `${pct1(F.on_time_realistic)} (realistic)`, `All ${F.deliveries.toLocaleString()} deliveries; each cause removed at an assumed success rate`],
    ["Routing tool alone", pct1(F.on_time_rate_today), pct1(F.on_time_if_only_routing_fixed), "Same model, only the causes routing can fix"],
    ["Net money per year", "–", usdM(realistic.net_benefit_per_year_usd), `6 months × 2; ${usdM(realistic.net_benefit_penalties_only_usd)} counting penalties only; costs are estimates`],
    ["Late same-day orders on time", "39%", "47%", "Rule replayed on 4,826 orders after 08:00"],
    ["Late shipments in the 08:00 top 20", "29% (any 20)", "63% (AUC 0.81)", "Risk board backtest on Aug–Sep, never seen"],
    ["Carrier-caused penalties", "–", "$261,900 / 6 months", "Carrier alone at fault; shared fault not claimed"],
    ["Causes hold on new months", "–", pct1(F.holdout_check.jul_sep_on_time_with_no_problem), "Rules from Apr–Jun, tested on Jul–Sep (no problem)"],
  ];
  const cell = (t, o = {}) => ({ text: t, options: { fontFace: FONT, ...o } });
  const table = [head.map((t) => cell(t, { bold: true, color: C.white, fill: { color: C.ink } }))].concat(
    rows.map((r, i) => r.map((t, j) => cell(t, { color: j === 1 ? C.late : j === 2 ? C.route : j === 3 ? C.inkSoft : C.ink, bold: j === 1 || j === 2 || j === 0, fontSize: j === 3 ? 13 : 16, fill: { color: i % 2 ? C.paper : C.white } }))));
  s.addTable(table, { x: 0.6, y: 2.0, w: 12.1, colW: [2.95, 2.0, 3.15, 4.0], fontSize: 16, rowH: 0.6, valign: "middle", border: { type: "solid", color: C.line, pt: 0.75 }, margin: [0.04, 0.12, 0.04, 0.12] });
  s.addNotes("Every number here comes from the 48,340 deliveries and can be re-run from our analysis script. The on-time and money figures are model estimates: the share of each cause removed is our stated assumption. The risk board and the holdout check are tested on months the rules never saw. Halcyon should measure the real before and after weekly once the fixes go live.");
}

// ---------- 14. Limitations and roadmap ----------
{
  const s = base("Limits and next steps", C.slate, "What is not proven yet, and what comes next");
  const cols = [
    ["Limits today", C.late, C.lateTint, [
      "Gains are estimates from history, not live results",
      "Fix success rates and costs are our assumptions",
      "$34 redelivery cost and carrier contract terms to confirm",
      "CSV exports, not live WMS or carrier feeds",
    ]],
    ["At 10x load", C.data, C.dataTint, [
      "One small server → 2+ servers behind a load balancer",
      "Bigger database, plus a read replica for dashboards",
      "AI calls through a queue, with higher Bedrock quotas",
      "Heavy numbers computed nightly, not per request",
    ]],
    ["Next 90 days", C.route, C.routeTint, [
      "Live feeds from the WMS and carriers",
      "Pilot with the 9 at-risk clients; measure weekly",
      "Routing pilot only on lanes with high route deviation",
      "Reuse for other Evoke logistics clients",
    ]],
  ];
  cols.forEach(([h, col, tint, items], i) => {
    const x = 0.6 + i * 4.1;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.05, w: 3.9, h: 4.8, fill: { color: C.white }, line: { color: C.line }, rectRadius: 0.08 });
    s.addShape(pres.shapes.RECTANGLE, { x, y: 2.05, w: 3.9, h: 0.7, fill: { color: tint }, line: { color: tint } });
    txt(s, h, { x: x + 0.25, y: 2.05, w: 3.5, h: 0.7, fontSize: 22, bold: true, color: col, valign: "middle" });
    s.addText(items.map((t, k) => ({ text: t, options: { bullet: { indent: 18 }, breakLine: k < items.length - 1 } })),
      { x: x + 0.2, y: 2.95, w: 3.55, h: 3.75, fontFace: FONT, fontSize: 17, color: C.ink, paraSpaceAfter: 12, valign: "top", margin: 0, isTextBox: true });
  });
  s.addNotes("We are honest about the limits: the gains are model estimates from six months of history, and the success rates and costs are our assumptions for Halcyon to challenge. At ten times the load, the single small server becomes two or more behind a load balancer, the database grows and gets a read replica, AI calls go through a queue, and heavy numbers are computed nightly. Next we would connect live feeds and run a pilot with the nine at-risk clients, measured every week.");
}

// ---------- 15. Thank you ----------
{
  n += 1;
  const s = pres.addSlide();
  s.background = { color: C.ink };
  txt(s, "Thank you", { x: 0.8, y: 1.2, w: 11.5, h: 1.2, fontSize: 64, bold: true, color: C.white });
  txt(s, `71% → ${pct1(F.on_time_realistic)} on time · ${usdM(realistic.net_benefit_per_year_usd)} a year · fix the causes, not just the routes`, { x: 0.8, y: 2.55, w: 11.8, h: 0.6, fontSize: 24, color: C.onInk });
  txt(s, "Try it live", { x: 0.8, y: 3.9, w: 6, h: 0.45, fontSize: 20, bold: true, color: C.white });
  txt(s, [
    { text: "Website   ", options: { color: "C9D1D6" } }, { text: "https://main.d19tzovsk3zuvo.amplifyapp.com", options: { color: C.white, bold: true, breakLine: true } },
    { text: "API          ", options: { color: "C9D1D6" } }, { text: "https://35-175-32-49.sslip.io", options: { color: C.white, bold: true } },
  ], { x: 0.8, y: 4.4, w: 11.5, h: 0.9, fontSize: 20, paraSpaceAfter: 6 });
  txt(s, "Team InfinityStacks:  Sravan Kumar D  ·  Sai M  ·  Dinesh K", { x: 0.8, y: 6.2, w: 11.5, h: 0.45, fontSize: 20, bold: true, color: C.white });
  s.addNotes("To sum up: the routing tool alone fixes the smallest cause. Fixing all five gets Halcyon to about 90% on time and about $1.4M a year, and DeliveryLens runs those fixes every day with AI that a person stays in charge of. The app is live on AWS; we are happy to take questions or show any screen.");
}

pres.writeFile({ fileName: OUT }).then(() => console.log("wrote", OUT));
