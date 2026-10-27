import { render, screen, within } from '@testing-library/react';
import { normaliseDelayAlert, normaliseRecovery } from '../api/client';
import { mockDelayAlert } from '../api/mockData';
import { AT_RISK_CLIENTS, SAMPLE_DELIVERIES } from '../api/mockSnapshot';
import { RecoveryPlanView } from '../pages/WhyLate';
import { causeShort } from '../lib/causes';

const API_PLAN = {
  priority: 'high',
  priority_score: 85,
  priority_parts: [
    { rule: 'At-risk client', points: 40 },
    { rule: 'SLA penalty clause', points: 30 },
    { rule: 'Predicted 4 days late', points: 15 },
  ],
  escalate_to_account_owner: true,
  penalty_exposure_usd: 212,
  penalty_note: 'Estimate: the expected SLA penalty per late delivery for this client (its penalties / its late deliveries).',
  actions: [
    { cause: 'weak_carrier_lane', action: 'Ask carrier F for a tracking update today.', owner: 'Carrier manager', recommended_carrier: 'E' },
    { cause: null, action: 'Call Client 055 before they chase: the client is at risk of leaving.', owner: 'Account owner' },
  ],
  method: 'Rules, not AI.',
};

describe('Delay alert recovery plan', () => {
  it('normalises the API plan and tolerates its absence', () => {
    const r = normaliseDelayAlert({ subject: 'S', message: 'B', recovery: API_PLAN }, 'D1');
    expect(r.recovery).toMatchObject({ priority: 'high', priority_score: 85, escalate_to_account_owner: true, penalty_exposure_usd: 212 });
    expect(r.recovery?.actions[0]).toMatchObject({ cause: 'weak_carrier_lane', owner: 'Carrier manager', recommended_carrier: 'E' });
    expect(r.recovery?.actions[1].cause).toBeNull();
    expect(normaliseDelayAlert({ subject: 'S', message: 'B' }, 'D1').recovery).toBeNull();
    expect(normaliseRecovery({ priority: 'urgent', penalty_exposure_usd: null })?.priority).toBe('normal');
    expect(normaliseRecovery({ priority: 'medium' })?.penalty_exposure_usd).toBeNull();
  });

  it('shows priority, score, escalation, penalty and each action with its owner and cause', () => {
    render(<RecoveryPlanView plan={normaliseRecovery(API_PLAN)!} />);
    const plan = screen.getByTestId('recovery-plan');
    expect(plan).toHaveTextContent('Recovery plan for the team (not sent to the client)');
    expect(screen.getByTestId('recovery-priority')).toHaveTextContent('High priority');
    expect(screen.getByTestId('recovery-priority')).toHaveClass('text-late');
    expect(within(plan).getByText('Rule')).toBeInTheDocument();
    expect(screen.getByTestId('recovery-score')).toHaveTextContent('Score 85 = At-risk client 40 + SLA penalty clause 30 + Predicted 4 days late 15');
    expect(screen.getByTestId('recovery-escalate')).toHaveTextContent('Escalate to the account owner');
    expect(screen.getByTestId('recovery-penalty')).toHaveTextContent('$212');
    const actions = screen.getAllByTestId('recovery-action');
    expect(actions).toHaveLength(2);
    expect(actions[0]).toHaveTextContent('Owner: Carrier manager');
    expect(within(actions[0]).getByText(causeShort('weak_carrier_lane'))).toBeInTheDocument();
    expect(actions[1]).toHaveTextContent('Owner: Account owner');
  });

  it('a medium or normal plan is neutral and has no escalation line', () => {
    render(<RecoveryPlanView plan={{ ...normaliseRecovery(API_PLAN)!, priority: 'medium', escalate_to_account_owner: false, penalty_exposure_usd: null }} />);
    expect(screen.getByTestId('recovery-priority')).not.toHaveClass('text-late');
    expect(screen.queryByTestId('recovery-escalate')).not.toBeInTheDocument();
    expect(screen.getByTestId('recovery-penalty')).toHaveTextContent('none');
  });

  it('the offline delay alert carries a plausible plan: one action per cause, at-risk clients escalate', () => {
    const all = Object.values(SAMPLE_DELIVERIES).flat();
    const d = all.find((x) => AT_RISK_CLIENTS.some((c) => c.client_id === x.client_id)) ?? all[0];
    const r = mockDelayAlert(d.delivery_id);
    expect(r.recovery).toBeTruthy();
    expect(r.recovery!.actions.filter((a) => a.cause).map((a) => a.cause)).toEqual(d.causes);
    expect(r.recovery!.priority_score).toBe(r.recovery!.priority_parts.reduce((t, p) => t + p.points, 0));
    if (AT_RISK_CLIENTS.some((c) => c.client_id === d.client_id)) {
      expect(r.recovery!.escalate_to_account_owner).toBe(true);
      expect(r.recovery!.actions[r.recovery!.actions.length - 1]?.owner).toBe('Account owner');
    }
    expect(r.body).not.toContain('Recovery');
  });

  it("the offline plan values a late delivery at each client's expected penalty per late delivery", () => {
    const all = Object.values(SAMPLE_DELIVERIES).flat();
    const d = all.find((x) => AT_RISK_CLIENTS.some((c) => c.client_id === x.client_id && c.penalties_usd > 0))!;
    const c = AT_RISK_CLIENTS.find((x) => x.client_id === d.client_id)!;
    const late = Math.round(c.deliveries * (1 - c.on_time_rate));
    const plan = mockDelayAlert(d.delivery_id).recovery!;
    expect(plan.penalty_exposure_usd).toBe(Math.round(c.penalties_usd / late));
    expect(plan.penalty_note).toContain('expected SLA penalty per late delivery for this client');
  });
});
