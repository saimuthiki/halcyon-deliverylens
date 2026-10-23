import { Link } from 'react-router-dom';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client';
import { useApi } from '../lib/useApi';
import PageHeader, { SectionTitle } from '../components/PageHeader';
import DeliveryTrack from '../components/DeliveryTrack';
import KpiStrip from '../components/KpiStrip';
import { ErrorState, LoadingBlock, SourceTag } from '../components/States';
import { dateLabel, monthLabel, num, pct, pts, usd } from '../lib/format';
import { causeShort } from '../lib/causes';

export default function Overview() {
  const kpis = useApi(() => api.kpis());
  const causes = useApi(() => api.causes());

  const k = kpis.data;
  const sc = causes.data?.scenarios;
  const benchmark = k?.benchmark_on_time_rate ?? 0.94;
  const lost = sc ? (1 - sc.today) * 100 : 0;
  const explained = causes.data ? causes.data.causes.reduce((sum, c) => sum + c.fair_share_points, 0) : 0;
  const realisticMix = causes.data?.causes
    .filter((c) => c.realistic_effectiveness != null)
    .sort((a, b) => b.fair_share_points - a.fair_share_points)
    .map((c) => `${causeShort(c.cause).toLowerCase()} ${Math.round((c.realistic_effectiveness ?? 0) * 100)}%`);

  return (
    <>
      <PageHeader
        title={k ? `On-time delivery is ${pct(k.on_time_rate, 0)}. The benchmark is ${pct(benchmark, 0)}.` : 'On-time delivery'}
        lede={
          sc && k ? (
            <>
              Five fixable causes account for {explained.toFixed(1)} of the {lost.toFixed(1)} points lost. With each fix working as well as we
              realistically expect, Halcyon reaches <strong className="text-ink">{pct(sc.realistic)}</strong>. The {usd(k.routing_vendor_budget_usd)} routing
              vendor on its own reaches <strong className="text-ink">{pct(sc.routing_only)}</strong> at best. {pct(sc.all_fixed)} is the ceiling if every cause
              were fully removed, not a forecast.
            </>
          ) : undefined
        }
        aside={<SourceTag source={kpis.source} />}
      />

      {kpis.loading && !k ? (
        <LoadingBlock label="Loading headline figures" rows={4} />
      ) : kpis.error ? (
        <ErrorState message={kpis.error} onRetry={kpis.reload} />
      ) : (
        k && (
          <div className="flex flex-col gap-6">
            <section className="panel panel-pad" aria-labelledby="track-title">
              <SectionTitle note={`${num(k.deliveries)} deliveries, ${dateLabel(k.period[0])} to ${dateLabel(k.period[1])}, ${k.period[1].slice(0, 4)}`}>
                <span id="track-title">Where each option gets on-time delivery</span>
              </SectionTitle>
              {sc ? (
                <div className="pt-2">
                  <DeliveryTrack
                    today={sc.today}
                    routingOnly={sc.routing_only}
                    processOnly={sc.process_only}
                    realistic={sc.realistic}
                    ceiling={sc.all_fixed}
                    benchmark={benchmark}
                  />
                  {realisticMix && realisticMix.length > 0 && (
                    <p className="mt-4 max-w-[80ch] text-sm text-ink-soft">
                      Realistic means each fix removes only part of its cause: {realisticMix.join(', ')}.{' '}
                      <Link to="/what-if" className="font-semibold text-route underline-offset-4 hover:underline">
                        Change these in the what-if simulator
                      </Link>
                    </p>
                  )}
                </div>
              ) : causes.error ? (
                <ErrorState message={causes.error} onRetry={causes.reload} />
              ) : (
                <div className="h-[150px] animate-pulse rounded bg-slate-light" />
              )}
            </section>

            <KpiStrip
              items={[
                { label: 'Late deliveries', value: num(k.late_deliveries), note: `${pct(1 - k.on_time_rate, 0)} of all deliveries in 6 months`, tone: 'late' },
                { label: 'SLA penalties paid', value: usd(k.sla_penalties_usd), note: 'Last 6 months' },
                { label: 'Redelivery cost', value: usd(k.redelivery_cost_usd), note: 'Last 6 months' },
                { label: 'Annual revenue at risk', value: usd(k.at_risk_revenue_usd), note: `${k.at_risk_clients} clients threatening to leave`, tone: 'late' },
              ]}
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <section className="panel panel-pad" aria-labelledby="trend-title">
                <SectionTitle note="Stuck near 71% every month">
                  <span id="trend-title">Monthly on-time delivery</span>
                </SectionTitle>
                <TrendChart data={k.monthly} benchmark={benchmark} />
              </section>

              <section className="panel panel-pad" aria-labelledby="points-title">
                <SectionTitle>
                  <span id="points-title">Points each cause costs today</span>
                </SectionTitle>
                {causes.data ? (
                  <ul className="flex flex-col gap-3.5">
                    {[...causes.data.causes]
                      .sort((a, b) => b.fair_share_points - a.fair_share_points)
                      .map((c) => {
                        const max = Math.max(...causes.data!.causes.map((x) => x.fair_share_points));
                        return (
                          <li key={c.cause}>
                            <div className="flex items-baseline justify-between gap-3 text-[15px]">
                              <span>{causeShort(c.cause)}</span>
                              <span className="num font-semibold text-route-dark">{pts(c.fair_share_points)}</span>
                            </div>
                            <div className="mt-1.5 h-2 rounded-full bg-slate-light">
                              <div className="h-2 rounded-full bg-route" style={{ width: `${(c.fair_share_points / max) * 100}%` }} />
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                ) : causes.error ? (
                  <ErrorState message={causes.error} onRetry={causes.reload} />
                ) : (
                  <LoadingBlock rows={5} />
                )}
                <Link to="/why-late" className="btn-secondary mt-5 w-full">
                  See why deliveries are late
                </Link>
              </section>
            </div>
          </div>
        )
      )}
    </>
  );
}

function TrendChart({ data, benchmark }: { data: { month: string; on_time_rate: number; late: number }[]; benchmark: number }) {
  const rows = data.map((d) => ({ month: monthLabel(d.month), rate: Math.round(d.on_time_rate * 1000) / 10, late: d.late }));
  return (
    <div className="h-[260px]" role="img" aria-label={`Monthly on-time rate: ${rows.map((r) => `${r.month} ${r.rate}%`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 24, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="#E7ECEA" />
          <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: '#D9DFDD' }} tick={{ fill: '#5E6B75', fontSize: 14 }} />
          <YAxis domain={[60, 100]} ticks={[60, 70, 80, 90, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} tick={{ fill: '#5E6B75', fontSize: 14 }} />
          <Tooltip
            formatter={(v: number, name: string) => (name === 'rate' ? [`${v}%`, 'On time'] : [v, name])}
            contentStyle={{ borderRadius: 8, borderColor: '#D9DFDD', fontFamily: 'Barlow' }}
          />
          <ReferenceLine
            y={benchmark * 100}
            stroke="#15212B"
            strokeDasharray="5 4"
            label={{ value: `Benchmark ${Math.round(benchmark * 100)}%`, position: 'insideTopRight', fill: '#15212B', fontSize: 13, dy: -18 }}
          />
          <Area type="monotone" dataKey="rate" tooltipType="none" stroke="none" fill="#A84F0B" fillOpacity={0.08} baseValue={60} isAnimationActive={false} />
          <Line type="monotone" dataKey="rate" stroke="#A84F0B" strokeWidth={2.5} dot={{ r: 4, fill: '#A84F0B', strokeWidth: 0 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
