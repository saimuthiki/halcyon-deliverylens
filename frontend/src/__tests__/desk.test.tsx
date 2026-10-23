import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DESK_MESSAGES, sampleProcessAll, sampleReset, sampleTrace, sampleWmsOrders } from '../api/deskFixtures';
import { normaliseDeskProcess, normaliseWmsOrder } from '../api/client';
import { aiLabel } from '../components/AiBadge';
import HelpPanel from '../components/HelpPanel';
import { HELP } from '../lib/help';
import { DecisionCard, KeyValues, Trace } from '../pages/OrderDesk';

const STEP_KEYS = ['receive', 'guardrail', 'extract', 'identify_client', 'address_check', 'promise_check', 'stock_check', 'carrier_choice', 'decision', 'client_message'];

describe('Order desk offline fixtures', () => {
  it('has the 12 sample emails with the agreed expected decisions', () => {
    expect(DESK_MESSAGES.map((m) => m.id)).toEqual(['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'M11', 'M12']);
    expect(DESK_MESSAGES.map((m) => m.expected_decision)).toEqual([
      'accepted', 'on_hold', 'on_hold', 'accepted', 'accepted', 'accepted', 'accepted', 'accepted', 'accepted', 'blocked', 'needs_review', 'accepted',
    ]);
    expect(DESK_MESSAGES.find((m) => m.id === 'M12')?.attachments[0].content_type).toBe('text/csv');
  });

  it('every pre-computed trace has the 10 steps in contract order and matches the expected decision', () => {
    for (const m of DESK_MESSAGES) {
      const t = sampleTrace(m.id);
      expect(t.steps.map((s) => s.key)).toEqual(STEP_KEYS);
      expect(t.steps.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(t.matches_expected).toBe(true);
    }
  });

  it('shows the scenario behaviour: re-promise, far warehouse, carrier switch, injection blocked', () => {
    const t4 = sampleTrace('M04');
    expect(t4.wms_order?.promised_date).toBe('2026-10-24');
    expect(t4.steps.find((s) => s.key === 'promise_check')?.status).toBe('warn');
    const t8 = sampleTrace('M08');
    expect(t8.wms_order?.nearest_warehouse_id).toBe('W5');
    expect(t8.wms_order?.fulfilment_warehouse_id).toBe('W1');
    const t9 = sampleTrace('M09');
    expect(t9.steps.find((s) => s.key === 'carrier_choice')?.details).toMatchObject({ spreadsheet_choice: 'F', advisor_choice: 'B' });
    const t10 = sampleTrace('M10');
    expect(t10.wms_order).toBeNull();
    expect(t10.steps.find((s) => s.key === 'guardrail')?.status).toBe('fail');
    expect(t10.steps.filter((s) => s.status === 'skipped').length).toBeGreaterThanOrEqual(6);
  });

  it('process-all fills the sample WMS (everything except the blocked email) and reset empties it', () => {
    sampleReset();
    const all = sampleProcessAll();
    expect(all).toMatchObject({ processed: 12, matches_expected: 12 });
    expect(sampleWmsOrders().orders).toHaveLength(11);
    sampleReset();
    expect(sampleWmsOrders().orders).toHaveLength(0);
  });
});

describe('Order desk normalisers', () => {
  it('keeps the contract fields and tolerates odd values', () => {
    const r = normaliseDeskProcess({
      message_id: '02',
      decision: 'on_hold',
      decision_reason: 'Missing postcode',
      steps: [{ step: 1, key: 'receive', title: 'Email received', actor: 'Data lookup', agent_name: 'Inbox', status: 'pass', summary: 'ok', details: { a: 1 }, duration_ms: 3 }],
      wms_order: { wms_order_id: 'WMS-1', message_id: '02', ship_to: { zip: '30301' }, lines: [{ sku: 'HX-1', quantity: 2 }], status: 'on_hold' },
      client_email_draft: 'Hello',
      llm_provider: 'gemini',
      llm_model: 'gemini-2.0-flash',
      expected_decision: 'on_hold',
      matches_expected: true,
    });
    expect(r.decision).toBe('on_hold');
    expect(r.steps[0].actor).toBe('Data lookup');
    expect(r.wms_order?.ship_to.postcode).toBe('30301');
    expect(r.wms_order?.lines[0]).toEqual({ sku: 'HX-1', qty: 2 });
    expect(normaliseWmsOrder({}).ship_to.street).toBeNull();
  });
});

describe('AI badge label', () => {
  it('names the provider the way the header shows it', () => {
    expect(aiLabel({ llm_provider: 'mock' })).toBe('AI: Mock (canned)');
    expect(aiLabel({ llm_provider: 'gemini', llm_model: 'gemini-2.0-flash' })).toBe('AI: Gemini gemini-2.0-flash');
    expect(aiLabel({ llm_provider: 'bedrock', llm_model: 'anthropic.claude' })).toBe('AI: Bedrock');
  });
});

describe('Trace and decision components', () => {
  it('renders one row per step with actor, status and expandable friendly details', () => {
    render(<Trace steps={sampleTrace('M09').steps} />);
    const rows = screen.getAllByTestId('trace-step');
    expect(rows).toHaveLength(10);
    const carrier = rows[7];
    expect(within(carrier).getByText('Carrier advisor')).toBeInTheDocument();
    expect(within(carrier).getByText('Warning')).toBeInTheDocument();
    fireEvent.click(within(carrier).getByRole('button', { name: 'Details' }));
    expect(within(carrier).getByText('Spreadsheet choice')).toBeInTheDocument();
    expect(within(carrier).getByText('Yes')).toBeInTheDocument(); // weak_lane_avoided: true
  });

  it('shows the decision and whether it matches the expected result', () => {
    render(<DecisionCard r={sampleTrace('M02')} />);
    const card = screen.getByTestId('decision-card');
    expect(card).toHaveTextContent('On hold');
    expect(card).toHaveTextContent('postcode');
    expect(screen.getByTestId('matches-expected')).toHaveTextContent('Matches expected');
  });

  it('shows arrays of objects as small rows', () => {
    render(<KeyValues value={{ lines: [{ sku: 'HX-1', qty: 2 }], missing: [] }} />);
    expect(screen.getByText('HX-1')).toBeInTheDocument();
    expect(screen.getByText('none')).toBeInTheDocument();
  });
});

describe('HelpPanel', () => {
  beforeEach(() => window.localStorage.clear());

  it('is closed by default and remembers being opened', () => {
    const { unmount } = render(
      <MemoryRouter>
        <HelpPanel pageKey="order-desk" content={HELP['/order-desk']} />
      </MemoryRouter>,
    );
    const toggle = screen.getByRole('button', { name: /What am I looking at\?/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Inbox (left)')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText('Inbox (left)')).toBeInTheDocument();
    expect(window.localStorage.getItem('deliverylens.help.order-desk')).toBe('1');
    unmount();
    render(<HelpPanel pageKey="order-desk" content={HELP['/order-desk']} />);
    expect(screen.getByRole('button', { name: /What am I looking at\?/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('has content for every page in the navigation', () => {
    for (const path of ['/how-it-works', '/order-desk', '/overview', '/why-late', '/vendor', '/what-if', '/carriers', '/clients', '/stock-routes', '/order-intake', '/ask', '/activity']) {
      expect(HELP[path]?.items.length ?? 0).toBeGreaterThan(0);
    }
  });
});
