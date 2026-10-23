import { render, screen } from '@testing-library/react';
import { SimulatorResults } from '../pages/Simulator';
import DeliveryTrack from '../components/DeliveryTrack';
import { simulateLocally } from '../lib/calc';
import { mockCauses, mockKpis } from '../api/mockData';

const input = { todayRate: 0.71, deliveries: mockKpis.deliveries, penaltiesUsd: mockKpis.sla_penalties_usd, causes: mockCauses.causes };

describe('SimulatorResults', () => {
  it('shows the projected rate, points gained and the benchmark gap for process fixes', () => {
    const result = simulateLocally({ incomplete_address: 1, same_day_after_cutoff: 1, stock_not_at_nearest: 1 }, input);
    render(<SimulatorResults result={result} causes={mockCauses.causes} exact={false} />);
    expect(screen.getByRole('img', { name: /Projected on-time delivery 87\.9%/ })).toBeInTheDocument();
    expect(screen.getByTestId('points-gained')).toHaveTextContent('+16.9 pts');
    expect(screen.getByTestId('verdict')).toHaveTextContent('6.1 points short of the 94% benchmark');
    expect(screen.getByText('Estimate from fair-share points')).toBeInTheDocument();
  });

  it('says the benchmark is met when every cause is fixed', () => {
    const all = Object.fromEntries(mockCauses.causes.map((c) => [c.cause, 1]));
    render(<SimulatorResults result={simulateLocally(all, input)} causes={mockCauses.causes} exact />);
    expect(screen.getByTestId('verdict')).toHaveTextContent('Meets the 94% benchmark');
    expect(screen.getByTestId('penalties').textContent).toMatch(/^\$\d/);
  });
});

describe('DeliveryTrack', () => {
  it('describes every option for screen readers', () => {
    render(<DeliveryTrack today={0.71} routingOnly={0.7862} processOnly={0.8672} allFixed={0.9663} benchmark={0.94} />);
    const fig = screen.getByRole('figure');
    expect(fig).toHaveAttribute('aria-label', expect.stringContaining('routing vendor only 78.6%'));
    expect(fig).toHaveAttribute('aria-label', expect.stringContaining('all five causes fixed 96.6%'));
  });
});
