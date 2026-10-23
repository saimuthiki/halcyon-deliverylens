import { Fragment, useMemo } from 'react';
import { api } from '../api/client';
import type { CarrierScorecard } from '../api/types';
import { useApi } from '../lib/useApi';
import { num, pct } from '../lib/format';
import PageHeader, { SectionTitle } from '../components/PageHeader';
import { ErrorState, LoadingBlock, SourceTag } from '../components/States';

export default function Carriers() {
  const sc = useApi(() => api.scorecard());
  const causes = useApi(() => api.causes());
  const lanes = sc.data?.matrix.filter((m) => m.weak).length;
  const worth = causes.data?.causes.find((c) => c.cause === 'weak_carrier_lane')?.fair_share_points;
  return (
    <>
      <PageHeader
        title="Carrier D is weak in every region. E and F are weak on three lanes."
        lede={`Carriers A, B and C deliver about 75% on time everywhere. Moving the ${lanes ?? 7} weak lanes to the best carrier for each region is worth ${
          worth != null ? `${worth.toFixed(1)} points` : 'more points than any other fix'
        }, the largest single cause, and needs no new software.`}
        aside={<SourceTag source={sc.source} />}
      />
      {sc.loading && !sc.data ? (
        <LoadingBlock rows={6} />
      ) : sc.error || !sc.data ? (
        <ErrorState message={sc.error ?? 'No data returned.'} onRetry={sc.reload} />
      ) : (
        <CarriersBody data={sc.data} />
      )}
    </>
  );
}

/** Sequential scale for the heatmap: lower on-time rates get a stronger late tint. */
function cellStyle(rate: number, weak: boolean, best: boolean) {
  if (best) return 'bg-route-tint text-route-dark font-semibold ring-2 ring-inset ring-route';
  if (weak || rate < 0.6) return 'bg-late text-white font-semibold';
  if (rate < 0.7) return 'bg-late-tint text-late font-semibold';
  return 'bg-surface text-ink';
}

function CarriersBody({ data }: { data: CarrierScorecard }) {
  const regions = useMemo(() => [...new Set(data.matrix.map((m) => m.region))].sort(), [data.matrix]);
  const carriers = useMemo(() => [...data.carriers].sort((a, b) => a.carrier_id.localeCompare(b.carrier_id)), [data.carriers]);
  const cell = (c: string, r: string) => data.matrix.find((m) => m.carrier_id === c && m.region === r);
  const rec = (r: string) => data.recommendations.find((x) => x.region === r);
  const hasDaysLate = carriers.some((c) => Number.isFinite(c.avg_days_late));

  return (
    <div className="flex flex-col gap-6">
      <section className="panel panel-pad" aria-labelledby="heat-title">
        <SectionTitle note="On-time rate by carrier and destination region">
          <span id="heat-title">Where each carrier delivers on time</span>
        </SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-1.5 text-[15px]">
            <thead>
              <tr>
                <th scope="col" className="th pl-0">Region</th>
                {carriers.map((c) => (
                  <th key={c.carrier_id} scope="col" className="th text-center">
                    Carrier {c.carrier_id}
                  </th>
                ))}
                <th scope="col" className="th">Recommended</th>
              </tr>
            </thead>
            <tbody>
              {regions.map((r) => {
                const rr = rec(r);
                return (
                  <tr key={r}>
                    <th scope="row" className="pr-3 text-left font-semibold">
                      {r}
                    </th>
                    {carriers.map((c) => {
                      const x = cell(c.carrier_id, r);
                      if (!x) return <td key={c.carrier_id} className="rounded bg-paper text-center text-slate">–</td>;
                      const best = rr?.recommended_carrier === c.carrier_id;
                      return (
                        <td
                          key={c.carrier_id}
                          className={`num h-12 rounded text-center ${cellStyle(x.on_time_rate, x.weak, best)}`}
                          title={x.deliveries ? `${num(x.deliveries)} deliveries` : undefined}
                        >
                          {pct(x.on_time_rate, 0)}
                          {best && <span className="sr-only"> (recommended)</span>}
                          {x.weak && <span className="sr-only"> (weak lane)</span>}
                        </td>
                      );
                    })}
                    <td className="pl-2 text-[15px]">
                      {rr ? (
                        <span>
                          <span className="font-semibold text-route-dark">Carrier {rr.recommended_carrier}</span>
                          <span className="text-ink-soft"> instead of {rr.avoid_carrier}</span>
                        </span>
                      ) : (
                        '–'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
          <Legend swatch="bg-late" label="Weak lane: well below the other carriers once other causes are taken out" />
          <Legend swatch="bg-late-tint border border-late/30" label="60–70%" />
          <Legend swatch="bg-surface border border-line" label="70% and above" />
          <Legend swatch="bg-route-tint ring-2 ring-inset ring-route" label="Best carrier for the region" />
        </div>
      </section>

      <section className="panel overflow-hidden" aria-labelledby="score-title">
        <div className="panel-pad pb-0 sm:pb-0">
          <SectionTitle note="All deliveries, 6 months">
            <span id="score-title">Carrier scorecard</span>
          </SectionTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th pl-5 sm:pl-6">Carrier</th>
                <th className="th text-right">Deliveries</th>
                <th className="th text-right">On time</th>
                {hasDaysLate && <th className="th text-right">Avg days late</th>}
                <th className="th text-right">Base rate</th>
                <th className="th">Delivery events</th>
                <th className="th pr-5 sm:pr-6">Weak regions</th>
              </tr>
            </thead>
            <tbody>
              {carriers.map((c) => (
                <tr key={c.carrier_id} className="border-b border-line last:border-b-0">
                  <td className="td pl-5 font-semibold sm:pl-6">
                    {c.carrier_name}
                    {c.preferred_supplier && <span className="ml-2 rounded-full bg-slate-light px-2 py-0.5 text-sm font-normal text-ink-soft">Preferred supplier</span>}
                  </td>
                  <td className="td num text-right">{num(c.deliveries)}</td>
                  <td className={`td num text-right font-semibold ${c.on_time_rate < 0.72 ? 'text-late' : ''}`}>{pct(c.on_time_rate)}</td>
                  {hasDaysLate && <td className="td num text-right">{Number.isFinite(c.avg_days_late) ? c.avg_days_late.toFixed(1) : '–'}</td>}
                  <td className="td num text-right">${c.base_rate_usd.toFixed(2)}</td>
                  <td className="td">{c.has_api ? 'Live API' : c.event_feed}</td>
                  <td className="td pr-5 sm:pr-6">
                    {c.weak_regions.length ? (
                      <span className="text-late">{c.weak_regions.join(', ')}</span>
                    ) : (
                      <span className="text-slate">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panel-pad pt-3 text-sm text-ink-soft sm:pt-3">
          The three weakest carriers are also the cheapest and the only ones without a live delivery-event API, so Halcyon learns about their delays last.
          Carrier D, weak everywhere, reports delays only through a portal.
          {carriers.some((c) => c.preferred_supplier) && (
            <Fragment>
              {' '}
              Carrier {carriers.find((c) => c.preferred_supplier)!.carrier_id} holds the preferred-supplier agreement despite being weak in{' '}
              {carriers.find((c) => c.preferred_supplier)!.weak_regions.length} regions; it can keep the regions where it performs well.
            </Fragment>
          )}
        </p>
      </section>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-3.5 w-5 rounded-sm ${swatch}`} aria-hidden="true" />
      {label}
    </span>
  );
}
