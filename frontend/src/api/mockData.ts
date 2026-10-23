/**
 * Offline fallback. Used when the API cannot be reached so the demo always works.
 * Numbers come from analysis/output/findings.json (see mockSnapshot.ts).
 * Agent responses here are rule-based stand-ins, clearly labelled as sample data in the UI.
 */
import { AT_RISK_CLIENTS, FINDINGS, MONTHLY, SAMPLE_DELIVERIES, SCORECARD } from './mockSnapshot';
import type {
  AgentRun,
  AskResult,
  CauseKey,
  CausesResponse,
  DelayAlertResult,
  DeliveryDetail,
  DeliverySummary,
  FixLevels,
  Kpis,
  OrderIntakeResult,
  SimulateResponse,
  TimelineEvent,
  VendorAssessment,
} from './types';
import { BENCHMARK, CAUSE_META, causeShort } from '../lib/causes';
import { simulateLocally } from '../lib/calc';
import { usd } from '../lib/format';

const F = FINDINGS;

export const mockKpis: Kpis = {
  deliveries: F.deliveries,
  period: [F.period[0], F.period[1]],
  on_time_rate: F.on_time_rate_today,
  benchmark_on_time_rate: BENCHMARK,
  late_deliveries: F.data_quality.late_deliveries,
  sla_penalties_usd: F.money.sla_penalties_6_months_usd,
  redelivery_cost_usd: F.money.redelivery_cost_6_months_usd,
  at_risk_clients: F.money.at_risk_clients,
  at_risk_revenue_usd: F.money.at_risk_annual_revenue_usd,
  routing_vendor_budget_usd: F.money.routing_vendor_budget_usd,
  monthly: MONTHLY,
};

export const mockCauses: CausesResponse = {
  causes: F.causes.map((c) => ({ ...c, cause: c.cause as CauseKey })),
  scenarios: {
    today: F.on_time_rate_today,
    all_fixed: F.on_time_if_all_fixed,
    routing_only: F.on_time_if_only_routing_fixed,
    process_only: F.on_time_if_only_process_fixed,
    no_problem_rate: F.on_time_rate_with_no_problem,
  },
};

export function mockCauseDeliveries(cause: CauseKey, limit = 8): DeliverySummary[] {
  return (SAMPLE_DELIVERIES[cause] ?? []).slice(0, limit);
}

function findSample(id: string): DeliverySummary | undefined {
  for (const list of Object.values(SAMPLE_DELIVERIES)) {
    const hit = list.find((d) => d.delivery_id === id);
    if (hit) return hit;
  }
  return undefined;
}

export function buildTimeline(d: DeliverySummary): TimelineEvent[] {
  const has = (c: CauseKey) => d.causes.includes(c);
  const events: TimelineEvent[] = [
    {
      ts: d.order_received_ts,
      label: `Order received by ${d.order_channel}`,
      detail: `${d.commitment_type.replace('_', '-')} promise, due ${d.promised_date}`,
      status: has('same_day_after_cutoff') ? 'problem' : 'neutral',
    },
    {
      ts: d.order_received_ts,
      label: has('incomplete_address') ? 'Address incomplete at intake' : 'Address complete',
      detail: has('incomplete_address') ? 'Order went ahead without the missing fields; carrier could not deliver first time.' : undefined,
      status: has('incomplete_address') ? 'problem' : 'ok',
    },
  ];
  if (d.pick_list_date) {
    events.push({
      ts: d.pick_list_date,
      label: 'Placed on pick list',
      detail: has('same_day_after_cutoff') ? 'Missed the 08:00 cutoff, so it waited for the next run.' : undefined,
      status: has('same_day_after_cutoff') ? 'problem' : 'ok',
    });
  }
  if (d.shipped_ts) {
    const far = has('stock_not_at_nearest');
    events.push({
      ts: d.shipped_ts,
      label: `Shipped from ${d.fulfilment_warehouse_id ?? 'warehouse'} by Carrier ${d.carrier_id}`,
      detail: far
        ? `Nearest warehouse ${d.nearest_warehouse_id} had no stock; ${d.distance_miles ?? '?'} miles to ${d.destination_region}.`
        : has('weak_carrier_lane')
          ? `Carrier ${d.carrier_id} is one of the weakest carriers into ${d.destination_region}.`
          : `${d.distance_miles ?? '?'} miles to ${d.destination_region}.`,
      status: far || has('weak_carrier_lane') ? 'problem' : 'ok',
    });
  }
  if (has('route_deviation') && d.planned_route_km && d.actual_route_km) {
    const over = Math.round((d.actual_route_km / d.planned_route_km - 1) * 100);
    events.push({
      ts: d.shipped_ts ?? d.promised_date,
      label: `Driver went ${over}% beyond the planned route`,
      detail: `${d.actual_route_km} km driven against ${d.planned_route_km} km planned.`,
      status: 'problem',
    });
  }
  events.push({ ts: d.promised_date, label: 'Promised delivery date', status: 'neutral' });
  events.push({
    ts: d.delivered_date,
    label: d.days_late > 0 ? `Delivered ${d.days_late} day${d.days_late === 1 ? '' : 's'} late` : 'Delivered on time',
    detail: d.redelivery_cost_usd ? `Redelivery cost ${usd(d.redelivery_cost_usd)}.` : undefined,
    status: d.days_late > 0 ? 'problem' : 'ok',
  });
  return events;
}

