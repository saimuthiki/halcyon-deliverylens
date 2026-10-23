import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Check, X } from 'lucide-react';
import { api } from '../api/client';
import type { VendorAssessment } from '../api/types';
import { useApi } from '../lib/useApi';
import { CAUSE_META, CAUSE_ORDER } from '../lib/causes';
import { pct, usd } from '../lib/format';
import PageHeader, { SectionTitle } from '../components/PageHeader';
import { ErrorState, LoadingBlock, SourceTag } from '../components/States';
import { WrapTick } from '../components/Waterfall';

export default function Vendor() {
  const v = useApi(() => api.vendor());

  return (
    <>
      <PageHeader
        title="The routing vendor fixes the wrong problem"
        lede="A $680K routing contract only reaches the two causes that happen on the road. Most late deliveries start earlier, at order intake, the pick-list cutoff and stock placement."
        aside={<SourceTag source={v.source} />}
      />
      {v.loading && !v.data ? (
        <LoadingBlock rows={6} />
      ) : v.error || !v.data ? (
        <ErrorState message={v.error ?? 'No data returned.'} onRetry={v.reload} />
      ) : (
        <VendorBody data={v.data} />
      )}
    </>
  );
}

function VendorBody({ data }: { data: VendorAssessment }) {
  const bars = [
    { key: 'today', label: 'Today', value: data.today, fill: '#A84F0B' },
    { key: 'vendor', label: 'Routing vendor only', value: data.routing_only, fill: '#5E6B75' },
    { key: 'process', label: 'Our process fixes', value: data.process_only, fill: '#0E6B63' },
    { key: 'all', label: 'All five fixes', value: data.all_fixed, fill: '#0A524C' },
  ].map((b) => ({ ...b, pctValue: Math.round(b.value * 1000) / 10 }));

  const ratio = data.at_risk_revenue_usd / data.vendor_cost_usd;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="panel panel-pad" aria-labelledby="scen-title">
          <SectionTitle note="Projected on-time delivery">
            <span id="scen-title">Only fixing all five causes clears the benchmark</span>
          </SectionTitle>
          <div className="h-[440px]" role="img" aria-label={bars.map((b) => `${b.label}: ${b.pctValue}%`).join('; ') + `; benchmark ${Math.round(data.benchmark * 100)}%`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars} margin={{ top: 28, right: 12, bottom: 24, left: -12 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="#E7ECEA" />
                <XAxis dataKey="label" interval={0} tickLine={false} axisLine={{ stroke: '#D9DFDD' }} tick={<WrapTick />} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(x: number) => `${x}%`} tickLine={false} axisLine={false} tick={{ fill: '#5E6B75', fontSize: 14 }} />
                <ReferenceLine
                  y={data.benchmark * 100}
                  stroke="#15212B"
                  strokeDasharray="5 4"
                  label={{ value: `Benchmark ${Math.round(data.benchmark * 100)}%`, position: 'insideTopLeft', fill: '#15212B', fontSize: 13, dy: -18 }}
                />
                <Bar dataKey="pctValue" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {bars.map((b) => (
                    <Cell key={b.key} fill={b.fill} />
                  ))}
                  <LabelList dataKey="pctValue" position="top" formatter={(x: number) => `${x}%`} style={{ fontWeight: 700, fontSize: 15, fill: '#15212B' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel panel-pad flex flex-col" aria-labelledby="money-title">
          <SectionTitle>
            <span id="money-title">What is at stake</span>
          </SectionTitle>
          <div className="flex flex-col gap-5">
            <MoneyBar label="Routing vendor contract" value={data.vendor_cost_usd} max={data.at_risk_revenue_usd} tone="slate" />
            <MoneyBar label="Annual revenue from 9 at-risk clients" value={data.at_risk_revenue_usd} max={data.at_risk_revenue_usd} tone="late" />
          </div>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">
            The revenue at risk is about <strong className="num text-ink">{Math.round(ratio)}×</strong> the vendor contract. Spending {usd(data.vendor_cost_usd)} on a fix that
            reaches {pct(data.routing_only)} leaves those clients below the service they were promised.
          </p>
          <h3 className="mb-2 mt-6 text-[15px] font-semibold">Which causes the vendor reaches</h3>
          <ul className="flex flex-col gap-1.5 text-[15px]">
            {CAUSE_ORDER.map((c) => {
              const hit = data.causes_vendor_addresses.includes(c);
              return (
                <li key={c} className="flex items-center gap-2">
                  {hit ? <Check className="h-4 w-4 text-route" aria-label="Addressed" /> : <X className="h-4 w-4 text-late" aria-label="Not addressed" />}
                  <span className={hit ? 'text-ink' : 'text-ink-soft'}>{CAUSE_META[c].short}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="panel overflow-hidden border-route/40" aria-labelledby="rec-title">
        <div className="border-l-[5px] border-route p-5 sm:p-7">
          <h2 id="rec-title" className="text-[22px] font-bold leading-snug tracking-tight">
            Our recommendation
          </h2>
          <p className="mt-2 max-w-[72ch] text-[17px] leading-relaxed text-ink">{data.recommendation}</p>
          <ul className="mt-5 grid gap-x-8 gap-y-3 md:grid-cols-2">
            {data.reasons.map((r) => (
              <li key={r} className="flex gap-3 text-[15px] leading-relaxed text-ink-soft">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-route" aria-hidden="true" />
                {r}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/what-if" className="btn-primary">
              Try the what-if simulator
            </Link>
            <Link to="/clients" className="btn-secondary">
              See the at-risk clients
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function MoneyBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: 'slate' | 'late' }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] text-ink-soft">{label}</span>
        <span className={`num text-[26px] font-bold tracking-tight ${tone === 'late' ? 'text-late' : 'text-ink'}`}>{usd(value)}</span>
      </div>
      <div className="mt-1.5 h-3 rounded-sm bg-slate-light">
        <div className={`h-3 rounded-sm ${tone === 'late' ? 'bg-late' : 'bg-slate'}`} style={{ width: `${Math.max(1.5, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}
