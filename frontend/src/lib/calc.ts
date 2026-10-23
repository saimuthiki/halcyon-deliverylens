import type { CauseKey, CauseRow, FixLevels, SimulateResponse } from '../api/types';
import { BENCHMARK } from './causes';

export interface WaterfallStep {
  key: string;
  label: string;
  /** invisible offset (percent, 0..100) the visible bar sits on */
  base: number;
  /** visible bar height in percentage points */
  value: number;
  /** running total after this step, in percent */
  total: number;
  kind: 'start' | 'cause' | 'end';
  cause?: CauseKey;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Turns "today" + per-cause fair-share points into stacked-bar rows for a
 * waterfall: first bar is today's rate, each cause floats on the running total,
 * last bar is the end state. `end` defaults to today + sum of points.
 */
export function buildWaterfall(
  todayRate: number,
  causes: Pick<CauseRow, 'cause' | 'fair_share_points'>[],
  labelFor: (c: CauseKey) => string,
  endRate?: number,
): WaterfallStep[] {
  const start = round1(todayRate * 100);
  const steps: WaterfallStep[] = [{ key: 'today', label: 'Today', base: 0, value: start, total: start, kind: 'start' }];
  let running = start;
  const sorted = [...causes].sort((a, b) => b.fair_share_points - a.fair_share_points);
  for (const c of sorted) {
    const value = round1(c.fair_share_points);
    steps.push({
      key: c.cause,
      label: labelFor(c.cause),
      base: round1(running),
      value,
      total: round1(running + value),
      kind: 'cause',
      cause: c.cause,
    });
    running += value;
  }
  const end = endRate != null ? round1(endRate * 100) : round1(running);
  steps.push({ key: 'all_fixed', label: 'All fixed', base: 0, value: end, total: end, kind: 'end' });
  return steps;
}

export interface SimulationInputs {
  todayRate: number;
  deliveries: number;
  penaltiesUsd: number;
  causes: Pick<CauseRow, 'cause' | 'fair_share_points'>[];
}

/**
 * Local what-if model, used as the mock for POST /simulate and for instant
 * slider feedback. Each cause contributes its fair-share points scaled by how
 * effective the fix is (0..1). Penalties scale with the share of late
 * deliveries removed.
 */
export function simulateLocally(fixes: FixLevels, input: SimulationInputs): SimulateResponse {
  const points_by_cause: Partial<Record<CauseKey, number>> = {};
  let gained = 0;
  for (const c of input.causes) {
    const eff = clamp01(fixes[c.cause] ?? 0);
    const p = round1(c.fair_share_points * eff);
    points_by_cause[c.cause] = p;
    gained += c.fair_share_points * eff;
  }
  const projected = Math.min(1, input.todayRate + gained / 100);
  const lateShareToday = 1 - input.todayRate;
  const lateRemoved = lateShareToday > 0 ? gained / 100 / lateShareToday : 0;
  return {
    projected_on_time_rate: Math.round(projected * 10000) / 10000,
    today_on_time_rate: input.todayRate,
    points_by_cause,
    late_deliveries_avoided: Math.round((input.deliveries * gained) / 100),
    // input.penaltiesUsd covers the 6-month data window; report per year like the API.
    penalties_avoided_usd: Math.round(input.penaltiesUsd * lateRemoved * 2),
    meets_benchmark: projected >= BENCHMARK,
  };
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
