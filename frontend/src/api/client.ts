/**
 * The only module that talks to the network.
 *
 * Every call returns `{ data, source }`. If the API cannot be reached (network
 * error, timeout, 404 for a not-yet-built endpoint, 5xx) the call falls back to
 * the static snapshot in mockData.ts and `source` is 'sample'. The app-wide
 * connection status drives the "showing sample data" banner.
 *
 * To align with the backend: adjust paths in ENDPOINTS, field names in
 * types.ts, and the small normalise* functions below.
 */
import * as mock from './mockData';
import type {
  AgentRun,
  AskResult,
  AtRiskClient,
  CarrierScorecard,
  CauseKey,
  CausesResponse,
  DataSource,
  DelayAlertResult,
  DeskMessage,
  DeskMessageDetail,
  DeskProcessAll,
  DeskProcessResult,
  WmsOrder,
  DeliveryDetail,
  DeliverySummary,
  FixLevels,
  Health,
  Kpis,
  OrderIntakeResult,
  RoiResponse,
  RoiScenario,
  RouteDeviation,
  SimulateResponse,
  StockPlacement,
  VendorAssessment,
} from './types';

export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
/** Optional shared demo token; sent as X-Demo-Token on agent calls when set at build time. */
const DEMO_TOKEN = (import.meta.env.VITE_DEMO_TOKEN || '').trim();
const TIMEOUT_MS = 8000;
const AGENT_TIMEOUT_MS = 60000;

export interface Result<T> {
  data: T;
  source: DataSource;
}

/* ---------- connection status (for the banner) ---------- */

export type ApiStatus = 'unknown' | 'live' | 'offline';
let status: ApiStatus = 'unknown';
let offlineSince = 0;
/** After a failed connection, serve sample data without retrying for this long (keeps the demo fast and the console quiet). */
const OFFLINE_RETRY_MS = 30000;
const listeners = new Set<(s: ApiStatus) => void>();

export function getApiStatus(): ApiStatus {
  return status;
}

export function subscribeApiStatus(fn: (s: ApiStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setStatus(next: ApiStatus) {
  if (next === 'offline') offlineSince = Date.now();
  if (next === status) return;
  status = next;
  listeners.forEach((fn) => fn(next));
}

/* ---------- core fetch ---------- */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function http<T>(path: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/api${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = (await res.json()) as { detail?: unknown; error?: { message?: string } };
        if (body?.error?.message) detail = body.error.message;
        else if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      } catch {
        /* body was not JSON */
      }
      throw new ApiError(friendlyMessage(res.status, detail), res.status);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Plain-language messages for the errors a person can do something about. */
export function friendlyMessage(status: number, detail: string): string {
  if (status === 401 || status === 403)
    return 'The agents need a valid demo access token. Ask the DeliveryLens team for the token, or set VITE_DEMO_TOKEN when building the app.';
  if (status === 429) return 'Too many agent requests in a short time. Wait a minute, then try again.';
  return detail || `Request failed (${status})`;
}

/**
 * Analytics pages fall back to sample data when the API is unreachable or an endpoint does not exist yet.
 * Agent calls fall back only when the API cannot be reached at all: a server error from a live agent is
 * shown as an error, never replaced by a rule-based stand-in.
 */
function shouldFallback(err: unknown, kind: FallbackKind): boolean {
  if (err instanceof ApiError) {
    if (kind === 'analytics') return err.status === 404 || err.status >= 500;
    // Order desk: the sample inbox stands in when the API is unreachable or the desk endpoints are not deployed yet.
    if (kind === 'desk') return err.status === 404;
    return false;
  }
  return true; // network error, CORS, abort/timeout
}

type FallbackKind = 'analytics' | 'agent' | 'desk';

async function withFallback<T>(call: () => Promise<T>, fallback: () => T | Promise<T>, kind: FallbackKind = 'analytics'): Promise<Result<T>> {
  if (status === 'unknown') await probeApi();
  if (status === 'offline' && Date.now() - offlineSince < OFFLINE_RETRY_MS) {
    return { data: await fallback(), source: 'sample' };
  }
  try {
    const data = await call();
    setStatus('live');
    return { data, source: 'live' };
  } catch (err) {
    if (!shouldFallback(err, kind)) throw err;
    if (!(err instanceof ApiError)) setStatus('offline');
    return { data: await fallback(), source: 'sample' };
  }
}

/* ---------- normalisers: backend response -> UI types ----------
 * Written against the FastAPI backend in backend/app/api (23 Oct 2026). Each one also accepts the
 * UI's own field names, so the mock data and older/newer backend shapes keep working. */

type Loose = Record<string, unknown>;
const obj = (x: unknown): Loose => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Loose) : {});
const numOr = (x: unknown, d: number): number => (typeof x === 'number' && !Number.isNaN(x) ? x : d);
const strOr = (x: unknown, d: string): string => (typeof x === 'string' ? x : d);
const first = (r: Loose, ...keys: string[]): unknown => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null) return r[k];
  return undefined;
};

