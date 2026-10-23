import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, Mail } from 'lucide-react';
import { api } from '../api/client';
import type { CauseKey, CauseRow } from '../api/types';
import { useAction, useApi } from '../lib/useApi';
import { buildWaterfall } from '../lib/calc';
import { BENCHMARK, CAUSE_META, causeShort } from '../lib/causes';
import { dateLabel, num, pct, pts, usd } from '../lib/format';
import PageHeader, { SectionTitle } from '../components/PageHeader';
import Waterfall from '../components/Waterfall';
import Drawer from '../components/Drawer';
import CauseChip from '../components/CauseChip';
import { ErrorState, LoadingBlock, SampleResponseNotice, SourceTag } from '../components/States';

export default function WhyLate() {
  const causes = useApi(() => api.causes());
  const [params, setParams] = useSearchParams();
  const selected = (params.get('cause') as CauseKey | null) ?? null;
  const [deliveryId, setDeliveryId] = useState<string | null>(null);

  const select = useCallback(
    (c: CauseKey) => {
      setParams(c === selected ? {} : { cause: c }, { replace: true });
    },
    [selected, setParams],
  );

  const steps = useMemo(() => {
    if (!causes.data) return [];
    return buildWaterfall(causes.data.scenarios.today, causes.data.causes, (c) => causeShort(c), causes.data.scenarios.all_fixed);
  }, [causes.data]);

  const rows = useMemo(() => (causes.data ? [...causes.data.causes].sort((a, b) => b.fair_share_points - a.fair_share_points) : []), [causes.data]);
  const selectedRow = rows.find((r) => r.cause === selected) ?? null;

  return (
    <>
      <PageHeader
        title={
          causes.data
            ? `Five causes account for ${Math.round(causes.data.causes.reduce((t, c) => t + c.fair_share_points, 0))} of the ${Math.round((1 - causes.data.scenarios.today) * 100)} points lost`
            : 'Why deliveries are late'
        }
        lede={
          causes.data
            ? `Deliveries with none of these problems are on time ${pct(causes.data.scenarios.no_problem_rate)} of the time. Each bar shows how many points of on-time delivery are associated with a cause, shared fairly where causes overlap. Select a cause to see real late deliveries behind it.`
            : 'Each bar shows how many points of on-time delivery are associated with a cause, shared fairly where causes overlap. Select a cause to see real late deliveries behind it.'
        }
        aside={<SourceTag source={causes.source} />}
      />

      {causes.loading && !causes.data ? (
        <LoadingBlock label="Loading causes" rows={6} />
      ) : causes.error || !causes.data ? (
        <ErrorState message={causes.error ?? 'No data returned.'} onRetry={causes.reload} />
      ) : (
        <div className="flex flex-col gap-6">
          <section className="panel panel-pad" aria-labelledby="wf-title">
            <SectionTitle note="Vertical axis starts at 60%">
              <span id="wf-title">
                From {pct(causes.data.scenarios.today, 0)} today to a ceiling of {pct(causes.data.scenarios.all_fixed)} if every cause were fully removed
              </span>
            </SectionTitle>
            <Waterfall steps={steps} benchmark={BENCHMARK} selected={selected} onSelect={select} />
            <p className="mt-3 max-w-[80ch] text-[15px] text-ink-soft">
              No fix removes its cause completely. With the partial effectiveness we expect from each fix, the realistic outcome is{' '}
              <strong className="num text-ink">{pct(causes.data.scenarios.realistic)}</strong>, so the bars show what each cause costs today, not what
              each fix will win back.
            </p>
          </section>

          <section className="panel overflow-hidden" aria-labelledby="table-title">
            <div className="panel-pad pb-0 sm:pb-0">
              <SectionTitle note="Select a row to see sample deliveries">
                <span id="table-title">The causes, largest first</span>
              </SectionTitle>
            </div>
            <CauseTable rows={rows} selected={selected} onSelect={select} />
          </section>

          {selectedRow && <SampleDeliveries key={selectedRow.cause} row={selectedRow} onOpen={setDeliveryId} />}
        </div>
      )}

      <Drawer open={deliveryId != null} title={deliveryId ? `Delivery ${deliveryId}` : ''} onClose={() => setDeliveryId(null)}>
        {deliveryId && <DeliveryDetailView id={deliveryId} />}
      </Drawer>
    </>
  );
}

