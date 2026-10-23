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
  steps.push({ key: 'all_fixed', label: 'Ceiling, all removed', base: 0, value: end, total: end, kind: 'end' });
  return steps;
}

/** One combination of the five causes, as seen in the data (6 months). */
export interface ComboRow {
  /** One character per cause in `ComboModel.causes` order: "1" = present. */
  key: string;
  deliveries: number;
  at_risk_deliveries: number;
  on_time_rate: number;
  late: number;
  late_penalties_usd: number;
  late_redelivery_usd: number;
}

export interface ComboModel {
  causes: CauseKey[];
  combos: ComboRow[];
  /** Today's on-time rate of the at-risk clients. */
  atRiskToday: number;
}

/**
 * For one cause combination: each present cause is removed with probability = its effectiveness,
 * and the delivery then takes the observed on-time rate of the combination that remains.
 * Same maths as analysis/root_cause_analysis.py `expected_on_time` and the API's /simulate.
 */
function comboValue(model: ComboModel, rate: Map<string, number>, row: ComboRow, eff: FixLevels): number {
  const present: number[] = [];
  for (let i = 0; i < row.key.length; i++) if (row.key[i] === '1') present.push(i);
  let value = 0;
  for (let mask = 0; mask < 1 << present.length; mask++) {
    let p = 1;
    const chars = row.key.split('');
    present.forEach((ci, j) => {
      const e = clamp01(eff[model.causes[ci]] ?? 0);
      if (mask & (1 << j)) {
        p *= e;
        chars[ci] = '0';
      } else p *= 1 - e;
    });
    if (p === 0) continue;
    value += p * (rate.get(chars.join('')) ?? row.on_time_rate);
  }
  return value;
}

function rates(model: ComboModel) {
  return new Map(model.combos.map((c) => [c.key, c.on_time_rate]));
}

/** Expected on-time rate (0..1) when each cause is removed from `eff[cause]` of the deliveries that have it. */
export function expectedOnTime(model: ComboModel, eff: FixLevels, weight: (c: ComboRow) => number = (c) => c.deliveries): number {
  const rate = rates(model);
  let total = 0;
  let n = 0;
  for (const row of model.combos) {
    const w = weight(row);
    if (!w) continue;
    total += w * comboValue(model, rate, row, eff);
    n += w;
  }
  return n ? total / n : 0;
}

/** Fair-share (Shapley) split of the points gained across the causes being fixed. */
export function fairSharePoints(model: ComboModel, eff: FixLevels): Partial<Record<CauseKey, number>> {
  const active = model.causes.filter((c) => clamp01(eff[c] ?? 0) > 0);
  const n = active.length;
  const cache = new Map<number, number>();
  const value = (mask: number) => {
    if (!cache.has(mask)) {
      const sub: FixLevels = {};
      active.forEach((c, i) => {
        if (mask & (1 << i)) sub[c] = eff[c];
      });
      cache.set(mask, expectedOnTime(model, sub));
    }
    return cache.get(mask)!;
  };
  const fact = (k: number): number => (k <= 1 ? 1 : k * fact(k - 1));
  const out: Partial<Record<CauseKey, number>> = {};
  active.forEach((c, i) => {
    let gain = 0;
    for (let mask = 0; mask < 1 << n; mask++) {
      if (mask & (1 << i)) continue;
      let size = 0;
      for (let b = 0; b < n; b++) if (mask & (1 << b)) size++;
      gain += ((fact(size) * fact(n - size - 1)) / fact(n)) * (value(mask | (1 << i)) - value(mask));
    }
    out[c] = Math.round(gain * 10000) / 100; // points, 2 decimals (like the API)
  });
  return out;
}

/**
 * What-if projection, computed in the browser with the same model as POST /api/simulate.
 * Money is per year (six months of data x2); late deliveries avoided cover the 6 months of data.
 */
export function simulateExact(fixes: FixLevels, model: ComboModel): SimulateResponse {
  const rate = rates(model);
  const total = model.combos.reduce((s, c) => s + c.deliveries, 0);
  const today = expectedOnTime(model, {});
  const projected = expectedOnTime(model, fixes);
  let penalties = 0;
  let redelivery = 0;
  for (const row of model.combos) {
    if (row.on_time_rate >= 1) continue;
    const flip = Math.max(0, (comboValue(model, rate, row, fixes) - row.on_time_rate) / (1 - row.on_time_rate));
    penalties += flip * row.late_penalties_usd;
    redelivery += flip * row.late_redelivery_usd;
  }
  const arToday = expectedOnTime(model, {}, (c) => c.at_risk_deliveries);
  const arProjected = expectedOnTime(model, fixes, (c) => c.at_risk_deliveries);
  return {
    projected_on_time_rate: Math.round(projected * 10000) / 10000,
    today_on_time_rate: Math.round(today * 10000) / 10000,
    points_by_cause: fairSharePoints(model, fixes),
    late_deliveries_avoided: Math.round(total * (projected - today)),
    penalties_avoided_usd: Math.round(penalties * 2),
    redelivery_avoided_usd: Math.round(redelivery * 2),
    at_risk_projected_on_time_rate: Math.round(clamp01(model.atRiskToday + arProjected - arToday) * 10000) / 10000,
    meets_benchmark: projected >= BENCHMARK,
  };
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