function list(raw: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  const r = obj(raw);
  for (const k of keys) if (Array.isArray(r[k])) return r[k] as unknown[];
  return [];
}

function causeKeys(raw: unknown): CauseKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => (typeof c === 'string' ? c : strOr(obj(c).cause, ''))).filter(Boolean) as CauseKey[];
}

export function normaliseKpis(raw: unknown): Kpis {
  const r = obj(raw);
  const m = mock.mockKpis;
  const months = list(first(r, 'monthly', 'by_month'));
  const deliveries = numOr(r.deliveries, m.deliveries);
  const period = Array.isArray(r.period) && r.period.length === 2 ? (r.period as [string, string]) : m.period;
  return {
    deliveries,
    period,
    on_time_rate: numOr(first(r, 'on_time_rate', 'on_time_rate_today'), m.on_time_rate),
    benchmark_on_time_rate: numOr(first(r, 'benchmark_on_time_rate', 'benchmark'), m.benchmark_on_time_rate),
    late_deliveries: numOr(first(r, 'late_deliveries', 'late'), m.late_deliveries),
    sla_penalties_usd: numOr(first(r, 'sla_penalties_usd', 'sla_penalties_6_months_usd'), m.sla_penalties_usd),
    redelivery_cost_usd: numOr(first(r, 'redelivery_cost_usd', 'redelivery_cost_6_months_usd'), m.redelivery_cost_usd),
    at_risk_clients: numOr(r.at_risk_clients, m.at_risk_clients),
    at_risk_revenue_usd: numOr(first(r, 'at_risk_revenue_usd', 'at_risk_annual_revenue_usd'), m.at_risk_revenue_usd),
    routing_vendor_budget_usd: numOr(first(r, 'routing_vendor_budget_usd', 'budget_usd'), m.routing_vendor_budget_usd),
    monthly: months.length
      ? months.map((x) => {
          const o = obj(x);
          const n = numOr(o.deliveries, 0);
          const rate = numOr(o.on_time_rate, 0);
          return {
            month: strOr(o.month, ''),
            deliveries: n,
            on_time_rate: rate,
            late: numOr(o.late, Math.round(n * (1 - rate))),
            penalties_usd: numOr(o.penalties_usd, 0),
          };
        })
      : m.monthly,
  };
}

export function normaliseCauses(raw: unknown): CausesResponse {
  const r = obj(raw);
  const rows = list(raw, 'causes', 'rows').map((x) => {
    const o = obj(x);
    return {
      cause: strOr(o.cause, '') as CauseKey,
      label: strOr(o.label, ''),
      deliveries: numOr(o.deliveries, 0),
      on_time_rate: numOr(o.on_time_rate, 0),
      share_of_late_deliveries: numOr(first(o, 'share_of_late_deliveries', 'share_of_late'), 0),
      points_gained_if_fixed_alone: numOr(first(o, 'points_gained_if_fixed_alone', 'points_if_fixed_alone'), 0),
      fair_share_points: numOr(o.fair_share_points, 0),
      sla_penalties_usd: numOr(o.sla_penalties_usd, 0),
      realistic_effectiveness: typeof o.realistic_effectiveness === 'number' ? o.realistic_effectiveness : undefined,
      fix_cost_per_year_usd: typeof o.fix_cost_per_year_usd === 'number' ? o.fix_cost_per_year_usd : undefined,
    };
  });
  const s = obj(r.scenarios);
  const m = mock.mockCauses.scenarios;
  return {
    causes: rows,
    scenarios: {
      today: numOr(first(s, 'today', 'on_time_rate_today'), m.today),
      all_fixed: numOr(first(s, 'all_fixed', 'ceiling', 'on_time_if_all_fixed'), m.all_fixed),
      realistic: numOr(first(s, 'realistic', 'on_time_realistic'), m.realistic),
      routing_only: numOr(first(s, 'routing_only', 'routing_only_ceiling', 'on_time_if_only_routing_fixed'), m.routing_only),
      process_only: numOr(first(s, 'process_only', 'on_time_if_only_process_fixed'), m.process_only),
      no_problem_rate: numOr(first(s, 'no_problem_rate', 'on_time_rate_with_no_problem'), m.no_problem_rate),
    },
  };
}

