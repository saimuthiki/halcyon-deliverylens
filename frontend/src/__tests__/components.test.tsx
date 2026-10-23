import { render, screen } from '@testing-library/react';
import { SimulatorResults } from '../pages/Simulator';
import DeliveryTrack from '../components/DeliveryTrack';
import { simulateExact } from '../lib/calc';
import { comboModel, mockCauses } from '../api/mockData';

describe('SimulatorResults', () => {
  it('shows the projected rate, points gained and the benchmark gap for process fixes', () => {
    const result = simulateExact({ incomplete_address: 1, same_day_after_cutoff: 1, stock_not_at_nearest: 1 }, comboModel);
    render(<SimulatorResults result={result} causes={mockCauses.causes} exact={false} />);
    expect(screen.getByRole('img', { name: /Projected on-time delivery 86\.7%/ })).toBeInTheDocument();
    expect(screen.getByTestId('points-gained')).toHaveTextContent('+15.7 pts');
    expect(screen.getByTestId('verdict')).toHaveTextContent('7.3 points short of the 94% benchmark');
    expect(screen.getByText('Calculated in the browser, same model as the API')).toBeInTheDocument();
  });

  it('says the benchmark is met when every cause is fixed', () => {
    const all = Object.fromEntries(mockCauses.causes.map((c) => [c.cause, 1]));
    render(<SimulatorResults result={simulateExact(all, comboModel)} causes={mockCauses.causes} exact />);
    expect(screen.getByTestId('verdict')).toHaveTextContent('Meets the 94% benchmark');
    expect(screen.getByTestId('penalties').textContent).toMatch(/^\$\d/);
  });
});

describe('DeliveryTrack', () => {
  it('describes every option for screen readers', () => {
    render(<DeliveryTrack today={0.71} routingOnly={0.8024} processOnly={0.8667} realistic={0.9024} ceiling={0.99} benchmark={0.94} />);
    const fig = screen.getByRole('figure');
    expect(fig).toHaveAttribute('aria-label', expect.stringContaining('routing vendor only 80.2%'));
    expect(fig).toHaveAttribute('aria-label', expect.stringContaining('all five fixes, realistic 90.2%'));
    expect(fig).toHaveAttribute('aria-label', expect.stringContaining('ceiling if every cause were fully removed 99.0%'));
    // Phone list names the ceiling as a ceiling, not an outcome.
    expect(screen.getByText('Ceiling, if every cause were fully removed', { selector: 'li span' })).toBeInTheDocument();
  });
});
