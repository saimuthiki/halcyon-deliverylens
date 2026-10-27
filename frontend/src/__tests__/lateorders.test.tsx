import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MockInstance } from 'vitest';
import LateOrders, { durationLabel, lateOrdersTitle } from '../pages/LateOrders';
import { api, normaliseLateOrders } from '../api/client';
import { LATE_ORDER_TIMES, mockLateOrders } from '../api/mockData';
import type { LateOrdersRequest } from '../api/types';
import { HELP } from '../lib/help';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/late-orders']}>
      <LateOrders />
    </MemoryRouter>,
  );
}

describe('Late same-day orders offline snapshot', () => {
  it('is the API replay, not an estimate: default times match backend/app/analytics/late_orders.py', () => {
    const r = mockLateOrders();
    expect(r.inputs).toEqual({ pick_list_cutoff: '08:00', grace_until: '09:00', hard_stop: '10:00' });
    expect(r.population).toMatchObject({
      after_cutoff_same_day: 4826,
      days: 178,
      warehouses: 5,
      on_time_rate_today: 0.39,
      grace_orders: 799,
      urgent_window_orders: 821,
      urgent_window_priority_client_orders: 175,
      after_hard_stop_orders: 3206,
      incomplete_address_excluded: 106,
    });
    expect(r.grace).toEqual({
      orders: 741,
      extra_orders_per_warehouse_day: 0.83,
      late_avoided_per_year: 729.4,
      sla_penalties_avoided_usd_per_year: 43436,
      at_risk_late_avoided_per_year: 159.0,
    });
    expect(r.urgent_priority_clients_at_most).toMatchObject({ orders: 159, late_avoided_per_year: 166.0, sla_penalties_avoided_usd_per_year: 16927 });
    expect(r.urgent_other_clients_with_valid_reason).toBe(614);
    expect(r.on_time_rate_after_cutoff_orders).toEqual({ today: 0.39, with_grace: 0.4655, with_grace_and_urgent_at_most: 0.4827 });
    expect(r.arrivals).toHaveLength(12);
    expect(r.arrivals.map((a) => a.window).slice(0, 5)).toEqual(['grace', 'grace', 'urgent_window', 'urgent_window', 'after_hard_stop']);
    expect(r.rules).toHaveLength(7);
    expect(r.rules.filter((x) => x.actor === 'AI agent').map((x) => x.result)).toEqual(['today', 'today']);
    expect(r.assumptions[0]).toMatch(/^Sample/);
  });

  it('has every valid pair of half-hour times, and falls back to the defaults for an invalid one', () => {
    expect(LATE_ORDER_TIMES[0]).toBe('08:00');
    expect(LATE_ORDER_TIMES[LATE_ORDER_TIMES.length - 1]).toBe('14:00');
    for (const g of LATE_ORDER_TIMES)
      for (const h of LATE_ORDER_TIMES.filter((t) => t >= g)) expect(mockLateOrders({ grace_until: g, hard_stop: h }).inputs).toMatchObject({ grace_until: g, hard_stop: h });
    expect(mockLateOrders({ grace_until: '11:00', hard_stop: '10:00' }).inputs.grace_until).toBe('09:00');
    const none = mockLateOrders({ grace_until: '08:00', hard_stop: '08:00' });
    expect(none.grace.orders).toBe(0);
    expect(none.arrivals.every((a) => a.window === 'after_hard_stop')).toBe(true);
    // A longer grace period adds more orders.
    expect(mockLateOrders({ grace_until: '10:00', hard_stop: '10:00' }).grace.orders).toBeGreaterThan(741);
  });

  it('normalises a contract-shaped response and fills in missing windows and rules', () => {
    const r = normaliseLateOrders(
      {
        inputs: { grace_until: '09:30', hard_stop: '11:00' },
        population: { after_cutoff_same_day: 10 },
        grace: { orders: 3, late_avoided_per_year: 4 },
        arrivals: [{ from: '09:00', to: '09:30', orders: 2 }],
      },
      { grace_until: '09:30', hard_stop: '11:00' },
    );
    expect(r.arrivals[0].window).toBe('grace');
    expect(r.rules[2]).toMatchObject({ when: '09:30 to 11:00', actor: 'AI agent', result: 'today' });
    expect(r.grace.at_risk_late_avoided_per_year).toBe(0);
    expect(r.order_desk_settings).toEqual({ grace_until: '09:00', hard_stop: '10:00' });
  });

  it('states the finding with the real numbers', () => {
    expect(lateOrdersTitle(mockLateOrders())).toBe('A 1-hour grace period saves 729 late deliveries a year; urgent orders until 10:00 add up to 166 more.');
    expect(lateOrdersTitle(mockLateOrders({ grace_until: '08:30', hard_stop: '08:30' }))).toMatch(/^A 30-minute grace period saves [\d,]+ late deliveries a year; from 08:30 every order goes to tomorrow\.$/);
    expect(lateOrdersTitle(mockLateOrders({ grace_until: '08:00', hard_stop: '10:00' }))).toMatch(/^Taking urgent orders until 10:00 saves up to [\d,]+ late deliveries a year\.$/);
    expect(lateOrdersTitle(mockLateOrders({ grace_until: '08:00', hard_stop: '08:00' }))).toMatch(/^With no grace period and no urgent orders, all 4,826/);
    expect(durationLabel('08:00', '09:30')).toBe('1.5-hour');
  });

  it('has help content for the page', () => {
    expect(HELP['/late-orders']?.items.length ?? 0).toBeGreaterThan(0);
  });
});

