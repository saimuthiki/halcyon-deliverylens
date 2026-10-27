import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DESK_MESSAGES, sampleApprove, sampleApproveAll, sampleProcess, sampleProcessAll, sampleReset, sampleTrace, sampleWmsOrders } from '../api/deskFixtures';
import { normaliseDeskProcess, normaliseWmsOrder } from '../api/client';
import { aiLabel } from '../components/AiBadge';
import HelpPanel from '../components/HelpPanel';
import { HELP } from '../lib/help';
import { DecisionCard, KeyValues, parseSameDay, SameDayDetails, Trace, wmsStatus } from '../pages/OrderDesk';

const STEP_KEYS = ['receive', 'guardrail', 'extract', 'identify_client', 'address_check', 'promise_check', 'stock_check', 'carrier_choice', 'decision', 'client_message'];

describe('Order desk offline fixtures', () => {
  it('has the 17 sample emails with the agreed expected decisions', () => {
    expect(DESK_MESSAGES.map((m) => m.id)).toEqual(['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'M11', 'M12', 'M13', 'M14', 'M15', 'M16', 'M17']);
    expect(DESK_MESSAGES.map((m) => m.expected_decision)).toEqual([
      'accepted', 'on_hold', 'on_hold', 'accepted', 'accepted', 'accepted', 'accepted', 'accepted', 'accepted', 'blocked', 'needs_review', 'accepted', 'accepted', 'accepted',
      'accepted', 'accepted', 'accepted',
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

  it('shows the scenario behaviour: same-day added, far warehouse, carrier switch, on hold skips, injection blocked', () => {
    const t4 = sampleTrace('M04');
    expect(t4.wms_order).toMatchObject({ client_id: 'C078', commitment_type: 'same_day', pick_list_date: '2026-10-23', promised_date: '2026-10-24', fulfilment_warehouse_id: 'W4', carrier_id: 'E' });
    expect(t4.steps.find((s) => s.key === 'promise_check')?.details).toMatchObject({
      window: 'urgent_window',
      added_after_cutoff: true,
      priority_client: 'Tier 1 (at least $1M revenue a year)',
      urgency: 'high',
      urgency_evidence: 'We need this SAME DAY please, it is for a store opening.',
    });
    expect(DESK_MESSAGES.find((m) => m.id === 'M04')).toMatchObject({ from_email: 'urgent@client-078.example', client_id: 'C078', subject: 'URGENT same day - Client 078' });
    expect(t4.steps.find((s) => s.key === 'promise_check')?.status).toBe('pass');
    expect(sampleTrace('M02').steps.filter((s) => s.status === 'skipped').map((s) => s.key)).toEqual(['promise_check', 'stock_check', 'carrier_choice']);
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
    expect(all).toMatchObject({ processed: 17, matches_expected: 17 });
    // 13 accepted, 2 on hold, 1 needs review, 1 blocked (as the live API).
    const count = (d: string) => all.results.filter((r) => r.decision === d).length;
    expect([count('accepted'), count('on_hold'), count('needs_review'), count('blocked')]).toEqual([13, 2, 1, 1]);
    expect(sampleWmsOrders().orders).toHaveLength(16);
    sampleReset();
    expect(sampleWmsOrders().orders).toHaveLength(0);
  });
});

describe('Human approval before the WMS (offline)', () => {
  beforeEach(() => sampleReset());

  it('an accepted order waits for approval and step 9 says so', () => {
    const t = sampleProcess('M01');
    expect(t.decision).toBe('accepted');
    expect(t.wms_order).toMatchObject({ status: 'awaiting_approval', approved_at: null });
    const d = t.steps.find((s) => s.key === 'decision')!;
    expect(d.actor).toBe('Rule');
    expect(d.summary).toMatch(/^Accepted: waiting for a person to approve it into the WMS\./);
    expect(sampleProcess('M02').wms_order?.status).toBe('on_hold_missing_address');
  });

  it('approve moves it to ready for pick list, and a second approve is a 409', () => {
    sampleProcess('M01');
    expect(sampleApprove('M01').wms_order).toMatchObject({ status: 'ready_for_pick_list', promised_date: '2026-10-24' });
    expect(sampleWmsOrders().orders[0].approved_at).toBeTruthy();
    expect(() => sampleApprove('M01')).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => sampleApprove('M99')).toThrow(expect.objectContaining({ status: 404 }));
  });

  it('approve all approves only the accepted orders', () => {
    sampleProcessAll();
    expect(sampleApproveAll().approved).toBe(13);
    const statuses = sampleWmsOrders().orders.map((o) => o.status);
    expect(statuses.filter((s) => s === 'ready_for_pick_list')).toHaveLength(13);
    expect(statuses).not.toContain('awaiting_approval');
    expect(sampleApproveAll().approved).toBe(0);
  });

  it('the decision card offers Approve into WMS and then shows Ready for pick list', () => {
    const r = sampleProcess('M01');
    const onApprove = vi.fn();
    const { rerender } = render(<DecisionCard r={r} order={r.wms_order} onApprove={onApprove} />);
    expect(screen.getByTestId('approval')).toHaveTextContent('Waiting for a person to approve it into the WMS');
    fireEvent.click(screen.getByRole('button', { name: 'Approve into WMS' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    rerender(<DecisionCard r={r} order={sampleApprove('M01').wms_order} onApprove={onApprove} />);
    expect(screen.getByTestId('approval-done')).toHaveTextContent('Ready for pick list');
    expect(screen.queryByRole('button', { name: 'Approve into WMS' })).not.toBeInTheDocument();
  });

  it('a preview that has not been run cannot be approved', () => {
    render(<DecisionCard r={sampleTrace('M01')} />);
    expect(screen.queryByRole('button', { name: 'Approve into WMS' })).not.toBeInTheDocument();
  });

  it('labels the WMS statuses in plain words', () => {
    expect(wmsStatus('awaiting_approval').label).toBe('Awaiting approval');
    expect(wmsStatus('ready_for_pick_list').label).toBe('Ready for pick list');
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
    expect(r.client_email_draft).toEqual({ kind: null, to: null, subject: null, body: 'Hello' });
    expect(normaliseDeskProcess({ client_email_draft: { kind: 'follow_up', to: 'a@b.example', subject: 'S', body: 'B' } }).client_email_draft?.subject).toBe('S');
    expect(normaliseWmsOrder({}).ship_to.street).toBeNull();
    expect(normaliseWmsOrder({}).approved_at).toBeNull();
    expect(normaliseWmsOrder({ approved_at: '2026-10-23T09:00:00Z' }).approved_at).toBe('2026-10-23T09:00:00Z');
  });
});

describe('AI badge label', () => {
  it('names the provider the way the header shows it', () => {
    expect(aiLabel({ llm_provider: 'mock' })).toBe('AI: Mock (canned)');
    expect(aiLabel({ llm_provider: 'gemini', llm_model: 'gemini-2.0-flash' })).toBe('AI: Gemini 2.0 Flash');
    expect(aiLabel({ llm_provider: 'gemini', llm_model: 'gemini-2.5-flash' })).toBe('AI: Gemini 2.5 Flash');
    expect(aiLabel({ llm_provider: 'gemini' })).toBe('AI: Gemini');
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
    for (const path of ['/how-it-works', '/order-desk', '/overview', '/why-late', '/vendor', '/what-if', '/carriers', '/clients', '/stock-routes', '/order-intake', '/ask', '/activity', '/late-orders']) {
      expect(HELP[path]?.items.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('Late same-day orders on the Order desk', () => {
  const promise = (id: string) => sampleTrace(id).steps.find((s) => s.key === 'promise_check')!;
  const step6 = (id: string) => {
    render(<Trace steps={sampleTrace(id).steps} />);
    return screen.getAllByTestId('trace-step').find((r) => r.getAttribute('data-key') === 'promise_check')!;
  };

  it('M13: a valid reason in the urgent window adds the order to today, for any client', () => {
    const t = sampleTrace('M13');
    const d = promise('M13').details;
    expect(DESK_MESSAGES.find((m) => m.id === 'M13')).toMatchObject({ from_email: 'purchasing@client-076.example', client_id: 'C076' });
    expect(d).toMatchObject({
      window: 'urgent_window',
      window_label: 'Urgent orders only',
      added_after_cutoff: true,
      same_day_rule: 'the email gives a valid reason for the urgency',
      priority_client: null,
      urgency: 'high',
      grace_until: '09:00',
      hard_stop: '10:00',
    });
    expect(d.urgency_evidence).toBe('Our production line stops at 3pm without these parts.');
    expect(DESK_MESSAGES.find((m) => m.id === 'M13')?.body).toContain(d.urgency_evidence as string);
    expect(promise('M13').status).toBe('pass');
    expect(promise('M13').summary).toBe(
      'Same-day order received at 09:40, after the 08:00 pick-list cutoff: added to today\'s pick list because the email gives a valid reason for the urgency ("Our production line stops at 3pm without these parts."). The same-day promise is kept.',
    );
    expect(t.wms_order).toMatchObject({ client_id: 'C076', commitment_type: 'same_day', pick_list_date: '2026-10-23', promised_date: '2026-10-24', fulfilment_warehouse_id: 'W1', carrier_id: 'C' });
    expect(t.wms_order?.ship_to).toMatchObject({ street: '4410 Industrial Pkwy', city: 'Columbus', state: 'OH', postcode: '43219' });
    expect(t.client_email_draft?.body).toContain("added it to today's pick list");
    expect(t.client_email_draft?.body).not.toContain('next-day');
  });

  it('M04: the store opening is a valid reason at 09:30, so it is added too', () => {
    const t = sampleTrace('M04');
    expect(promise('M04')).toMatchObject({ status: 'pass', details: { window: 'urgent_window', added_after_cutoff: true, urgency: 'high' } });
    expect(t.wms_order).toMatchObject({ client_id: 'C078', commitment_type: 'same_day', pick_list_date: '2026-10-23', promised_date: '2026-10-24' });
  });

  it('M14: "URGENT!!!" with no reason from a Tier 3 client goes to tomorrow', () => {
    const t = sampleTrace('M14');
    expect(promise('M14').details).toMatchObject({ window: 'urgent_window', added_after_cutoff: false, priority_client: null, urgency: 'medium', re_promised: true });
    expect(promise('M14').status).toBe('warn');
    expect(promise('M14').summary).toContain('the email says it is urgent but gives no reason, and the client is not a priority client (Tier 1 or at risk)');
    expect(t.wms_order).toMatchObject({ commitment_type: 'next_day', pick_list_date: '2026-10-24', promised_date: '2026-10-25' });
    expect(t.decision_reason).toMatch(/^Accepted with warnings: Same-day order received at 09:15/);
    expect(t.client_email_draft?.body).toContain('next-day');
  });

  it('M15: "URGENT" with no reason is enough for a Tier 1 client', () => {
    expect(promise('M15').details).toMatchObject({
      window: 'urgent_window',
      added_after_cutoff: true,
      priority_client: 'Tier 1 (at least $1M revenue a year)',
      urgency: 'medium',
      urgency_evidence: 'This one is URGENT, please ship it same-day.',
    });
    expect(sampleTrace('M15').wms_order).toMatchObject({ client_id: 'C003', commitment_type: 'same_day', pick_list_date: '2026-10-23' });
  });

  it('M16: the grace period adds any same-day order before 09:00', () => {
    expect(promise('M16')).toMatchObject({
      status: 'pass',
      summary: "Same-day order received at 08:35, after the 08:00 pick-list cutoff: added to today's pick list because it arrived in the grace period (08:00 to 09:00). The same-day promise is kept.",
      details: { window: 'grace', window_label: 'Grace period', added_after_cutoff: true, urgency: 'none' },
    });
  });

  it('M17: after the 10:00 hard stop even a valid reason from an at-risk client goes to tomorrow', () => {
    const t = sampleTrace('M17');
    expect(promise('M17').details).toMatchObject({ window: 'after_hard_stop', added_after_cutoff: false, priority_client: 'at risk of leaving', urgency: 'high' });
    expect(promise('M17').status).toBe('warn');
    expect(t.wms_order).toMatchObject({ client_id: 'C190', commitment_type: 'next_day', pick_list_date: '2026-10-24', promised_date: '2026-10-25', carrier_id: 'B' });
  });

  it('renders the window, the outcome, the rule and the AI evidence quote readably', () => {
    const s = step6('M13');
    expect(within(s).getByTestId('same-day-outcome')).toHaveTextContent('Added to today’s pick list after the 08:00 cutoff');
    expect(within(s).getByTestId('same-day-window')).toHaveTextContent('Received 09:40, Urgent orders only, 09:00 to 10:00');
    expect(within(s).getByTestId('same-day-rule')).toHaveTextContent('Because the email gives a valid reason for the urgency.');
    expect(within(s).queryByTestId('priority-client')).not.toBeInTheDocument(); // the rule's reason already says so
    const quote = within(s).getByTestId('urgency-evidence');
    expect(quote).toHaveTextContent('“Our production line stops at 3pm without these parts.”');
    expect(within(quote).getByText('AI agent')).toBeInTheDocument();
    expect(quote.querySelector('blockquote')).toHaveClass('text-ai');
  });

  it('says when an order is not added, and why', () => {
    render(<SameDayDetails details={promise('M17').details} />);
    expect(screen.getByTestId('same-day-outcome')).toHaveTextContent('Not added: tomorrow’s pick list, re-promised as next-day');
    expect(screen.getByTestId('same-day-window')).toHaveTextContent('After the hard stop, from 10:00');
    expect(screen.getByTestId('priority-client')).toHaveTextContent('Priority client: at risk of leaving');
    expect(screen.getByTestId('urgency-evidence')).toHaveTextContent('Our production line stops at 4pm');
  });

  it('shows the grace period without the urgency or client lines', () => {
    const s = step6('M16');
    expect(within(s).getByTestId('same-day-window')).toHaveTextContent('Grace period, 08:00 to 09:00');
    expect(within(s).queryByTestId('priority-client')).not.toBeInTheDocument();
    expect(within(s).queryByTestId('urgency-evidence')).not.toBeInTheDocument();
  });

  it('keeps steps without a late same-day window unchanged', () => {
    render(<Trace steps={sampleTrace('M01').steps} />);
    expect(screen.queryByTestId('same-day-details')).not.toBeInTheDocument();
    // A before-cutoff same-day order carries the window keys: nothing extra is shown.
    expect(parseSameDay(promise('M05').details).window).toBe('before_cutoff');
    render(<SameDayDetails details={promise('M05').details} />);
    expect(screen.queryByTestId('same-day-details')).not.toBeInTheDocument();
    expect(parseSameDay({}).evidence).toBeNull();
  });

  it('shows an unverified-quote note from the API', () => {
    render(<SameDayDetails details={{ urgency: 'none', urgency_evidence: null, urgency_note: 'The quoted sentence is not in the email, so urgency was ignored.' }} />);
    expect(screen.getByText(/not in the email/)).toBeInTheDocument();
    expect(screen.queryByTestId('urgency-evidence')).not.toBeInTheDocument();
  });
});
