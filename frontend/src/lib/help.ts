/**
 * Content for the "What am I looking at?" panel on every page. Plain English, one line per element,
 * each with a concrete example from the data (48,340 deliveries, 1 Apr – 25 Sep 2026).
 */
export interface HelpItem {
  term: string;
  text: string;
  example?: string;
}

export interface HelpContent {
  intro?: string;
  items: HelpItem[];
}

export const HELP: Record<string, HelpContent> = {
  '/how-it-works': {
    intro: 'This page is the map. It shows how one order travels through Halcyon today, where it goes wrong, and where DeliveryLens steps in.',
    items: [
      { term: 'The three numbers', text: 'On-time delivery today, what good companies reach, and the yearly revenue of the clients who say they may leave.', example: '71 of every 100 deliveries arrive on or before the promised date; the industry benchmark is 94.' },
      { term: 'The order journey (10 steps)', text: 'Every order follows these steps from left to right. Scroll sideways on a small screen.', example: 'An email order is typed into the warehouse system by hand at step 2, then waits for the 08:00 pick list at step 3.' },
      { term: 'Amber "pts" markers', text: 'Where one of the five causes hits the journey, and how many points of on-time delivery it costs today. They add up to 28.0 of the 29.0 points lost.', example: 'Weak carrier on a lane costs 7.7 points at step 5, when the carrier is chosen.' },
      { term: 'Today / With DeliveryLens switch', text: 'Today shows the journey as it runs now. With DeliveryLens adds a badge on each step where we act; select a badge to open the page that shows it.', example: 'The Address check badge sits at step 2 and opens the Order desk.' },
      { term: 'Routing tool bracket', text: 'The only part of the journey the $680K routing tool changes: the drive itself.', example: 'Route deviation costs 3.1 points, the smallest of the five causes.' },
      { term: 'Legend', text: 'Four kinds of worker: AI agent (purple), Rule (teal), Data lookup (blue), Guardrail (red). AI only handles language; numbers and decisions are rules and data, so they are repeatable and auditable.' },
      { term: 'Start here', text: 'The suggested order to visit the other pages, with what each one answers.' },
    ],
  },
  '/order-desk': {
    intro: 'A live demo of DeliveryLens doing the job staff do by hand today: reading client order emails and entering them into the warehouse system (WMS).',
    items: [
      { term: 'Inbox (left)', text: 'Twelve sample client emails, each built to show one situation. The chip shows what DeliveryLens should decide; the status shows whether it has been run.', example: 'Email 02 "Missing postcode" should end On hold.' },
      { term: 'Selected email (middle)', text: 'The email exactly as the client sent it: sender, time, subject, body and any attachment.', example: 'Email 12 has its order lines in a CSV file, not in the body.' },
      { term: 'Run DeliveryLens on this email', text: 'Sends the email through the 10-step pipeline. Run all 12 does every email and counts how many match the expected result.' },
      { term: 'Pipeline trace', text: 'Each step in order: who did it (AI agent, Rule, Data lookup or Guardrail), whether it passed, warned, failed or was skipped, a one-line reason and how long it took. Select Details to see the raw values.', example: 'Email 09: the carrier step warns that the rate card would pick Carrier F (54% on time to the Southeast) and picks Carrier B instead.' },
      { term: 'Decision card', text: 'Accepted (goes onto the pick list), On hold (waiting for the client), Needs review (a person decides) or Blocked (unsafe). The tick shows it matches the expected result.', example: 'Email 04 is accepted but re-promised for the next day, because it arrived at 09:30, after the 08:00 pick list.' },
      { term: 'Draft to the client', text: 'A reply written by the AI for a person to approve. Nothing is sent automatically.' },
      { term: 'Warehouse system (WMS) table', text: 'The orders DeliveryLens has created in the warehouse system, with warehouse, carrier and pick-list date. Reset demo empties it and marks every email as new again.', example: 'Email 08 ships from W1 (Midwest 1) because W5 (West) has no stock.' },
      { term: 'AI model', text: 'Which language model is answering: Mock (canned answers, no key needed), Gemini or Bedrock. Offline, the page shows pre-computed sample traces, labelled as such.' },
    ],
  },
  '/overview': {
    items: [
      { term: 'Headline', text: 'On-time delivery today against the 94% benchmark, and where the realistic plan gets to.', example: '71% today; 90.2% with all five fixes working as well as we realistically expect.' },
      { term: 'Where each option gets on-time delivery', text: 'One track, one marker per option. Further right is better.', example: 'Routing vendor only reaches 80.2% at best; 99.0% is the ceiling if every cause were fully removed, not a forecast.' },
      { term: 'Four cost cards', text: 'Late deliveries, SLA penalties and redelivery cost over the 6 months, and the yearly revenue of the 9 clients threatening to leave.', example: '14,019 late deliveries cost $872K in penalties.' },
      { term: 'Monthly on-time delivery', text: 'The on-time rate each month against the benchmark line. It stays near 71% every month, so this is not a seasonal blip.' },
      { term: 'Points each cause costs today', text: 'How many on-time points each of the five causes takes away, shared fairly where a delivery has two problems.', example: 'Weak carrier on a lane 7.7 pts, incomplete address 6.9 pts.' },
    ],
  },
  '/why-late': {
    items: [
      { term: 'Waterfall chart', text: 'Starts at 71% today; each bar adds the points you would win back by removing one cause, ending at the 99.0% ceiling. The vertical axis starts at 60%.', example: 'Incomplete address adds 6.9 points.' },
      { term: 'Cause table', text: 'For each cause: how many deliveries it touched, how often those were on time, and its share of late deliveries. Select a row to see real late deliveries behind it.', example: 'Same-day orders after 08:00 are on time 39% of the time.' },
      { term: 'Sample late deliveries', text: 'Real deliveries from the data with that cause. Select one to open its timeline.' },
      { term: 'Delivery drawer', text: 'One delivery step by step, with the problem steps highlighted, and a plain explanation of why it was late.' },
      { term: 'Draft delay alert', text: 'The Delay Alert Agent (AI) writes a message to the client with a forecast delay and new date, for a person to send. 12 of 34 complaints say "nobody told us".' },
    ],
  },
  '/vendor': {
    items: [
      { term: 'Projected on-time bars', text: 'Where each option gets on-time delivery, against the 94% benchmark.', example: 'The $680K routing vendor alone: 80.2% at best. All five fixes, realistic: 90.2%.' },
      { term: 'What the vendor really adds', text: 'Which causes need the vendor and which do not. Only route deviation (about 3 points) needs routing software; carrier choice is a spreadsheet change.' },
      { term: 'Money bars', text: 'The vendor contract next to the $14.2M a year of revenue at risk.' },
      { term: 'Business case table', text: 'For each option: penalties and redeliveries avoided per year, cost per year and net benefit. The cautious column counts penalties only.', example: 'Vendor only is −$160K a year on the cautious view.' },
      { term: '"Each fix must work ~84% of the time"', text: 'How well every fix has to work, on average, for Halcyon to pass the 94% benchmark.' },
    ],
  },
  '/what-if': {
    items: [
      { term: 'Sliders', text: 'How well each fix works, from 0% (not at all) to 100% (cause fully removed). They start at the realistic plan.', example: 'Order intake agent at 80% means it catches 8 of 10 incomplete addresses.' },
      { term: 'Presets', text: 'One click to set every slider: Realistic plan, Routing vendor only, Process fixes only, Ceiling (all fully fixed), or Reset to nothing fixed.' },
      { term: 'Projected on-time gauge', text: 'Where on-time delivery lands with these settings, and how far from the 94% benchmark.' },
      { term: 'Points per cause, penalties avoided', text: 'What each fix adds, and the late deliveries and SLA penalties avoided over the 6 months.', example: 'The three process fixes fully working reach 86.7%, still 7.3 points short.' },
    ],
  },
  '/carriers': {
    items: [
      { term: 'Heatmap', text: 'On-time rate for each carrier (rows) to each region (columns). Dark amber cells are weak lanes; outlined teal cells are the best carrier for the region.', example: 'Carrier F, the preferred supplier, is about 54% on time to the Southeast.' },
      { term: 'Weak lane', text: 'A carrier well below the others in that region once the other four causes are taken out, so the comparison is fair. Seven lanes: D everywhere, E to the West, F to the Northeast and Southeast.' },
      { term: 'Recommended carrier per region', text: 'The carrier the Carrier advisor (a rule) would pick for each region. This needs a spreadsheet change, not new software.' },
      { term: 'Carrier scorecard', text: 'Every carrier over 6 months: deliveries, on-time rate, how delivery updates arrive (API, portal or batch file), and base rate.', example: 'Carrier D has no API: updates come through a portal.' },
    ],
  },
  '/clients': {
    items: [
      { term: 'At-risk accounts table', text: 'The 9 clients that have told Halcyon they may leave, sorted by yearly revenue: on-time rate, penalties paid to them, how they order, and the main causes of their late deliveries.' },
      { term: 'What sets them apart', text: 'Their deliveries are no later than anyone else’s (70.7% vs 71.1% on time). The difference is complaints: 24 of the 34 come from them, many saying "nobody told us".' },
      { term: 'Cause chips', text: 'The two causes that hit each client most often.', example: 'A client ordering by email usually shows Incomplete address.' },
    ],
  },
  '/stock-routes': {
    items: [
      { term: 'Stock-outs by warehouse', text: 'For each warehouse, how often the nearest warehouse had no stock, and on-time delivery with and without stock.', example: 'About 12% of orders ship from further away; those are on time about 50% of the time.' },
      { term: 'Worst 10 clients by stock-out', text: 'The clients whose orders most often ship from a further warehouse. Good candidates for moving stock closer.' },
      { term: 'Route deviation by carrier and region', text: 'How often drivers go more than 20% beyond the planned route, and the on-time cost when they do. This is the only cause a routing tool fixes.', example: 'Planned 150 km, drove 190 km.' },
    ],
  },
  '/order-intake': {
    intro: 'The single-email version of the Order Intake Agent. Paste any email; for the full pipeline with the warehouse system, use the Order desk.',
    items: [
      { term: 'Order email', text: 'Pick a sample or paste your own email, then select Check this order.' },
      { term: 'Extracted order', text: 'What the AI read from the email: client, PO, promise type, received time and order lines.' },
      { term: 'Address check', text: 'A rule checks name, street, city, state and ZIP. Missing fields are highlighted.', example: 'The Client 117 sample is missing street and ZIP code, so it is not ready for the pick list.' },
      { term: 'Same-day warning', text: 'Shown when a same-day order arrives after the 08:00 pick list; those are on time only 39% of the time.' },
      { term: 'Draft follow-up', text: 'A reply asking the client for what is missing, for a person to send.' },
    ],
  },
  '/ask': {
    items: [
      { term: 'Suggested questions', text: 'One click to ask a common question.', example: '"Which carriers are weak, and where?"' },
      { term: 'Answers', text: 'Ask DeliveryLens (AI) picks the right figures from the same analysis behind every page and answers in plain English. It does not make up numbers: it can only use the data tools it is given.' },
    ],
  },
  '/activity': {
    items: [
      { term: 'Agent run log', text: 'Every AI agent call: when, which agent, what went in, what came out, how long it took, and whether it ran or was blocked by a guardrail.', example: 'A run of the Order desk on email 10 shows status blocked.' },
      { term: 'Refresh', text: 'Loads the latest runs.' },
    ],
  },
};
