import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { api } from '../api/client';
import type { CarrierClaimResult, CarrierClaimsRow, ClaimLine } from '../api/types';
import { useAction, useApi } from '../lib/useApi';
import { num, usd } from '../lib/format';
import { SectionTitle } from './PageHeader';
import Drawer from './Drawer';
import { ActorBadge } from './Actor';
import { ErrorState, LoadingBlock } from './States';

/** SLA penalties Halcyon paid for delays the carrier alone caused, and a draft claim per carrier. */
export default function PenaltyClaims() {
  const s = useApi(() => api.carrierClaims());
  const [open, setOpen] = useState<CarrierClaimsRow | null>(null);
  if (s.loading && !s.data) return <LoadingBlock rows={4} label="Loading penalty claims" />;
  if (s.error || !s.data) return <ErrorState message={s.error ?? 'No data returned.'} onRetry={s.reload} />;
  const d = s.data;
  const max = Math.max(...d.carriers.map((c) => c.claimable_usd), 1);
  return (
    <section className="panel overflow-hidden" aria-labelledby="claims-title" data-testid="penalty-claims">
      <div className="panel-pad pb-0 sm:pb-0">
        <SectionTitle note={`${d.period[0]} to ${d.period[1]}`}>
          <span id="claims-title">Recover penalties the carriers caused</span>
        </SectionTitle>
        <p className="max-w-[78ch] text-[15px] text-ink-soft">
          Halcyon paid <span className="num font-semibold text-ink">{usd(d.total_penalties_paid_usd)}</span> in SLA penalties. For{' '}
          <span className="num font-semibold text-route-dark">{usd(d.total_claimable_usd)}</span> of it the carrier alone was at fault: Halcyon handed the
          order over on time with a complete address and stock at the nearest warehouse, and the carrier ran a weak lane or drove well beyond the planned
          route. Shared-fault deliveries are not claimed.
        </p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[15px]">
          <thead>
            <tr className="border-b border-line">
              <th className="th pl-5 sm:pl-6">Carrier</th>
              <th className="th">Claimable</th>
              <th className="th text-right">Deliveries</th>
              <th className="th text-right">Route beyond plan</th>
              <th className="th text-right">Shared fault (not claimed)</th>
              <th className="th pr-5 sm:pr-6">
                <span className="sr-only">Claim</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {d.carriers.map((c) => (
              <tr key={c.carrier_id} className="border-b border-line">
                <td className="td pl-5 font-semibold sm:pl-6">{c.carrier_name}</td>
                <td className="td w-[200px]">
                  <div className="num font-semibold">{usd(c.claimable_usd)}</div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-light">
                    <div className="h-1.5 rounded-full bg-route" style={{ width: `${(c.claimable_usd / max) * 100}%` }} />
                  </div>
                </td>
                <td className="td num text-right">{num(c.claimable_deliveries)}</td>
                <td className="td num text-right">{num(c.with_route_deviation)}</td>
                <td className="td num text-right text-slate">
                  {num(c.shared_fault_deliveries)} · {usd(c.shared_fault_usd)}
                </td>
                <td className="td pr-5 sm:pr-6">
                  <button type="button" className="btn-secondary min-h-[36px] whitespace-nowrap px-3 text-sm" onClick={() => setOpen(c)} disabled={!c.claimable_deliveries}>
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Draft claim
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel-pad pt-3 text-sm text-slate sm:pt-3">⚠ {d.contract_note}</p>
      <ClaimDrawer carrier={open} onClose={() => setOpen(null)} />
    </section>
  );
}

function csv(lines: ClaimLine[]): string {
  const head = ['delivery_id', 'order_id', 'client_id', 'region', 'handed_over', 'promised_date', 'delivered_date', 'days_late', 'penalty_usd', 'planned_route_km', 'actual_route_km', 'evidence'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [head.join(','), ...lines.map((l) => head.map((h) => esc(h === 'evidence' ? l.evidence.join('; ') : l[h as keyof ClaimLine])).join(','))].join('\n');
}

function download(r: CarrierClaimResult) {
  const blob = new Blob([csv(r.pack.lines)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `claim-carrier-${r.pack.carrier_id}${r.pack.month ? `-${r.pack.month}` : ''}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function ClaimDrawer({ carrier, onClose }: { carrier: CarrierClaimsRow | null; onClose: () => void }) {
  const claim = useAction(api.carrierClaim);
  const { run, reset } = claim;
  const [month, setMonth] = useState('');

  useEffect(() => {
    reset();
    setMonth('');
    if (carrier) void run(carrier.carrier_id);
  }, [carrier, run, reset]);

  const r = claim.data;
  return (
    <Drawer open={!!carrier} title={carrier ? `Claim: ${carrier.carrier_name}` : 'Claim'} onClose={onClose}>
      {carrier && (
        <div className="mb-4">
          <label htmlFor="claim-month" className="mb-1 block text-sm font-medium text-slate">
            Claim period
          </label>
          <select
            id="claim-month"
            className="field"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              void run(carrier.carrier_id, e.target.value || undefined);
            }}
          >
            <option value="">All six months</option>
            {carrier.by_month.map((m) => (
              <option key={m.month} value={m.month}>
                {m.month} ({m.deliveries} deliveries, {usd(m.claimable_usd)})
              </option>
            ))}
          </select>
        </div>
      )}
      {claim.error ? (
        <ErrorState message={`The claim could not be drafted: ${claim.error}`} onRetry={() => carrier && run(carrier.carrier_id, month || undefined)} />
      ) : claim.loading || !r ? (
        <LoadingBlock label="The Carrier Claims Agent is writing the letter" rows={8} />
      ) : (
        <div className="flex flex-col gap-5" data-testid="claim">
          <div className="flex flex-wrap items-center gap-2">
            <ActorBadge actor="AI agent" name="Carrier Claims Agent" />
            <span className="text-sm text-slate">Draft for the carrier manager. Nothing is sent.</span>
          </div>
          <dl className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-line px-3 py-2">
              <dt className="text-sm text-slate">Claim</dt>
              <dd className="num text-xl font-bold text-route-dark">{usd(r.pack.claim_usd)}</dd>
            </div>
            <div className="rounded-md border border-line px-3 py-2">
              <dt className="text-sm text-slate">Deliveries</dt>
              <dd className="num text-xl font-bold">{num(r.pack.deliveries)}</dd>
            </div>
            <div className="rounded-md border border-line px-3 py-2">
              <dt className="text-sm text-slate">Days late</dt>
              <dd className="num text-xl font-bold">{num(r.pack.days_late_total)}</dd>
            </div>
          </dl>
          <section className="rounded-md border border-line bg-paper p-4">
            <div className="mb-1 text-sm text-slate">Letter to the carrier, for review</div>
            <div className="mb-2 font-semibold">{r.letter.subject}</div>
            <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-ink">{r.letter.body}</pre>
          </section>
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold">The evidence ({num(r.pack.deliveries)} deliveries)</h3>
              <button type="button" className="btn-secondary min-h-[36px] px-3 text-sm" onClick={() => download(r)}>
                <Download className="h-4 w-4" aria-hidden="true" />
                Download the list (CSV)
              </button>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {r.pack.lines.slice(0, 8).map((l) => (
                <li key={l.delivery_id} className="num rounded-md border border-line px-3 py-2">
                  <span className="font-semibold">{l.delivery_id}</span> · promised {l.promised_date}, delivered {l.delivered_date} ·{' '}
                  <span className="text-late">{l.days_late} days late</span> · {usd(l.penalty_usd)}
                  <span className="block text-slate">
                    Handed over {l.handed_over}; {l.evidence.join('; ')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-sm text-slate">
            {r.guardrail_flags.length ? `Guardrail: ${r.guardrail_flags.join(', ').replace(/_/g, ' ')}. ` : ''}
            {r.method} {r.pack.contract_note}
          </p>
        </div>
      )}
    </Drawer>
  );
}
