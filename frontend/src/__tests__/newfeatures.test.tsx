import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api } from '../api/client';
import type { AddressConfirmationView, DeskProcessResult } from '../api/types';
import { addressSuggestion } from '../components/AddressConfirmCard';
import ConfirmAddress from '../pages/ConfirmAddress';

const suggestion = {
  address: { street: '400 Foundry Road', city: 'Dayton', state: 'OH', postcode: '45402' },
  site_name: 'Client 263 Plant 2',
  matched_on: ['city', 'state', 'street'],
  deliveries_to_site: 38,
  last_delivered: '2026-09-24',
  sites_on_file: 3,
  token: 'tok123',
  confirm_url: 'http://localhost:5173/confirm-address/tok123',
};

function trace(decision: DeskProcessResult['decision'], details: Record<string, unknown>): DeskProcessResult {
  return {
    message_id: 'M02',
    decision,
    decision_reason: '',
    steps: [{ step: 5, key: 'address_check', title: 'Check the address', actor: 'Rule', agent_name: '', status: 'warn', summary: '', details, duration_ms: 0 }],
    wms_order: null,
    client_email_draft: null,
    llm_provider: 'mock',
    llm_model: 'mock-fast',
    expected_decision: 'on_hold',
    matches_expected: true,
  } as DeskProcessResult;
}

describe('address from history', () => {
  it('offers the confirmation only while the order is on hold with a suggestion', () => {
    expect(addressSuggestion(trace('on_hold', { missing: ['postcode'], suggestion }))?.token).toBe('tok123');
    expect(addressSuggestion(trace('on_hold', { missing: ['postcode'] }))).toBeNull();
    expect(addressSuggestion(trace('accepted', { suggestion }))).toBeNull();
  });

  it('lets the client confirm the address on file with one click', async () => {
    const view: AddressConfirmationView = {
      message_id: 'M02',
      subject: 'PO for Client 263',
      status: 'pending',
      site_name: 'Client 263 Plant 2',
      address: suggestion.address,
      missing: ['postcode'],
      confirmed_at: null,
    };
    const get = vi.spyOn(api, 'addressConfirmation').mockResolvedValue({ data: view, source: 'live' });
    const confirm = vi.spyOn(api, 'confirmAddress').mockResolvedValue({ data: { confirmation: { ...view, status: 'confirmed' }, trace: null }, source: 'live' });
    render(
      <MemoryRouter initialEntries={['/confirm-address/tok123']}>
        <Routes>
          <Route path="/confirm-address/:token" element={<ConfirmAddress />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('400 Foundry Road', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, deliver to this address' }));
    await waitFor(() => expect(screen.getByText('Thank you, the address is confirmed')).toBeInTheDocument());
    expect(get).toHaveBeenCalledWith('tok123');
    expect(confirm).toHaveBeenCalledWith('tok123');
    get.mockRestore();
    confirm.mockRestore();
  });
});