function normaliseDeliverySummary(x: unknown): DeliverySummary {
  const o = obj(x);
  return {
    ...(o as unknown as DeliverySummary),
    delivery_id: strOr(o.delivery_id, ''),
    client_id: strOr(o.client_id, ''),
    order_channel: strOr(o.order_channel, ''),
    commitment_type: strOr(o.commitment_type, ''),
    order_received_ts: strOr(o.order_received_ts, ''),
    promised_date: strOr(o.promised_date, ''),
    delivered_date: strOr(o.delivered_date, ''),
    days_late: numOr(o.days_late, 0),
    destination_region: strOr(o.destination_region, ''),
    carrier_id: strOr(o.carrier_id, ''),
    causes: causeKeys(o.causes),
  };
}

export function normaliseDelivery(raw: unknown): DeliveryDetail {
  const r = obj(raw);
  // Backend nests the row under `delivery` and returns causes as {cause, label}.
  const summary = normaliseDeliverySummary({ ...obj(r.delivery ?? r), causes: r.causes });
  // The UI builds its richer timeline from the row itself (problem steps highlighted);
  // the backend's explanation is kept as written.
  return { ...summary, timeline: mock.buildTimeline(summary), explanation: strOr(r.explanation, '') || mock.explain(summary) };
}

export function normaliseScorecard(raw: unknown): CarrierScorecard {
  const r = obj(raw);
  const weakLanes = list(r.weak_lanes).map((w) => obj(w));
  const isWeak = (c: string, region: string) => weakLanes.some((w) => w.carrier_id === c && w.region === region);

  const carriers = list(raw, 'carriers', 'scorecard').map((x) => {
    const o = obj(x);
    const id = strOr(o.carrier_id, '');
    return {
      carrier_id: id,
      carrier_name: strOr(o.carrier_name, `Carrier ${id}`),
      deliveries: numOr(o.deliveries, 0),
      on_time_rate: numOr(o.on_time_rate, 0),
      avg_days_late: numOr(o.avg_days_late, Number.NaN),
      has_api: o.has_api === true || o.has_api === 'Y',
      event_feed: strOr(first(o, 'event_feed', 'delivery_event_feed'), ''),
      preferred_supplier: first(o, 'preferred_supplier', 'preferred') === true,
      base_rate_usd: numOr(o.base_rate_usd, 0),
      weak_regions: Array.isArray(o.weak_regions)
        ? (o.weak_regions as string[])
        : weakLanes.filter((w) => w.carrier_id === id).map((w) => strOr(w.region, '')),
    };
  });

  // matrix: either [{carrier_id, region, on_time_rate}] or {region: {carrier: rate}}
  let matrix: CarrierScorecard['matrix'];
  if (Array.isArray(r.matrix)) {
    matrix = (r.matrix as unknown[]).map((x) => {
      const o = obj(x);
      const c = strOr(o.carrier_id, '');
      const region = strOr(o.region, '');
      return { carrier_id: c, region, deliveries: numOr(o.deliveries, 0), on_time_rate: numOr(o.on_time_rate, 0), weak: o.weak === true || isWeak(c, region) };
    });
  } else {
    matrix = Object.entries(obj(r.matrix)).flatMap(([region, row]) =>
      Object.entries(obj(row)).map(([c, rate]) => ({ carrier_id: c, region, deliveries: 0, on_time_rate: numOr(rate, 0), weak: isWeak(c, region) })),
    );
  }

  const worstIn = (region: string) => [...matrix.filter((m) => m.region === region)].sort((a, b) => a.on_time_rate - b.on_time_rate)[0];
  const recRaw = first(r, 'recommendations', 'recommended', 'recommended_by_region');
  const recommendations = Array.isArray(recRaw)
    ? (recRaw as CarrierScorecard['recommendations'])
    : Object.entries(obj(recRaw)).map(([region, v]) => {
        const o = obj(v);
        const worst = worstIn(region);
        return {
          region,
          recommended_carrier: strOr(first(o, 'recommended_carrier', 'carrier_id'), ''),
          on_time_rate: numOr(o.on_time_rate, 0),
          avoid_carrier: worst?.carrier_id ?? '',
          avoid_on_time_rate: worst?.on_time_rate ?? 0,
        };
      });

  return { carriers, matrix, recommendations };
}