export function explain(d: DeliverySummary): string {
  if (d.causes.length === 0) return 'No known cause was found for this delivery.';
  const parts = d.causes.map((c) => {
    switch (c) {
      case 'incomplete_address':
        return 'the address was incomplete when the order came in';
      case 'same_day_after_cutoff':
        return 'it was a same-day order received after the 08:00 pick-list cutoff';
      case 'stock_not_at_nearest':
        return `the nearest warehouse (${d.nearest_warehouse_id}) had no stock, so it shipped from ${d.fulfilment_warehouse_id}`;
      case 'weak_carrier_lane':
        return `Carrier ${d.carrier_id} is weak into the ${d.destination_region}`;
      case 'route_deviation':
        return 'the driver went more than 20% beyond the planned route';
      default:
        return causeShort(c);
    }
  });
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `This delivery arrived ${d.days_late} day${d.days_late === 1 ? '' : 's'} late because ${joined}. ${CAUSE_META[d.causes[0]]?.fix ?? ''}`.trim();
}

export function mockDelivery(id: string): DeliveryDetail | null {
  const d = findSample(id);
  if (!d) return null;
  return { ...d, timeline: buildTimeline(d), explanation: explain(d) };
}

export const mockScorecard = SCORECARD;
export const mockAtRisk = AT_RISK_CLIENTS;

export function mockSimulate(fixes: FixLevels): SimulateResponse {
  return simulateLocally(fixes, {
    todayRate: F.on_time_rate_today,
    deliveries: F.deliveries,
    penaltiesUsd: F.money.sla_penalties_6_months_usd,
    causes: mockCauses.causes,
  });
}

export const mockVendor: VendorAssessment = {
  vendor_cost_usd: F.money.routing_vendor_budget_usd,
  at_risk_revenue_usd: F.money.at_risk_annual_revenue_usd,
  benchmark: BENCHMARK,
  today: F.on_time_rate_today,
  routing_only: F.on_time_if_only_routing_fixed,
  process_only: F.on_time_if_only_process_fixed,
  all_fixed: F.on_time_if_all_fixed,
  causes_vendor_addresses: ['weak_carrier_lane', 'route_deviation'],
  recommendation:
    'Hold the $680K routing contract. Fix order intake, the 08:00 cutoff and stock placement first, and reassign weak carrier lanes using data we already have.',
  reasons: [
    'Routing software only reaches the two routing causes. On its own it lifts on-time delivery to 78.6%, well short of the 94% benchmark.',
    'Three of the five causes start before a truck leaves the warehouse: incomplete addresses, same-day orders after 08:00 and stock in the wrong warehouse.',
    'Fixing those process causes alone reaches 86.7%. Adding carrier reassignment and route alerts reaches 96.6%.',
    '$14.2M of annual revenue from 9 clients is at risk; their on-time rate is 70.7%.',
  ],
};