function CauseTable({ rows, selected, onSelect }: { rows: CauseRow[]; selected: CauseKey | null; onSelect: (c: CauseKey) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-[15px]">
        <thead>
          <tr className="border-b border-line">
            <th className="th pl-5 sm:pl-6">Cause</th>
            <th className="th text-right">Worth</th>
            <th className="th text-right">Deliveries hit</th>
            <th className="th text-right">On time when hit</th>
            <th className="th text-right">Share of late</th>
            <th className="th text-right">SLA penalties</th>
            <th className="th">Fixed by</th>
            <th className="th pr-5 sm:pr-6">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const active = r.cause === selected;
            const meta = CAUSE_META[r.cause];
            return (
              <tr
                key={r.cause}
                className={`cursor-pointer border-b border-line last:border-b-0 ${active ? 'bg-route-tint' : 'hover:bg-paper'}`}
                onClick={() => onSelect(r.cause)}
              >
                <td className="td pl-5 sm:pl-6">
                  <button
                    type="button"
                    className="text-left font-semibold text-ink underline-offset-4 hover:underline"
                    aria-pressed={active}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(r.cause);
                    }}
                  >
                    {causeShort(r.cause)}
                  </button>
                  <div className="text-sm text-slate">{r.label}</div>
                </td>
                <td className="td num whitespace-nowrap text-right font-semibold text-route-dark">{pts(r.fair_share_points)}</td>
                <td className="td num whitespace-nowrap text-right">{num(r.deliveries)}</td>
                <td className="td num whitespace-nowrap text-right text-late">{pct(r.on_time_rate, 0)}</td>
                <td className="td num whitespace-nowrap text-right">{pct(r.share_of_late_deliveries, 0)}</td>
                <td className="td num whitespace-nowrap text-right">{usd(r.sla_penalties_usd)}</td>
                <td className="td text-ink-soft">{meta?.owner === 'routing' ? 'Routing' : 'Process'}</td>
                <td className="td pr-5 text-slate sm:pr-6">
                  <ChevronRight className={`h-4 w-4 transition-transform ${active ? 'rotate-90 text-route' : ''}`} aria-hidden="true" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SampleDeliveries({ row, onOpen }: { row: CauseRow; onOpen: (id: string) => void }) {
  const list = useApi(() => api.causeDeliveries(row.cause, 8), [row.cause]);
  const meta = CAUSE_META[row.cause];

  useEffect(() => {
    document.getElementById('samples')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <section id="samples" className="panel panel-pad scroll-mt-20" aria-labelledby="samples-title">
      <SectionTitle note={<SourceTag source={list.source} />}>
        <span id="samples-title">Late deliveries caused by: {causeShort(row.cause)}</span>
      </SectionTitle>
      {meta && (
        <p className="-mt-2 mb-4 max-w-[72ch] text-[15px] text-ink-soft">
          <span className="font-semibold text-ink">The fix: </span>
          {meta.fix}
        </p>
      )}
      {list.loading && !list.data ? (
        <LoadingBlock rows={4} />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <p className="text-[15px] text-ink-soft">No sample deliveries were returned for this cause.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th pl-0">Delivery</th>
                <th className="th">Client</th>
                <th className="th">Promise</th>
                <th className="th">Region</th>
                <th className="th">Carrier</th>
                <th className="th text-right">Days late</th>
                <th className="th">All causes</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((d) => (
                <tr key={d.delivery_id} className="border-b border-line last:border-b-0 hover:bg-paper">
                  <td className="td pl-0">
                    <button type="button" className="font-semibold text-route underline-offset-4 hover:underline" onClick={() => onOpen(d.delivery_id)}>
                      {d.delivery_id}
                    </button>
                  </td>
                  <td className="td">{d.client_id}</td>
                  <td className="td">{d.commitment_type.replace('_', '-')}</td>
                  <td className="td">{d.destination_region}</td>
                  <td className="td">{d.carrier_id}</td>
                  <td className="td num whitespace-nowrap text-right font-semibold text-late">{d.days_late}</td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1.5">
                      {d.causes.map((c) => (
                        <CauseChip key={c} cause={c} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function DeliveryDetailView({ id }: { id: string }) {
  const detail = useApi(() => api.delivery(id), [id]);
  const alert = useAction(api.delayAlert);

  if (detail.loading && !detail.data) return <LoadingBlock label="Loading delivery" rows={6} />;
  if (detail.error || !detail.data) return <ErrorState message={detail.error ?? 'Delivery not found.'} onRetry={detail.reload} />;
  const d = detail.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <SourceTag source={detail.source} />
        {d.causes.map((c) => (
          <CauseChip key={c} cause={c} />
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[15px] sm:grid-cols-3">
        <Fact label="Client" value={d.client_id} />
        <Fact label="Channel" value={d.order_channel} />
        <Fact label="Promise" value={d.commitment_type.replace('_', '-')} />
        <Fact label="Region" value={d.destination_region} />
        <Fact label="Carrier" value={d.carrier_id} />
        <Fact label="Days late" value={<span className="font-bold text-late">{d.days_late}</span>} />
      </dl>

      <div className="rounded-md border-l-[3px] border-route bg-route-tint px-4 py-3">
        <h3 className="mb-1 text-[15px] font-semibold">Why it was late</h3>
        <p className="text-[15px] leading-relaxed text-ink">{d.explanation}</p>
      </div>

      <div>
        <h3 className="mb-3 text-[15px] font-semibold">What happened</h3>
        <ol className="relative ml-1.5 border-l-2 border-line">
          {d.timeline.map((e, i) => (
            <li key={i} className="relative pb-4 pl-5 last:pb-0">
              <span
                className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 ${
                  e.status === 'problem' ? 'border-late bg-late' : e.status === 'ok' ? 'border-route bg-surface' : 'border-slate bg-surface'
                }`}
                aria-hidden="true"
              />
              <div className="num text-sm text-slate">{dateLabel(e.ts)}</div>
              <div className={`text-[15px] ${e.status === 'problem' ? 'font-semibold text-late' : 'text-ink'}`}>
                {e.label}
                {e.status === 'problem' && <span className="sr-only"> (problem)</span>}
              </div>
              {e.detail && <div className="text-sm text-ink-soft">{e.detail}</div>}
            </li>
          ))}
        </ol>
      </div>

      <div className="border-t border-line pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold">Tell the client before they ask</h3>
            <p className="text-sm text-ink-soft">12 of 34 complaints were about not being told about a delay. The agent forecasts the delay and drafts the message.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => alert.run(d.delivery_id)} disabled={alert.loading}>
            <Mail className="h-4 w-4" aria-hidden="true" />
            {alert.loading ? 'Drafting…' : alert.data ? 'Draft again' : 'Draft delay alert'}
          </button>
        </div>
        {alert.error && <p className="mt-3 text-[15px] text-late">The delay alert could not be drafted: {alert.error}</p>}
        {alert.data && (
          <div className="mt-4 flex flex-col gap-3" aria-live="polite">
            <SampleResponseNotice source={alert.source} />
            {(alert.data.predicted_delay_days != null || alert.data.predicted_date) && (
              <div className="rounded-md border border-line px-4 py-3" data-testid="delay-forecast">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[15px]">
                  <div>
                    <dt className="text-sm text-slate">Expected delay</dt>
                    <dd className="num font-bold text-late">
                      {alert.data.predicted_delay_days != null
                        ? `${alert.data.predicted_delay_days} day${alert.data.predicted_delay_days === 1 ? '' : 's'}`
                        : '–'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate">Expected arrival</dt>
                    <dd className="num font-bold">{dateLabel(alert.data.predicted_date)}</dd>
                  </div>
                </dl>
                {alert.data.basis && <p className="mt-2 text-sm text-ink-soft">How we estimated it: {alert.data.basis}</p>}
              </div>
            )}
            <div className="rounded-md border border-line bg-paper p-4">
              <div className="mb-2 text-sm text-slate">Draft for review, not sent</div>
              <div className="mb-2 font-semibold">{alert.data.subject}</div>
              <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-ink">{alert.data.body}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-slate">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