export function normaliseClients(raw: unknown): AtRiskClient[] {
  return list(raw, 'clients', 'items').map((x) => {
    const o = obj(x);
    let main = causeKeys(o.main_causes);
    if (!main.length && o.cause_rates) {
      main = Object.entries(obj(o.cause_rates))
        .sort((a, b) => numOr(b[1], 0) - numOr(a[1], 0))
        .slice(0, 2)
        .map(([k]) => k as CauseKey);
    }
    return {
      client_id: strOr(o.client_id, ''),
      client_name: strOr(o.client_name, strOr(o.client_id, '')),
      region: strOr(o.region, ''),
      tier: strOr(first(o, 'tier', 'account_tier'), ''),
      channel: strOr(first(o, 'channel', 'primary_order_channel'), ''),
      annual_revenue_usd: numOr(o.annual_revenue_usd, 0),
      deliveries: numOr(o.deliveries, 0),
      on_time_rate: numOr(o.on_time_rate, 0),
      penalties_usd: numOr(first(o, 'penalties_usd', 'sla_penalties_usd'), 0),
      main_causes: main,
    };
  });
}

export function normaliseSimulate(raw: unknown): SimulateResponse {
  const r = obj(raw);
  const today = numOr(first(r, 'today_on_time_rate', 'today'), mock.mockCauses.scenarios.today);
  const projected = numOr(first(r, 'projected_on_time_rate', 'projected'), today);
  const atRisk = obj(r.at_risk);
  return {
    projected_on_time_rate: projected,
    today_on_time_rate: today,
    points_by_cause: obj(r.points_by_cause) as SimulateResponse['points_by_cause'],
    late_deliveries_avoided: numOr(r.late_deliveries_avoided, Math.round(mock.mockKpis.deliveries * (projected - today))),
    penalties_avoided_usd: numOr(first(r, 'penalties_avoided_usd', 'annual_sla_penalties_avoided_usd'), 0),
    redelivery_avoided_usd: typeof first(r, 'redelivery_avoided_usd', 'annual_redelivery_cost_avoided_usd') === 'number'
      ? (first(r, 'redelivery_avoided_usd', 'annual_redelivery_cost_avoided_usd') as number)
      : undefined,
    at_risk_projected_on_time_rate: typeof atRisk.projected_on_time_rate === 'number' ? atRisk.projected_on_time_rate : undefined,
    meets_benchmark: typeof r.meets_benchmark === 'boolean' ? r.meets_benchmark : projected >= mock.mockKpis.benchmark_on_time_rate,
  };
}

export function normaliseVendor(raw: unknown): VendorAssessment {
  const r = obj(raw);
  const m = mock.mockVendor;
  const reasons = list(r.reasons).filter((x): x is string => typeof x === 'string');
  const vendorCauses = causeKeys(first(r, 'causes_vendor_addresses', 'routing_causes'));
  return {
    vendor_cost_usd: numOr(first(r, 'vendor_cost_usd', 'budget_usd'), m.vendor_cost_usd),
    at_risk_revenue_usd: numOr(r.at_risk_revenue_usd, m.at_risk_revenue_usd),
    benchmark: numOr(r.benchmark, m.benchmark),
    today: numOr(r.today, m.today),
    routing_only: numOr(first(r, 'routing_only', 'routing_only_ceiling'), m.routing_only),
    process_only: numOr(r.process_only, m.process_only),
    all_fixed: numOr(first(r, 'all_fixed', 'ceiling'), m.all_fixed),
    realistic: numOr(first(r, 'realistic', 'on_time_realistic'), m.realistic),
    causes_vendor_addresses: vendorCauses.length ? vendorCauses : m.causes_vendor_addresses,
    recommendation: strOr(r.recommendation, m.recommendation),
    reasons: reasons.length ? reasons : m.reasons,
  };
}

const ADDRESS_FIELD_ALIASES: Record<string, string> = { postcode: 'zip', postal_code: 'zip' };

export function normaliseOrderIntake(raw: unknown): OrderIntakeResult {
  const r = obj(raw);
  if (!r.extraction && !r.checks) return r as unknown as OrderIntakeResult; // already in UI shape
  const ex = obj(r.extraction);
  const ck = obj(r.checks);
  const ship = obj(ex.ship_to);
  const fields: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(ship)) fields[ADDRESS_FIELD_ALIASES[k] ?? k] = typeof v === 'string' ? v : null;
  const missing = list(ck.missing_address_fields).map((k) => ADDRESS_FIELD_ALIASES[String(k)] ?? String(k));
  for (const k of missing) if (!(k in fields)) fields[k] = null;
  const cutoff = obj(ck.cutoff);
  const warnings = list(ck.warnings).filter((w): w is string => typeof w === 'string');
  const fu = ck.follow_up_email;
  const fuObj = obj(fu);
  return {
    client: (ex.client_name as string) ?? null,
    po_number: (first(ex, 'po_number', 'order_reference') as string) ?? null,
    commitment_type: (ex.commitment_type as string) ?? null,
    requested_date: (ex.requested_date as string) ?? null,
    received_at: (first(ex, 'received_at') as string) ?? (cutoff.received_at as string) ?? null,
    lines: list(ex.items).map((i) => {
      const o = obj(i);
      return { sku: strOr(o.sku, ''), description: (o.description as string) ?? undefined, quantity: numOr(first(o, 'quantity', 'qty'), 0) };
    }),
    address: { complete: strOr(ck.address_status, missing.length ? 'incomplete' : 'complete') === 'complete', fields, missing },
    same_day_warning: cutoff.after_cutoff === true ? warnings.find((w) => /cutoff/i.test(w)) ?? 'Same-day order received after the 08:00 pick-list cutoff.' : null,
    follow_up_email: typeof fu === 'string' ? fu : fu ? `Subject: ${strOr(fuObj.subject, '')}\n\n${strOr(fuObj.body, '')}` : null,
    run_id: r.agent_run_id != null ? String(r.agent_run_id) : undefined,
  };
}

