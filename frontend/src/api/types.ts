/**
 * Every shape the UI reads from the DeliveryLens API lives here.
 * If the backend names a field differently, change it here (and, if needed,
 * add a small mapper in client.ts) — pages only import these types.
 *
 * Conventions assumed:
 *   - rates are fractions 0..1 (0.71 = 71%)
 *   - "points" are percentage points (6.8 = +6.8 pts of on-time delivery)
 *   - money is whole US dollars
 */

export type CauseKey =
  | 'incomplete_address'
  | 'same_day_after_cutoff'
  | 'stock_not_at_nearest'
  | 'weak_carrier_lane'
  | 'route_deviation';

export type Region = 'Midwest' | 'Northeast' | 'Southeast' | 'West';

/* ---------- /api/health ---------- */
export interface Health {
  status: string;
  [key: string]: unknown;
}

/* ---------- /api/kpis ---------- */
export interface MonthlyPoint {
  month: string; // "2026-04"
  deliveries: number;
  late: number;
  on_time_rate: number;
  penalties_usd: number;
}

export interface Kpis {
  deliveries: number;
  period: [string, string];
  on_time_rate: number;
  benchmark_on_time_rate: number;
  late_deliveries: number;
  sla_penalties_usd: number;
  redelivery_cost_usd: number;
  at_risk_clients: number;
  at_risk_revenue_usd: number;
  routing_vendor_budget_usd: number;
  monthly: MonthlyPoint[];
}

/* ---------- /api/causes ---------- */
export interface CauseRow {
  cause: CauseKey;
  label: string;
  deliveries: number;
  on_time_rate: number;
  share_of_late_deliveries: number;
  points_gained_if_fixed_alone: number;
  fair_share_points: number;
  sla_penalties_usd: number;
}

export interface Scenarios {
  today: number;
  all_fixed: number;
  routing_only: number;
  process_only: number;
  no_problem_rate: number;
}

export interface CausesResponse {
  causes: CauseRow[];
  scenarios: Scenarios;
}

/* ---------- deliveries ---------- */
export interface DeliverySummary {
  delivery_id: string;
  client_id: string;
  order_channel: string;
  commitment_type: string;
  order_received_ts: string;
  promised_date: string;
  delivered_date: string;
  days_late: number;
  destination_region: string;
  carrier_id: string;
  nearest_warehouse_id?: string;
  fulfilment_warehouse_id?: string;
  address_status?: string;
  pick_list_date?: string;
  shipped_ts?: string;
  distance_miles?: number;
  planned_route_km?: number;
  actual_route_km?: number | null;
  redelivery_cost_usd?: number;
  causes: CauseKey[];
}

export interface TimelineEvent {
  ts: string;
  label: string;
  detail?: string;
  status?: 'ok' | 'problem' | 'neutral';
}

export interface DeliveryDetail extends DeliverySummary {
  timeline: TimelineEvent[];
  explanation: string;
}

/* ---------- /api/carriers/scorecard ---------- */
export interface CarrierScore {
  carrier_id: string;
  carrier_name: string;
  deliveries: number;
  on_time_rate: number;
  avg_days_late: number;
  has_api: boolean;
  event_feed: string;
  preferred_supplier: boolean;
  base_rate_usd: number;
  weak_regions: string[];
}

export interface CarrierRegionCell {
  carrier_id: string;
  region: string;
  deliveries: number;
  on_time_rate: number;
  weak: boolean;
}

export interface RegionRecommendation {
  region: string;
  recommended_carrier: string;
  on_time_rate: number;
  avoid_carrier: string;
  avoid_on_time_rate: number;
}

export interface CarrierScorecard {
  carriers: CarrierScore[];
  matrix: CarrierRegionCell[];
  recommendations: RegionRecommendation[];
}

/* ---------- /api/clients/at-risk ---------- */
export interface AtRiskClient {
  client_id: string;
  client_name: string;
  region: string;
  tier: string;
  channel: string;
  annual_revenue_usd: number;
  deliveries: number;
  on_time_rate: number;
  penalties_usd: number;
  main_causes: CauseKey[];
}

/* ---------- /api/simulate ---------- */
export type FixLevels = Partial<Record<CauseKey, number>>; // 0..1 effectiveness

export interface SimulateRequest {
  fixes: FixLevels;
}

export interface SimulateResponse {
  projected_on_time_rate: number;
  today_on_time_rate: number;
  points_by_cause: Partial<Record<CauseKey, number>>;
  late_deliveries_avoided: number;
  penalties_avoided_usd: number; // per year (6 months of data x2)
  redelivery_avoided_usd?: number; // per year
  at_risk_projected_on_time_rate?: number; // the 9 at-risk clients
  meets_benchmark: boolean;
}

/* ---------- /api/vendor-assessment ---------- */
export interface VendorAssessment {
  vendor_cost_usd: number;
  at_risk_revenue_usd: number;
  benchmark: number;
  today: number;
  routing_only: number;
  process_only: number;
  all_fixed: number;
  causes_vendor_addresses: CauseKey[];
  recommendation: string;
  reasons: string[];
}

/* ---------- agents ---------- */
export interface OrderLine {
  sku: string;
  description?: string;
  quantity: number;
}

export interface AddressCheck {
  complete: boolean;
  fields: Record<string, string | null>; // street, city, state, zip, contact ...
  missing: string[];
}

export interface OrderIntakeResult {
  client: string | null;
  po_number: string | null;
  commitment_type: string | null;
  requested_date: string | null;
  received_at: string | null;
  lines: OrderLine[];
  address: AddressCheck;
  same_day_warning: string | null;
  follow_up_email: string | null;
  run_id?: string;
}

export interface DelayAlertResult {
  delivery_id: string;
  subject: string;
  body: string;
  channel?: string;
  run_id?: string;
}

export interface AskResult {
  answer: string;
  sources?: string[];
  run_id?: string;
}

export interface AgentRun {
  run_id: string;
  agent: string;
  started_at: string;
  duration_ms: number;
  status: 'success' | 'error' | 'running' | string;
  input_summary: string;
  output_summary: string;
  model?: string;
}

/* ---------- client meta ---------- */
export type DataSource = 'live' | 'sample';