/* ---------------- agents (rule-based stand-ins) ---------------- */

/** Same sample emails as backend/sample_emails, so live and sample modes behave alike. */
export const SAMPLE_EMAILS: { id: string; label: string; text: string }[] = [
  {
    id: "01_complete_next_day",
    label: "Client 042, next-day, complete address",
    text: "From: purchasing@client-042.example\nSent: 2026-10-23 07:15\nSubject: New order - Client 042\n\nHello Halcyon team,\n\nPlease ship the following for Client 042:\n- SKU HX-1001 x 12\n- SKU HX-2040 x 5\n\nShip to:\nName: Client 042 Receiving Dock\nStreet: 1200 Commerce Way\nCity: Columbus\nState: OH\nPostcode: 43215\nCountry: US\n\nRequested delivery: 2026-10-24 (next day please)\n\nThanks,\nDana, Purchasing, Client 042",
  },
  {
    id: "02_incomplete_address",
    label: "Client 117, standard, address incomplete",
    text: "From: orders@client-117.example\nSent: 2026-10-23 06:50\nSubject: PO for Client 117\n\nHi,\n\nClient 117 needs these sent out:\n- SKU HX-3300 x 40\n- SKU HX-0450 x 8\n\nShip to:\nName: Client 117 Warehouse\nCity: Atlanta\nState: GA\n\nStandard delivery is fine, by 2026-10-28.\n\nRegards,\nClient 117 ops",
  },
  {
    id: "03_same_day_after_cutoff",
    label: "Client 205, same-day, received 09:40",
    text: "From: urgent@client-205.example\nSent: 2026-10-23 09:40\nSubject: URGENT same day - Client 205\n\nTeam,\n\nWe need this SAME DAY please, it is for a store opening.\n- SKU HX-7777 x 3\n\nShip to:\nName: Client 205 Flagship Store\nStreet: 88 Harbor Street\nCity: Savannah\nState: GA\nPostcode: 31401\nCountry: US\n\nRequested delivery: 2026-10-23\n\nThanks,\nClient 205",
  },
  {
    id: "04_same_day_before_cutoff",
    label: "Client 066, same-day, received 07:05",
    text: "From: buyer@client-066.example\nSent: 2026-10-23 07:05\nSubject: Same day order - Client 066\n\nGood morning,\n\nSame-day delivery please for Client 066:\n- SKU HX-5120 x 20\n\nShip to:\nName: Client 066 Distribution Center\nStreet: 450 Lakeshore Drive\nCity: Chicago\nState: IL\nPostcode: 60611\nCountry: US\n\nRequested delivery: 2026-10-23\n\nBest,\nClient 066 buying team",
  },
  {
    id: "05_one_line_address",
    label: "Client 150, address on one line",
    text: "From: logistics@client-150.example\nSent: 2026-10-23 11:20\nSubject: Order for Client 150\n\nHello,\n\nPlease send 6 x SKU HX-9001 and 2 x SKU HX-9002 to:\nDeliver to: Client 150 Receiving, 77 Pine Avenue, Denver, CO 80202, US\n\nNeeded by 2026-10-27, standard shipping.\n\nKind regards,\nClient 150 logistics (call 303-555-0142 with questions)",
  },
];

