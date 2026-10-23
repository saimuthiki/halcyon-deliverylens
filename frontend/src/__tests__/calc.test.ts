import { buildWaterfall, simulateExact } from '../lib/calc';
import { comboModel, mockCauses, mockOrderIntake, mockRoi, REALISTIC_FIXES, SAMPLE_EMAILS } from '../api/mockData';
import { FINDINGS } from '../api/mockSnapshot';

const { causes, scenarios } = mockCauses;

describe('buildWaterfall', () => {
  const steps = buildWaterfall(scenarios.today, causes, (c) => c, scenarios.all_fixed);

  it('starts at today, ends at the 99.0% ceiling, with one floating bar per cause', () => {
    expect(steps).toHaveLength(causes.length + 2);
    expect(steps[0]).toMatchObject({ kind: 'start', base: 0, total: 71 });
    expect(steps[steps.length - 1]).toMatchObject({ kind: 'end', base: 0, total: 99, label: 'Ceiling, all removed' });
  });

  it('orders causes largest first and stacks each on the running total', () => {
    const middle = steps.slice(1, -1);
    expect(middle.map((s) => s.cause)).toEqual([
      'weak_carrier_lane',
      'incomplete_address',
      'same_day_after_cutoff',
      'stock_not_at_nearest',
      'route_deviation',
    ]);
    let running = 71;
    for (const s of middle) {
      expect(s.base).toBeCloseTo(running, 5);
      running = s.total;
    }
    expect(running).toBeCloseTo(99.0, 5);
  });
});

const ALL = { incomplete_address: 1, same_day_after_cutoff: 1, stock_not_at_nearest: 1, weak_carrier_lane: 1, route_deviation: 1 };

describe('simulateExact (same model as the API and analysis/root_cause_analysis.py)', () => {
  it('returns today when nothing is fixed', () => {
    const r = simulateExact({}, comboModel);
    expect(r.projected_on_time_rate).toBeCloseTo(0.71, 4);
    expect(r.penalties_avoided_usd).toBe(0);
    expect(r.meets_benchmark).toBe(false);
  });

  it('reproduces every scenario in findings.json', () => {
    expect(simulateExact(ALL, comboModel).projected_on_time_rate).toBeCloseTo(FINDINGS.on_time_if_all_fixed, 4);
    expect(simulateExact({ weak_carrier_lane: 1, route_deviation: 1 }, comboModel).projected_on_time_rate).toBeCloseTo(FINDINGS.on_time_if_only_routing_fixed, 4);
    expect(simulateExact({ incomplete_address: 1, same_day_after_cutoff: 1, stock_not_at_nearest: 1 }, comboModel).projected_on_time_rate).toBeCloseTo(
      FINDINGS.on_time_if_only_process_fixed,
      4,
    );
    expect(simulateExact(REALISTIC_FIXES, comboModel).projected_on_time_rate).toBeCloseTo(FINDINGS.on_time_realistic, 4);
  });

  it('matches the yearly money in the realistic ROI scenario', () => {
    const realistic = mockRoi.scenarios.find((s) => s.name === 'All five fixes, realistic')!;
    const r = simulateExact(REALISTIC_FIXES, comboModel);
    expect(Math.abs(r.penalties_avoided_usd - realistic.sla_penalties_avoided_usd)).toBeLessThanOrEqual(2);
    expect(Math.abs((r.redelivery_avoided_usd ?? 0) - realistic.redelivery_avoided_usd)).toBeLessThanOrEqual(2);
  });

  it('splits the ceiling fairly: points per cause equal the fair-share points', () => {
    const r = simulateExact(ALL, comboModel);
    expect(r.meets_benchmark).toBe(true);
    for (const c of causes) expect(r.points_by_cause[c.cause]).toBeCloseTo(c.fair_share_points, 1);
  });

  it('needs about 84% effectiveness on every fix to reach the 94% benchmark', () => {
    const at = (e: number) => simulateExact(Object.fromEntries(causes.map((c) => [c.cause, e])), comboModel).projected_on_time_rate;
    // findings.json rounds the threshold to 2 decimals (about 0.844), so 84% lands just under 94% and 85% just over.
    const needed = FINDINGS.effectiveness_needed_for_94_benchmark;
    expect(at(needed)).toBeCloseTo(0.94, 2);
    expect(at(needed + 0.01)).toBeGreaterThanOrEqual(0.94);
    expect(at(needed - 0.01)).toBeLessThan(0.94);
  });

  it('clamps out-of-range effectiveness', () => {
    const r = simulateExact({ route_deviation: 3 }, comboModel);
    expect(r.projected_on_time_rate).toBeCloseTo(simulateExact({ route_deviation: 1 }, comboModel).projected_on_time_rate, 6);
  });
});

describe('mockOrderIntake', () => {
  const byId = (id: string) => SAMPLE_EMAILS.find((e) => e.id === id)!.text;

  it('passes a complete next-day order', () => {
    const r = mockOrderIntake(byId('01_complete_next_day'));
    expect(r.client).toBe('Client 042');
    expect(r.commitment_type).toBe('next_day');
    expect(r.lines).toEqual([
      { sku: 'HX-1001', quantity: 12 },
      { sku: 'HX-2040', quantity: 5 },
    ]);
    expect(r.address.complete).toBe(true);
    expect(r.same_day_warning).toBeNull();
    expect(r.follow_up_email).toBeNull();
  });

  it('flags the missing street, postcode and country and drafts a follow-up', () => {
    const r = mockOrderIntake(byId('02_incomplete_address'));
    expect(r.address.missing).toEqual(['street', 'zip', 'country']);
    expect(r.follow_up_email).toMatch(/postcode \(ZIP\)/);
  });

  it('warns about a same-day order after 08:00 but not before', () => {
    expect(mockOrderIntake(byId('03_same_day_after_cutoff')).same_day_warning).toMatch(/09:40/);
    expect(mockOrderIntake(byId('04_same_day_before_cutoff')).same_day_warning).toBeNull();
  });

  it('reads an address written on one line', () => {
    const r = mockOrderIntake(byId('05_one_line_address'));
    expect(r.address.fields).toMatchObject({ street: '77 Pine Avenue', city: 'Denver', state: 'CO', zip: '80202', country: 'US' });
    expect(r.lines).toHaveLength(2);
  });
});