describe('Late same-day orders page', () => {
  let spy: MockInstance<typeof api.lateOrders>;
  beforeEach(() => {
    spy = vi.spyOn(api, 'lateOrders').mockImplementation(async (req: LateOrdersRequest = {}) => ({ data: mockLateOrders(req), source: 'sample' as const }));
  });
  afterEach(() => spy.mockRestore());

  it('starts at the Order desk settings and shows the finding, the sample notice and the help key', async () => {
    renderPage();
    expect(await screen.findByTestId('late-orders-title')).toHaveTextContent('A 1-hour grace period saves 729 late deliveries a year; urgent orders until 10:00 add up to 166 more.');
    expect(spy).toHaveBeenCalledWith({});
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('sample-response')).toHaveTextContent('Sample — API offline.');
    expect(screen.getByRole('button', { name: /What am I looking at\?/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Grace period until')).toHaveValue('09:00');
    expect(screen.getByLabelText('Hard stop')).toHaveValue('10:00');
    expect(screen.getByTestId('desk-settings')).toHaveTextContent('SAME_DAY_GRACE_UNTIL');
  });

  it('keeps grace before the hard stop: later grace times and earlier hard stops are disabled', async () => {
    renderPage();
    await screen.findByTestId('late-orders-title');
    const grace = screen.getByLabelText('Grace period until');
    const hard = screen.getByLabelText('Hard stop');
    expect(within(grace).getByRole('option', { name: '10:00' })).not.toBeDisabled();
    expect(within(grace).getByRole('option', { name: '10:30' })).toBeDisabled();
    expect(within(hard).getByRole('option', { name: '08:30' })).toBeDisabled();
    expect(within(hard).getByRole('option', { name: '09:00 (no urgent window)' })).not.toBeDisabled();
  });

  it('asks the API again when a time changes, and offers a way back to the Order desk settings', async () => {
    renderPage();
    await screen.findByTestId('late-orders-title');
    fireEvent.change(screen.getByLabelText('Hard stop'), { target: { value: '11:00' } });
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith({ grace_until: '09:00', hard_stop: '11:00' }));
    await waitFor(() => expect(screen.getByTestId('late-orders-title')).toHaveTextContent(/urgent orders until 11:00/));
    fireEvent.click(screen.getByRole('button', { name: 'Back to the Order desk settings' }));
    await waitFor(() => expect(screen.getByTestId('late-orders-title')).toHaveTextContent(/until 10:00/));
  });

  it('colours the arrivals by window, labels the urgent figures as an upper bound and shows the decision table', async () => {
    renderPage();
    await screen.findByTestId('late-orders-title');
    const bars = screen.getAllByTestId('arrival');
    expect(bars).toHaveLength(12);
    expect(bars[0]).toHaveAttribute('data-window', 'grace');
    expect(bars[0]).toHaveTextContent('08:00–08:30');
    expect(bars[0]).toHaveTextContent('412');
    expect(bars[2]).toHaveTextContent('urgent orders only');
    expect(screen.getByTestId('result-grace')).toHaveTextContent('Exact');
    expect(screen.getByTestId('result-grace')).toHaveTextContent('$43K');
    expect(screen.getByTestId('result-urgent')).toHaveTextContent('At most');
    expect(screen.getByTestId('other-clients')).toHaveTextContent('614 orders from other clients');
    expect(screen.getByTestId('on-time')).toHaveTextContent('39%');
    expect(screen.getByTestId('on-time')).toHaveTextContent('46.6%');
    expect(screen.getByTestId('on-time')).toHaveTextContent('48.3%');
    const rows = within(screen.getByTestId('rules')).getAllByTestId('rule-row');
    expect(rows).toHaveLength(7);
    expect(within(rows[2]).getByText('AI agent')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Rule')).toBeInTheDocument();
    expect(rows[6]).toHaveTextContent('From 10:00');
    expect(rows[6]).toHaveTextContent('Tomorrow');
  });
});