export function normaliseDelayAlert(raw: unknown, deliveryId: string): DelayAlertResult {
  const r = obj(raw);
  const days = first(r, 'predicted_delay_days');
  return {
    delivery_id: strOr(r.delivery_id, deliveryId),
    subject: strOr(r.subject, `Update on delivery ${deliveryId}`),
    body: strOr(first(r, 'body', 'message'), ''),
    predicted_delay_days: typeof days === 'number' ? days : null,
    predicted_date: typeof r.predicted_date === 'string' ? r.predicted_date : null,
    basis: typeof r.basis === 'string' ? r.basis : null,
    channel: (r.channel as string) ?? undefined,
    run_id: r.agent_run_id != null ? String(r.agent_run_id) : undefined,
  };
}

export function normaliseAsk(raw: unknown): AskResult {
  const r = obj(raw);
  return {
    answer: strOr(r.answer, ''),
    sources: Array.isArray(r.sources) ? (r.sources as string[]) : Array.isArray(r.tools_used) ? (r.tools_used as string[]) : undefined,
    run_id: r.agent_run_id != null ? String(r.agent_run_id) : undefined,
  };
}

export function normaliseRuns(raw: unknown): AgentRun[] {
  return list(raw, 'runs', 'items').map((x) => {
    const o = obj(x);
    const status = strOr(o.status, '');
    const flags = list(o.guardrail_flags).map(String);
    const tokens = numOr(o.tokens, Number.NaN);
    return {
      run_id: String(first(o, 'run_id', 'id') ?? ''),
      agent: strOr(o.agent, ''),
      started_at: strOr(first(o, 'started_at', 'created_at'), ''),
      duration_ms: numOr(first(o, 'duration_ms', 'latency_ms'), 0),
      status: status === 'ok' ? 'success' : status,
      input_summary: strOr(o.input_summary, Number.isNaN(tokens) ? '' : `${numOr(o.input_tokens, 0).toLocaleString('en-US')} tokens in`),
      output_summary: strOr(
        o.output_summary,
        [Number.isNaN(tokens) ? '' : `${numOr(o.output_tokens, 0).toLocaleString('en-US')} tokens out`, flags.length ? `Guardrails: ${flags.join(', ').replace(/_/g, ' ')}` : '']
          .filter(Boolean)
          .join('. '),
      ),
      model: [o.provider, o.model].filter((v) => typeof v === 'string').join(' / ') || undefined,
    };
  });
}

export function normaliseRoi(raw: unknown): RoiResponse {
  const r = obj(raw);
  const m = mock.mockRoi;
  const a = obj(r.assumptions);
  const scenarios: RoiScenario[] = list(r.scenarios).map((x) => {
    const o = obj(x);
    const penalties = numOr(o.sla_penalties_avoided_usd, 0);
    const redelivery = numOr(o.redelivery_avoided_usd, 0);
    const cost = numOr(o.cost_per_year_usd, 0);
    return {
      name: strOr(o.name, ''),
      on_time_rate: numOr(o.on_time_rate, 0),
      points_gained: numOr(o.points_gained, 0),
      sla_penalties_avoided_usd: penalties,
      redelivery_avoided_usd: redelivery,
      late_deliveries_avoided: numOr(o.late_deliveries_avoided, 0),
      cost_per_year_usd: cost,
      net_benefit_per_year_usd: numOr(o.net_benefit_per_year_usd, penalties + redelivery - cost),
      net_benefit_penalties_only_usd: numOr(o.net_benefit_penalties_only_usd, penalties - cost),
    };
  });
  return {
    assumptions: {
      effectiveness: Object.keys(obj(a.effectiveness)).length ? (obj(a.effectiveness) as RoiResponse['assumptions']['effectiveness']) : m.assumptions.effectiveness,
      fix_cost_per_year_usd: Object.keys(obj(a.fix_cost_per_year_usd)).length
        ? (obj(a.fix_cost_per_year_usd) as RoiResponse['assumptions']['fix_cost_per_year_usd'])
        : m.assumptions.fix_cost_per_year_usd,
      note: strOr(a.note, m.assumptions.note),
    },
    scenarios: scenarios.length ? scenarios : m.scenarios,
    effectiveness_needed_for_94_benchmark: numOr(r.effectiveness_needed_for_94_benchmark, m.effectiveness_needed_for_94_benchmark),
  };
}

