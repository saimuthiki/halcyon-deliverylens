import { useEffect } from 'react';
import { api } from '../api/client';
import type { AtRiskClient } from '../api/types';
import { useAction } from '../lib/useApi';
import { pct, usd } from '../lib/format';
import Drawer from './Drawer';
import { ActorBadge } from './Actor';
import CauseChip from './CauseChip';
import { ErrorState, LoadingBlock } from './States';

/** The Account Save Agent's plan for one at-risk client: facts from the data, wording by the AI, a draft only. */
export default function SavePlanDrawer({ client, onClose }: { client: AtRiskClient | null; onClose: () => void }) {
  const plan = useAction(api.accountPlan);
  const { run, reset } = plan;

  useEffect(() => {
    reset();
    if (client) void run(client.client_id);
  }, [client, run, reset]);

  const r = plan.data;
  return (
    <Drawer open={!!client} title={client ? `Save plan: ${client.client_name}` : 'Save plan'} onClose={onClose}>
      {plan.error ? (
        <ErrorState message={`The plan could not be drafted: ${plan.error}`} onRetry={() => client && run(client.client_id)} />
      ) : plan.loading || !r ? (
        <LoadingBlock label="The Account Save Agent is writing the plan" rows={8} />
      ) : (
        <div className="flex flex-col gap-5" data-testid="save-plan">
          <div className="flex flex-wrap items-center gap-2">
            <ActorBadge actor="AI agent" name="Account Save Agent" />
            <span className="text-sm text-slate">Draft for the account owner. Nothing is sent.</span>
          </div>

          <dl className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-line px-3 py-2">
              <dt className="text-sm text-slate">On time today</dt>
              <dd className="num text-xl font-bold text-late">{pct(r.facts.on_time_rate, 0)}</dd>
            </div>
            <div className="rounded-md border border-line px-3 py-2">
              <dt className="text-sm text-slate">With the fixes</dt>
              <dd className="num text-xl font-bold text-route-dark">{pct(r.facts.projected_on_time_rate_with_fixes, 0)}</dd>
            </div>
            <div className="rounded-md border border-line px-3 py-2">
              <dt className="text-sm text-slate">Penalties paid</dt>
              <dd className="num text-xl font-bold">{r.facts.sla_penalty_clause ? usd(r.facts.sla_penalties_paid_usd) : '–'}</dd>
            </div>
          </dl>

          <section>
            <h3 className="text-[15px] font-semibold">For the account owner</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-ink">{r.plan.summary}</p>
          </section>

          <section>
            <h3 className="text-[15px] font-semibold">What went wrong, and what changes</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {r.facts.causes_of_their_late_deliveries.slice(0, 3).map((c) => (
                <li key={c.cause} className="rounded-md border border-line px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CauseChip cause={c.cause} />
                    <span className="num text-sm text-slate">{c.late_deliveries} late deliveries</span>
                  </div>
                  <p className="mt-1 text-[15px] text-ink-soft">
                    {c.fix} <span className="text-slate">Owner: {c.owner}.</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-[15px] font-semibold">Talking points</h3>
            <ul className="mt-1 list-disc pl-5 text-[15px] leading-relaxed">
              {r.plan.talking_points.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-[15px] font-semibold">Meeting agenda</h3>
            <ol className="mt-1 list-decimal pl-5 text-[15px] leading-relaxed">
              {r.plan.agenda.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          </section>

          {r.facts.complaints.most_recent.length > 0 && (
            <section>
              <h3 className="text-[15px] font-semibold">In their own words</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {r.facts.complaints.most_recent.map((c, i) => (
                  <li key={i} className="border-l-2 border-late/50 pl-3 text-[15px]">
                    <span className="text-ink">“{c.text}”</span>
                    <span className="num block text-sm text-slate">
                      {c.date}, {c.category}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-md border border-line bg-paper p-4">
            <div className="mb-1 text-sm text-slate">Email to the client, for review</div>
            <div className="mb-2 font-semibold">{r.plan.email_subject}</div>
            <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-ink">{r.plan.email_body}</pre>
          </section>

          <p className="text-sm text-slate">
            {r.guardrail_flags.length ? `Guardrail: ${r.guardrail_flags.join(', ').replace(/_/g, ' ')}. ` : ''}
            {r.method}
          </p>
        </div>
      )}
    </Drawer>
  );
}
