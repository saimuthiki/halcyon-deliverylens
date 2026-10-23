import { buildWaterfall, simulateLocally } from '../lib/calc';
import { mockCauses, mockKpis, mockOrderIntake, SAMPLE_EMAILS } from '../api/mockData';

const { causes, scenarios } = mockCauses;

describe('buildWaterfall', () => {
  const steps = buildWaterfall(scenarios.today, causes, (c) => c, scenarios.all_fixed);

  it('starts at today, ends at all-fixed, with one floating bar per cause', () => {
    expect(steps).toHaveLength(causes.length + 2);
    expect(steps[0]).toMatchObject({ kind: 'start', base: 0, total: 71 });
    expect(steps[steps.length - 1]).toMatchObject({ kind: 'end', base: 0, total: 96.6 });
  });

  it('orders causes largest first and stacks each on the running total', () => {
    const middle = steps.slice(1, -1);
    expect(middle.map((s) => s.cause)).toEqual([
      'incomplete_address',
      'weak_carrier_lane',
      'same_day_after_cutoff',
      'stock_not_at_nearest',
      'route_deviation',
    ]);
    let running = 71;
    for (const s of middle) {
      expect(s.base).toBeCloseTo(running, 5);
      running = s.total;
    }
    expect(running).toBeCloseTo(96.6, 5);
  });
});

describe('simulateLocally', () => {
  const input = { todayRate: scenarios.today, deliveries: mockKpis.deliveries, penaltiesUsd: mockKpis.sla_penalties_usd, causes };

  it('returns today when nothing is fixed', () => {
    const r = simulateLocally({}, input);
    expect(r.projected_on_time_rate).toBeCloseTo(0.71, 4);
    expect(r.penalties_avoided_usd).toBe(0);
    expect(r.meets_benchmark).toBe(false);
  });

  it('reaches 96.6% and clears the benchmark when every cause is fully fixed', () => {
    const all = Object.fromEntries(causes.map((c) => [c.cause, 1]));
    const r = simulateLocally(all, input);
    expect(r.projected_on_time_rate).toBeCloseTo(0.966, 3);
    expect(r.meets_benchmark).toBe(true);
    expect(r.points_by_cause.incomplete_address).toBe(6.8);
  });

  it('scales a cause by its effectiveness and clamps out-of-range input', () => {
    const r = simulateLocally({ incomplete_address: 0.5, route_deviation: 3 }, input);
    expect(r.points_by_cause.incomplete_address).toBe(3.4);
    expect(r.points_by_cause.route_deviation).toBe(3.0);
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