const REQUIRED_ADDRESS_FIELDS = ['street', 'city', 'state', 'zip', 'country'] as const;
const FIELD_WORDS: Record<string, string> = { street: 'street address', city: 'city', state: 'state', zip: 'postcode (ZIP)', country: 'country' };
const US_STATE = /\b(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/;

function labelled(text: string, name: string): string | null {
  const m = text.match(new RegExp(`^[ \\t]*${name}[ \\t]*:[ \\t]*(.+)$`, 'im'));
  return m?.[1]?.trim() || null;
}

export function mockOrderIntake(email: string): OrderIntakeResult {
  const text = email.replace(/\r/g, '');
  const client = text.match(/Client \d{3}/)?.[0] ?? null;
  const po = text.match(/\bPO[- ]?\d+/i)?.[0] ?? null;
  const received = labelled(text, 'Sent');
  const lower = text.toLowerCase();
  const commitment = /same[- ]day/.test(lower) ? 'same_day' : /next[- ]day/.test(lower) ? 'next_day' : 'standard';
  const requested = text.match(/(?:requested delivery|needed by|by)\s*:?\s*(\d{4}-\d{2}-\d{2})/i)?.[1] ?? null;

  const lines = [
    ...[...text.matchAll(/SKU\s+([A-Z0-9-]+)\s*x\s*(\d+)/gi)].map((m) => ({ sku: m[1].toUpperCase(), quantity: Number(m[2]) })),
    ...[...text.matchAll(/(\d+)\s*x\s*SKU\s+([A-Z0-9-]+)/gi)].map((m) => ({ sku: m[2].toUpperCase(), quantity: Number(m[1]) })),
  ];

  // Address: labelled block ("Street: ...") or one line ("Deliver to: name, street, city, ST 12345, US").
  const fields: Record<string, string | null> = {
    name: labelled(text, 'Name'),
    street: labelled(text, 'Street'),
    city: labelled(text, 'City'),
    state: labelled(text, 'State'),
    zip: labelled(text, 'Postcode') ?? labelled(text, 'ZIP'),
    country: labelled(text, 'Country'),
  };
  const oneLine = text.match(/\b(?:deliver to|ship to)\b[ \t]*:[ \t]*([^\n]+)/i)?.[1];
  if (oneLine && !fields.street) {
    const parts = oneLine.split(',').map((x) => x.trim());
    fields.name = fields.name ?? (parts[0] && !/^\d/.test(parts[0]) ? parts[0] : null);
    fields.street = parts.find((x) => /^\d+\s+\w+/.test(x)) ?? null;
    const stZip = parts.find((x) => US_STATE.test(x) && /\d{5}/.test(x));
    fields.state = fields.state ?? stZip?.match(US_STATE)?.[0] ?? null;
    fields.zip = fields.zip ?? stZip?.match(/\d{5}(?:-\d{4})?/)?.[0] ?? null;
    const idx = stZip ? parts.indexOf(stZip) : -1;
    fields.city = fields.city ?? (idx > 0 ? parts[idx - 1] : null);
    fields.country = fields.country ?? (idx >= 0 && parts[idx + 1] ? parts[idx + 1] : null);
  }
  const missing = REQUIRED_ADDRESS_FIELDS.filter((k) => !fields[k]);

  const hm = received?.match(/(\d{1,2}):(\d{2})/);
  const minutes = hm ? Number(hm[1]) * 60 + Number(hm[2]) : null;
  const afterCutoff = commitment === 'same_day' && minutes != null && minutes >= 8 * 60;
  const same_day_warning = afterCutoff
    ? `Same-day order received at ${hm![0]}, after the 08:00 pick-list cutoff. Same-day orders received after the cutoff are on time only 39% of the time; offer next-day delivery instead.`
    : null;

  const follow_up_email = missing.length
    ? `Subject: Missing delivery details for your order

Hello${client ? ` ${client}` : ''},

Thank you for your order. Before we can put it on the pick list we need the following delivery details:
${missing.map((m) => `- ${FIELD_WORDS[m]}`).join('\n')}

Please reply with the missing information. Orders with a complete address ship on the next pick list, so a quick reply keeps your delivery on time.

Kind regards,
Halcyon Logistics Customer Success`
    : null;

  return {
    client,
    po_number: po,
    commitment_type: commitment,
    requested_date: requested,
    received_at: received,
    lines,
    address: { complete: missing.length === 0, fields, missing: [...missing] },
    same_day_warning,
    follow_up_email,
  };
}

export function mockDelayAlert(deliveryId: string): DelayAlertResult {
  const d = findSample(deliveryId);
  const reason = d ? explain(d).split('. ')[0].replace(/^This delivery arrived/, 'your delivery is expected to arrive') : '';
  return {
    delivery_id: deliveryId,
    channel: 'email',
    subject: `Update on delivery ${deliveryId}`,
    body: `Hello,

We want to let you know before you have to ask: ${reason || `delivery ${deliveryId} is running late`}.

We have already taken action and will confirm the new delivery time today. If the timing does not work for you, reply to this email and we will arrange an alternative.

Halcyon Customer Success`,
  };
}

const ANSWERS: { match: RegExp; answer: string }[] = [
  {
    match: /vendor|routing|680/i,
    answer:
      'The $680K routing vendor only addresses two of the five causes (weak carrier lanes and route deviation). On its own it takes on-time delivery from 71% to 78.6%. Fixing the three process causes reaches 86.7%, and fixing all five reaches 96.6%, above the 94% benchmark.',
  },
  {
    match: /biggest|main|top|why/i,
    answer:
      'The biggest single cause is incomplete addresses at order intake: worth 6.8 points of on-time delivery. Those orders are on time only 35% of the time, and email orders are five times more likely to have an incomplete address than EDI or API orders.',
  },
  {
    match: /client|revenue|risk|leave/i,
    answer:
      '9 clients worth $14.2M a year are threatening to leave. Their on-time rate is 70.7%. They raised 24 of the 34 complaints, and 12 complaints were about not being told about a delay.',
  },
  {
    match: /carrier/i,
    answer:
      'Carriers A, B and C are around 75% on time everywhere. Carrier D is weak in the Midwest and Southeast, E in the West, and F in the Northeast and Southeast (53–56%). Moving those lanes to the best carrier per region is worth 5.7 points.',
  },
  {
    match: /penalt|cost|money/i,
    answer:
      'In six months Halcyon paid $872K in SLA penalties and $477K in redelivery costs. Incomplete addresses alone account for $287K of penalties.',
  },
  {
    match: /cutoff|same[- ]day|08/i,
    answer:
      'Same-day orders received after the 08:00 pick-list cutoff are on time only 39% of the time. Warning at intake and agreeing a realistic date is worth 5.3 points.',
  },
];

export function mockAsk(question: string): AskResult {
  const hit = ANSWERS.find((a) => a.match.test(question));
  return {
    answer:
      hit?.answer ??
      'On-time delivery is 71% against a 94% benchmark. Five causes explain the gap; fixing all of them is projected to reach 96.6%. Try asking about the routing vendor, carriers, at-risk clients or penalties.',
    sources: ['analysis/output/findings.json'],
  };
}

export const mockRuns: AgentRun[] = [
  {
    run_id: 'run-0007',
    agent: 'ask',
    started_at: '2026-10-23T10:41:12Z',
    duration_ms: 2140,
    status: 'success',
    input_summary: 'Is the routing vendor worth $680K?',
    output_summary: 'Vendor alone reaches 78.6%; process fixes reach 86.7%.',
    model: 'claude (Bedrock)',
  },
  {
    run_id: 'run-0006',
    agent: 'delay-alert',
    started_at: '2026-10-23T10:32:50Z',
    duration_ms: 1870,
    status: 'success',
    input_summary: 'Delivery D000009',
    output_summary: 'Drafted proactive delay email to Client 168.',
    model: 'claude (Bedrock)',
  },
  {
    run_id: 'run-0005',
    agent: 'order-intake',
    started_at: '2026-10-23T10:18:03Z',
    duration_ms: 3320,
    status: 'success',
    input_summary: 'Order email from Client 117',
    output_summary: 'Address missing street, postcode and country; follow-up drafted.',
    model: 'claude (Bedrock)',
  },
  {
    run_id: 'run-0004',
    agent: 'order-intake',
    started_at: '2026-10-23T09:55:41Z',
    duration_ms: 2950,
    status: 'success',
    input_summary: 'Order email from Client 042',
    output_summary: 'Address complete; order ready for pick list.',
    model: 'claude (Bedrock)',
  },
  {
    run_id: 'run-0003',
    agent: 'ask',
    started_at: '2026-10-23T09:40:19Z',
    duration_ms: 4210,
    status: 'error',
    input_summary: 'Which warehouse runs out of stock most?',
    output_summary: 'Timed out reaching the model; retried successfully as run-0004.',
    model: 'claude (Bedrock)',
  },
];
