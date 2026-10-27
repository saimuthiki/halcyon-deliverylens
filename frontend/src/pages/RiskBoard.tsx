import { useEffect, useState } from 'react';
import { Eye, MessageSquareText } from 'lucide-react';
import { api } from '../api/client';
import type { RiskBoard as Board, RiskRow } from '../api/types';
import { useAction, useApi } from '../lib/useApi';
import { num, pct, usd } from '../lib/format';
import PageHeader, { SectionTitle } from '../components/PageHeader';
import CauseChip from '../components/CauseChip';
import { ActorBadge } from '../components/Actor';
import { ErrorState, LoadingBlock } from '../components/States';

const WAREHOUSES = ['W1', 'W2', 'W3', 'W4', 'W5'];

export default function RiskBoard() {
  const [day, setDay] = useState<string | undefined>(undefined);
  const [warehouse, setWarehouse] = useState('');
  const [sort, setSort] = useState<'risk' | 'money'>('risk');
  const [hindsight, setHindsight] = useState(false);
  const board = useApi(() => api.riskBoard({ day, warehouse: warehouse || undefined, sort }), [day, warehouse, sort]);
  const bt = useApi(() => api.riskBacktest());
  const note = useAction(api.morningNote);
  const { reset } = note;
  useEffect(() => reset(), [day, warehouse, reset]);

  const b = board.data;
  return (
    <>
      <PageHeader
        title="At 08:00, see which shipments will be late before they leave"
        lede="Every shipment on the day's pick list gets a late risk from history: how often past deliveries with the same problems arrived late. The board lists the riskiest first, with the fixes that can still be made that morning and the risk after them. The score is a lookup over the data, not AI."
      />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="rb-day" className="mb-1 block text-sm font-medium text-slate">
            Pick-list day
          </label>
          <select id="rb-day" className="field min-w-[180px]" value={day ?? b?.day ?? ''} onChange={(e) => setDay(e.target.value)} disabled={!b}>
            {[...(b?.days ?? [])].reverse().map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rb-wh" className="mb-1 block text-sm font-medium text-slate">
            Warehouse
          </label>
          <select id="rb-wh" className="field min-w-[150px]" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="">All warehouses</option>
            {WAREHOUSES.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rb-sort" className="mb-1 block text-sm font-medium text-slate">
            Order by
          </label>
          <select id="rb-sort" className="field min-w-[170px]" value={sort} onChange={(e) => setSort(e.target.value as 'risk' | 'money')}>
            <option value="risk">Late risk</option>
            <option value="money">Money at risk</option>
          </select>
        </div>
        <label className="ml-auto inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-[15px]">
          <input type="checkbox" checked={hindsight} onChange={(e) => setHindsight(e.target.checked)} className="h-4 w-4 accent-route" />
          <Eye className="h-4 w-4 text-slate" aria-hidden="true" />
          Show what really happened
        </label>
      </div>

      {board.error ? (
        <ErrorState message={board.error} onRetry={board.reload} />
      ) : board.loading && !b ? (
        <LoadingBlock rows={10} label="Scoring the pick list" />
      ) : b ? (
        <div className="flex flex-col gap-6">
          <Summary b={b} hindsight={hindsight} />
          <section className="panel overflow-hidden" aria-labelledby="rb-title" aria-busy={board.loading}>
            <div className="panel-pad pb-0 sm:pb-0">
              <SectionTitle note={`Learned from ${num(b.history.deliveries)} deliveries delivered by ${b.history.through}`}>
                <span id="rb-title">Act on these first</span>
              </SectionTitle>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-[15px]" data-testid="risk-table">
                <thead>
                  <tr className="border-b border-line">
                    <th className="th pl-5 sm:pl-6">Shipment</th>
                    <th className="th">What is wrong</th>
                    <th className="th">Late risk</th>
                    <th className="th">Fix this morning</th>
                    <th className="th text-right">Money at risk</th>
                    {hindsight && <th className="th pr-5 text-right sm:pr-6">What happened</th>}
                  </tr>
                </thead>
                <tbody>
                  {b.top.map((r) => (
                    <Row key={r.delivery_id} r={r} hindsight={hindsight} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="panel-pad pt-3 text-sm text-slate sm:pt-3">{b.method}</p>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="panel panel-pad" aria-labelledby="note-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="note-title" className="text-lg font-semibold">
                  The 08:00 huddle message
                </h2>
                <ActorBadge actor="AI agent" name="Morning Note Agent" />
              </div>
              <p className="mt-1 text-[15px] text-ink-soft">The AI turns the top of the board into a short message for the warehouse and Customer Success. It never sees what really happened.</p>
              <button type="button" className="btn-primary mt-3" onClick={() => note.run(b.day, warehouse || undefined)} disabled={note.loading}>
                <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                {note.loading ? 'Writing…' : note.data ? 'Write again' : 'Write the morning note'}
              </button>
              {note.error && <p className="mt-2 text-[15px] text-late">{note.error}</p>}
              {note.data && (
                <div className="mt-3 rounded-md border border-line bg-paper p-4">
                  <div className="mb-2 font-semibold">{note.data.note.subject}</div>
                  <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-ink">{note.data.note.body}</pre>
                </div>
              )}
            </section>
            <section className="panel panel-pad" aria-labelledby="bt-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="bt-title" className="text-lg font-semibold">
                  Does the score work?
                </h2>
                <ActorBadge actor="Data lookup" />
              </div>
              {bt.data ? (
                <>
                  <p className="mt-1 text-[15px] text-ink-soft">
                    Learned from {bt.data.trained_on}, then tested on {num(bt.data.test_shipments)} shipments over {bt.data.test_days} days it had never seen.
                  </p>
                  <dl className="mt-3 grid grid-cols-3 gap-3">
                    <div className="rounded-md border border-line px-3 py-2">
                      <dt className="text-sm text-slate">Top {bt.data.top_per_day} really late</dt>
                      <dd className="num text-xl font-bold text-route-dark">{pct(bt.data.top_precision, 0)}</dd>
                    </div>
                    <div className="rounded-md border border-line px-3 py-2">
                      <dt className="text-sm text-slate">All shipments late</dt>
                      <dd className="num text-xl font-bold">{pct(bt.data.late_rate, 0)}</dd>
                    </div>
                    <div className="rounded-md border border-line px-3 py-2">
                      <dt className="text-sm text-slate">Ranking (AUC)</dt>
                      <dd className="num text-xl font-bold">{bt.data.auc.toFixed(2)}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-[15px] text-ink-soft">{bt.data.meaning}</p>
                </>
              ) : bt.error ? (
                <p className="mt-2 text-[15px] text-late">{bt.error}</p>
              ) : (
                <LoadingBlock rows={3} label="Checking the score" />
              )}
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Summary({ b, hindsight }: { b: Board; hindsight: boolean }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="panel px-4 py-3">
        <dt className="text-sm text-slate">Shipments on the list</dt>
        <dd className="num text-2xl font-bold">{num(b.shipments)}</dd>
      </div>
      <div className="panel px-4 py-3">
        <dt className="text-sm text-slate">Likely late</dt>
        <dd className="num text-2xl font-bold text-late">{b.expected_late.toFixed(0)}</dd>
      </div>
      <div className="panel px-4 py-3">
        <dt className="text-sm text-slate">Likely late after the fixes</dt>
        <dd className="num text-2xl font-bold text-route-dark">{b.expected_late_after_fixes.toFixed(0)}</dd>
      </div>
      <div className="panel px-4 py-3">
        <dt className="text-sm text-slate">{hindsight ? 'Really late (hindsight)' : 'Shipments with a morning fix'}</dt>
        <dd className="num text-2xl font-bold">
          {hindsight ? `${b.hindsight.late_all} · ${b.hindsight.late_in_top} of top ${b.hindsight.top}` : num(b.fixable_shipments)}
        </dd>
      </div>
    </dl>
  );
}

function Row({ r, hindsight }: { r: RiskRow; hindsight: boolean }) {
  const lowered = r.risk_after_fixes < r.risk;
  return (
    <tr className="border-b border-line align-top">
      <td className="td pl-5 sm:pl-6">
        <div className="num font-semibold">{r.delivery_id}</div>
        <div className="text-sm text-slate">
          {r.client_id}
          {r.at_risk_client && <span className="ml-1 rounded-full bg-late-tint px-1.5 text-late">at risk</span>} · {r.commitment_type.replace('_', '-')} · {r.warehouse_id} → {r.region} ·
          carrier {r.carrier_id}
        </div>
      </td>
      <td className="td">
        <div className="flex flex-wrap gap-1.5">
          {r.causes.length ? r.causes.map((c) => <CauseChip key={c} cause={c} />) : <span className="text-sm text-slate">No known problem</span>}
        </div>
      </td>
      <td className="td w-[150px]">
        <div className="num font-bold text-late">{pct(r.risk, 0)}</div>
        <div className="mt-1 h-1.5 rounded-full bg-slate-light">
          <div className="h-1.5 rounded-full bg-late" style={{ width: `${r.risk * 100}%` }} />
        </div>
        {lowered && <div className="num mt-1 text-sm text-route-dark">→ {pct(r.risk_after_fixes, 0)} after fixes</div>}
      </td>
      <td className="td">
        <ul className="flex flex-col gap-1 text-sm">
          {r.fixes.map((f) => (
            <li key={f.cause} className={f.risk_after == null ? 'text-slate' : 'text-ink'}>
              {f.action} <span className="text-slate">({f.owner})</span>
            </li>
          ))}
        </ul>
      </td>
      <td className="td num text-right">{usd(r.money_at_risk_usd)}</td>
      {hindsight && (
        <td className={`td num pr-5 text-right font-semibold sm:pr-6 ${r.hindsight.late ? 'text-late' : 'text-route-dark'}`}>
          {r.hindsight.late ? `${r.hindsight.days_late} days late` : 'On time'}
        </td>
      )}
    </tr>
  );
}