export function normaliseStock(raw: unknown): StockPlacement {
  const r = obj(raw);
  return {
    by_warehouse: list(r.by_warehouse).map((x) => {
      const o = obj(x);
      return {
        warehouse_id: strOr(o.warehouse_id, ''),
        name: strOr(first(o, 'name', 'warehouse_name'), strOr(o.warehouse_id, '')),
        region: strOr(o.region, ''),
        deliveries: numOr(o.deliveries, 0),
        stock_out_rate: numOr(o.stock_out_rate, 0),
        on_time_when_stocked: numOr(o.on_time_when_stocked, Number.NaN),
        on_time_when_stock_out: numOr(o.on_time_when_stock_out, Number.NaN),
      };
    }),
    worst_clients: list(r.worst_clients).map((x) => {
      const o = obj(x);
      return {
        client_id: strOr(o.client_id, ''),
        client_name: strOr(o.client_name, strOr(o.client_id, '')),
        deliveries: numOr(o.deliveries, 0),
        stock_out_rate: numOr(o.stock_out_rate, 0),
        on_time_rate: numOr(o.on_time_rate, Number.NaN),
      };
    }),
  };
}

export function normaliseRoutes(raw: unknown): RouteDeviation {
  const r = obj(raw);
  const row = (o: Loose) => ({
    deliveries: numOr(o.deliveries, 0),
    deviation_rate: numOr(o.deviation_rate, 0),
    on_time_with_deviation: numOr(o.on_time_with_deviation, Number.NaN),
    on_time_without_deviation: numOr(o.on_time_without_deviation, Number.NaN),
  });
  return {
    by_carrier: list(r.by_carrier).map((x) => {
      const o = obj(x);
      return { carrier_id: strOr(o.carrier_id, ''), ...row(o), missing_actual_km_rate: numOr(o.missing_actual_km_rate, Number.NaN) };
    }),
    by_region: list(r.by_region).map((x) => {
      const o = obj(x);
      return { region: strOr(o.region, ''), ...row(o) };
    }),
  };
}

/* ---------- endpoints ---------- */

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
/** POST to an agent, with the demo token when one is configured. */
const agentPost = (body: unknown): RequestInit => ({ ...post(body), ...(DEMO_TOKEN ? { headers: { 'X-Demo-Token': DEMO_TOKEN } } : {}) });

