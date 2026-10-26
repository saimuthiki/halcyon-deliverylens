import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Ask from '../pages/Ask';
import { api, friendlyMessage } from '../api/client';

describe('Ask DeliveryLens', () => {
  it('answers a too-short question with guidance instead of calling the agent', () => {
    const ask = vi.spyOn(api, 'ask');
    render(
      <MemoryRouter>
        <Ask />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'hi' } });
    fireEvent.submit(screen.getByLabelText('Your question').closest('form')!);
    expect(screen.getByText(/Ask me a full question about Halcyon's deliveries/)).toBeInTheDocument();
    expect(screen.queryByText(/could not be answered/)).not.toBeInTheDocument();
    expect(ask).not.toHaveBeenCalled();
    ask.mockRestore();
  });

  it('keeps the plain-language messages for errors a person can act on', () => {
    expect(friendlyMessage(429, 'rate limited')).toMatch(/Wait a minute/);
    expect(friendlyMessage(422, 'Request is not valid: String should have at least 3 characters.')).toBe(
      'Request is not valid: String should have at least 3 characters.',
    );
  });
});
