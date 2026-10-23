import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HowItWorks from '../pages/HowItWorks';

describe('How it works', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the 10-step journey, the five causes and the routing bracket; badges appear only with DeliveryLens', async () => {
    render(
      <MemoryRouter initialEntries={['/how-it-works']}>
        <HowItWorks />
      </MemoryRouter>,
    );
    expect(screen.getAllByTestId('process-step')).toHaveLength(10);
    const causes = screen.getAllByTestId('cause-marker').map((c) => c.textContent);
    expect(causes).toEqual(['−6.9 ptsIncomplete address', '−5.4 ptsSame-day after 08:00', '−4.9 ptsStock not at nearest warehouse', '−7.7 ptsWeak carrier on a lane', '−3.1 ptsRoute deviation']);
    expect(screen.getAllByTestId('routing-tool')).toHaveLength(1);
    expect(screen.queryAllByTestId('act-badge')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'With DeliveryLens' }));
    const badges = screen.getAllByTestId('act-badge');
    const names = badges.map((b) => b.textContent);
    for (const n of ['Order Intake Agent', 'Address check', 'Promise check', 'Stock check', 'Carrier advisor', 'Delay Alert Agent', 'Ask DeliveryLens']) {
      expect(names.some((x) => x?.includes(n))).toBe(true);
    }
    expect(badges.find((b) => b.textContent?.includes('Carrier advisor'))).toHaveAttribute('href', '/carriers');
    expect(await screen.findByText('71%')).toBeInTheDocument();
    expect(screen.getByText('$14.2M')).toBeInTheDocument();
  });
});