export const api = {
  health: () => http<Health>('/health', {}, 3000),

  kpis: () => withFallback(async () => normaliseKpis(await http<unknown>('/kpis')), () => mock.mockKpis),

  causes: () => withFallback(async () => normaliseCauses(await http<unknown>('/causes')), () => mock.mockCauses),

  causeDeliveries: (cause: CauseKey, limit = 8) =>
    withFallback(
      async () => list(await http<unknown>(`/causes/${cause}/deliveries?limit=${limit}`), 'deliveries', 'items').map(normaliseDeliverySummary),
      () => mock.mockCauseDeliveries(cause, limit),
    ),

  delivery: (id: string) =>
    withFallback(
      async () => normaliseDelivery(await http<unknown>(`/deliveries/${encodeURIComponent(id)}`)),
      () => {
        const d = mock.mockDelivery(id);
        if (!d) throw new ApiError(`Delivery ${id} is not in the sample data`, 404);
        return d;
      },
    ),

  scorecard: () => withFallback(async () => normaliseScorecard(await http<unknown>('/carriers/scorecard')), () => mock.mockScorecard),

  atRisk: () => withFallback(async () => normaliseClients(await http<unknown>('/clients/at-risk')), () => mock.mockAtRisk),

  simulate: (fixes: FixLevels) =>
    withFallback(async () => normaliseSimulate(await http<unknown>('/simulate', post({ fixes }))), () => mock.mockSimulate(fixes)),

  vendor: () => withFallback(async () => normaliseVendor(await http<unknown>('/vendor-assessment')), () => mock.mockVendor),

  roi: () => withFallback(async () => normaliseRoi(await http<unknown>('/roi')), () => mock.mockRoi),

  stockPlacement: () => withFallback(async () => normaliseStock(await http<unknown>('/stock/placement')), () => mock.mockStock),

  routeDeviation: () => withFallback(async () => normaliseRoutes(await http<unknown>('/routes/deviation')), () => mock.mockRoutes),

  orderIntake: (email_text: string) =>
    withFallback(
      async () => normaliseOrderIntake(await http<unknown>('/agents/order-intake', agentPost({ email_text }), AGENT_TIMEOUT_MS)),
      () => mock.mockOrderIntake(email_text),
      'agent',
    ),

  delayAlert: (delivery_id: string) =>
    withFallback(
      async () => normaliseDelayAlert(await http<unknown>('/agents/delay-alert', agentPost({ delivery_id }), AGENT_TIMEOUT_MS), delivery_id),
      () => mock.mockDelayAlert(delivery_id),
      'agent',
    ),

  ask: (question: string) =>
    withFallback(async () => normaliseAsk(await http<unknown>('/agents/ask', agentPost({ question }), AGENT_TIMEOUT_MS)), () => mock.mockAsk(question), 'agent'),

  runs: () => withFallback(async () => normaliseRuns(await http<unknown>('/agents/runs')), () => mock.mockRuns),

  /* ---------- Order desk (offline fixtures load only when needed) ---------- */

  deskInbox: () =>
    withFallback(async () => list(await http<unknown>('/desk/inbox'), 'messages').map(normaliseDeskMessage), async () => (await deskFixtures()).sampleInbox().messages, 'desk'),

  deskMessage: (id: string) =>
    withFallback(
      async () => normaliseDeskMessageDetail(await http<unknown>(`/desk/inbox/${encodeURIComponent(id)}`)),
      async () => {
        const m = (await deskFixtures()).sampleMessage(id);
        if (!m) throw new ApiError(`Email ${id} is not in the sample inbox`, 404);
        return m;
      },
      'desk',
    ),

  deskProcess: (id: string) =>
    withFallback(
      async () => normaliseDeskProcess(await http<unknown>(`/desk/process/${encodeURIComponent(id)}`, agentPost({}), AGENT_TIMEOUT_MS)),
      async () => (await deskFixtures()).sampleProcess(id),
      'desk',
    ),

  deskProcessAll: () =>
    withFallback(
      async () => normaliseDeskProcessAll(await http<unknown>('/desk/process-all', agentPost({}), AGENT_TIMEOUT_MS * 3)),
      async () => (await deskFixtures()).sampleProcessAll(),
      'desk',
    ),

  deskWmsOrders: () =>
    withFallback(async () => list(await http<unknown>('/desk/wms-orders'), 'orders').map(normaliseWmsOrder), async () => (await deskFixtures()).sampleWmsOrders().orders, 'desk'),

  deskReset: () => withFallback(async () => ({ ok: obj(await http<unknown>('/desk/reset', agentPost({}))).ok !== false }), async () => (await deskFixtures()).sampleReset(), 'desk'),
};

const deskFixtures = () => import('./deskFixtures');

/* ---------- Order desk normalisers ---------- */

const DECISIONS = ['accepted', 'on_hold', 'needs_review', 'blocked'] as const;
const decisionOr = (x: unknown): DeskProcessResult['decision'] =>
  (DECISIONS as readonly string[]).includes(x as string) ? (x as DeskProcessResult['decision']) : 'needs_review';
const strOrNull = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);

export function normaliseDeskMessage(x: unknown): DeskMessage {
  const o = obj(x);
  return {
    id: String(o.id ?? ''),
    from_name: strOr(o.from_name, ''),
    from_email: strOr(o.from_email, ''),
    client_id: strOrNull(o.client_id),
    subject: strOr(o.subject, '(no subject)'),
    received_at: strOr(o.received_at, ''),
    scenario: strOr(o.scenario, ''),
    expected_decision: decisionOr(o.expected_decision),
    what_it_demonstrates: strOr(o.what_it_demonstrates, ''),
    has_attachment: o.has_attachment === true,
    status: strOr(o.status, 'new'),
    decision: o.decision ? decisionOr(o.decision) : null,
  };
}

export function normaliseDeskMessageDetail(x: unknown): DeskMessageDetail {
  const o = obj(x);
  return {
    ...normaliseDeskMessage(o),
    body: strOr(o.body, ''),
    attachments: list(o.attachments).map((a) => {
      const r = obj(a);
      return { filename: strOr(r.filename, 'attachment'), content_type: strOr(r.content_type, ''), text: strOr(r.text, '') };
    }),
  };
}

export function normaliseWmsOrder(x: unknown): WmsOrder {
  const o = obj(x);
  const st = obj(o.ship_to);
  return {
    wms_order_id: strOr(o.wms_order_id, ''),
    message_id: String(o.message_id ?? ''),
    client_id: strOrNull(o.client_id),
    client_name: strOrNull(o.client_name),
    ship_to: {
      name: strOrNull(st.name),
      street: strOrNull(st.street),
      city: strOrNull(st.city),
      state: strOrNull(st.state),
      postcode: strOrNull(first(st, 'postcode', 'zip')),
      country: strOrNull(st.country),
    },
    lines: list(o.lines).map((l) => {
      const r = obj(l);
      return { sku: strOr(r.sku, ''), qty: numOr(first(r, 'qty', 'quantity'), 0) };
    }),
    commitment_type: strOrNull(o.commitment_type),
    requested_date: strOrNull(o.requested_date),
    promised_date: strOrNull(o.promised_date),
    destination_region: strOrNull(o.destination_region),
    nearest_warehouse_id: strOrNull(o.nearest_warehouse_id),
    fulfilment_warehouse_id: strOrNull(o.fulfilment_warehouse_id),
    carrier_id: strOrNull(o.carrier_id),
    carrier_reason: strOrNull(o.carrier_reason),
    status: strOr(o.status, ''),
    pick_list_date: strOrNull(o.pick_list_date),
    created_at: strOr(o.created_at, ''),
  };
}

export function normaliseDeskProcess(x: unknown): DeskProcessResult {
  const o = obj(x);
  return {
    message_id: String(o.message_id ?? ''),
    decision: decisionOr(o.decision),
    decision_reason: strOr(o.decision_reason, ''),
    steps: list(o.steps).map((s, i) => {
      const r = obj(s);
      const actor = strOr(r.actor, 'Rule');
      return {
        step: numOr(r.step, i + 1),
        key: strOr(r.key, ''),
        title: strOr(r.title, ''),
        actor: (['AI agent', 'Rule', 'Data lookup', 'Guardrail'].includes(actor) ? actor : 'Rule') as DeskProcessResult['steps'][number]['actor'],
        agent_name: strOr(r.agent_name, ''),
        status: (['pass', 'warn', 'fail', 'skipped'].includes(r.status as string) ? r.status : 'pass') as DeskProcessResult['steps'][number]['status'],
        summary: strOr(r.summary, ''),
        details: obj(r.details),
        duration_ms: numOr(r.duration_ms, 0),
      };
    }),
    wms_order: o.wms_order ? normaliseWmsOrder(o.wms_order) : null,
    client_email_draft: normaliseDraft(o.client_email_draft),
    llm_provider: strOr(o.llm_provider, ''),
    llm_model: strOr(o.llm_model, ''),
    expected_decision: decisionOr(o.expected_decision),
    matches_expected: o.matches_expected === true,
  };
}

function normaliseDraft(x: unknown): DeskProcessResult['client_email_draft'] {
  if (typeof x === 'string') return x.trim() ? { kind: null, to: null, subject: null, body: x } : null;
  const o = obj(x);
  const body = strOr(first(o, 'body', 'text', 'message'), '');
  if (!body) return null;
  return { kind: strOrNull(o.kind), to: strOrNull(o.to), subject: strOrNull(o.subject), body };
}

export function normaliseDeskProcessAll(x: unknown): DeskProcessAll {
  const o = obj(x);
  const results = list(o.results).map((r) => {
    const q = obj(r);
    return { message_id: String(q.message_id ?? ''), decision: decisionOr(q.decision), expected_decision: decisionOr(q.expected_decision), matches_expected: q.matches_expected === true };
  });
  return { processed: numOr(o.processed, results.length), matches_expected: numOr(o.matches_expected, results.filter((r) => r.matches_expected).length), results };
}

/* ---------- health (AI provider badge) ---------- */

let health: Health | null = null;
const healthListeners = new Set<() => void>();

export function getHealth(): Health | null {
  return health;
}

export function subscribeHealth(fn: () => void): () => void {
  healthListeners.add(fn);
  return () => healthListeners.delete(fn);
}

function setHealth(next: Health | null) {
  health = next;
  healthListeners.forEach((fn) => fn());
}

let probing: Promise<ApiStatus> | null = null;

/** Ping the API (shared between concurrent callers) and update the connection status. */
export function probeApi(): Promise<ApiStatus> {
  if (!probing) {
    probing = http<Health>('/health', {}, 3000)
      .then((h) => {
        setHealth(h && typeof h === 'object' ? h : null);
        setStatus('live');
      })
      .catch((err: unknown) => {
        setHealth(null);
        setStatus(err instanceof ApiError ? 'live' : 'offline');
      })
      .then(() => status)
      .finally(() => {
        probing = null;
      });
  }
  return probing;
}
