import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Check, X } from 'lucide-react';
import { api } from '../api/client';
import type { CauseKey, CauseRow, DataSource, RoiResponse, VendorAssessment } from '../api/types';
import { useApi } from '../lib/useApi';
import { CAUSE_META, CAUSE_ORDER } from '../lib/causes';
import { pct, usd } from '../lib/format';
import PageHeader, { SectionTitle } from '../components/PageHeader';
import { ErrorState, LoadingBlock, SourceTag } from '../components/States';
import { WrapTick } from '../components/Waterfall';

export default function Vendor() {
  const v = useApi(() => api.vendor());
  const roi = useApi(() => api.roi());
  const causes = useApi(() => api.causes());

  return (
    <>
      <PageHeader
        title="The routing vendor fixes the wrong problem"
        lede="A $680K routing contract reaches only the two causes that happen on the road, and only one of them needs software. Most late deliveries start earlier: at order intake, the pick-list cutoff and stock placement."
        aside={<SourceTag source={v.source} />}
      />
      {v.loading && !v.data ? (
        <LoadingBlock rows={6} />
      ) : v.error || !v.data ? (
        <ErrorState message={v.error ?? 'No data returned.'} onRetry={v.reload} />
      ) : (
        <div className="flex flex-col gap-6">
          <VendorBody data={v.data} causes={causes.data?.causes ?? []} effectivenessNeeded={roi.data?.effectiveness_needed_for_94_benchmark} />
          {roi.loading && !roi.data ? (
            <LoadingBlock label="Loading the business case" rows={5} />
          ) : roi.error || !roi.data ? (
            <ErrorState message={roi.error ?? 'No business case returned.'} onRetry={roi.reload} />
          ) : (
            <BusinessCase roi={roi.data} source={roi.source} />
          )}
          <Recommendation data={v.data} />
        </div>
      )}
    </>
  );
}

/** Plain names for the four options, with one line on what each means. */
const OPTIONS = {
  vendor: { name: 'Buy the routing software only', means: 'The $680K software, nothing else. Even this assumes it fully fixes weak carriers and drivers going off route.' },
  process: { name: 'Fix our own work only', means: 'No software. We fix the order address check, the 08:00 cut-off and stock placement ourselves.' },
  realistic: { name: 'Fix all 5 problems (likely)', means: 'Our plan. Each fix works partly, as fixes do in real life.' },
  ceiling: { name: 'Fix all 5 problems perfectly', means: 'Not realistic: every problem gone for good. Shown only as the upper limit.' },
} as const;

function optionOf(scenarioName: string): keyof typeof OPTIONS | null {
  if (/vendor/i.test(scenarioName)) return 'vendor';
  if (/process/i.test(scenarioName)) return 'process';
  if (/realistic/i.test(scenarioName)) return 'realistic';
  if (/ceiling/i.test(scenarioName)) return 'ceiling';
  return null;
}

function VendorBody({ data, causes, effectivenessNeeded }: { data: VendorAssessment; causes: CauseRow[]; effectivenessNeeded?: number }) {
  const bars = [
    { key: 'today', label: 'Today', value: data.today, fill: '#A84F0B' },
    { key: 'vendor', label: OPTIONS.vendor.name, value: data.routing_only, fill: '#5E6B75' },
    { key: 'process', label: OPTIONS.process.name, value: data.process_only, fill: '#0E6B63' },
    { key: 'realistic', label: OPTIONS.realistic.name, value: data.realistic, fill: '#0A524C' },
    { key: 'ceiling', label: OPTIONS.ceiling.name, value: data.all_fixed, fill: '#B9D9D3' },
  ].map((b) => ({ ...b, pctValue: Math.round(b.value * 1000) / 10 }));
  const label1 = (x: number) => `${x.toFixed(1)}%`;

  const points = (c: CauseKey) => causes.find((x) => x.cause === c)?.fair_share_points;
  const carrierCost = causes.find((x) => x.cause === 'weak_carrier_lane')?.fix_cost_per_year_usd;
  const ratio = data.at_risk_revenue_usd / data.vendor_cost_usd;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="panel panel-pad" aria-labelledby="scen-title">
        <SectionTitle note="Projected on-time delivery">
          <span id="scen-title">The vendor alone stays far below the benchmark</span>
        </SectionTitle>
        <div
          className="h-[400px]"
          role="img"
          aria-label={bars.map((b) => `${b.label}: ${label1(b.pctValue)}`).join('; ') + `; benchmark ${Math.round(data.benchmark * 100)}%`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} margin={{ top: 28, right: 12, bottom: 24, left: -12 }} barCategoryGap="24%">
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
                  <Cell key={b.key} fill={b.fill} stroke={b.key === 'ceiling' ? '#0E6B63' : undefined} strokeDasharray={b.key === 'ceiling' ? '4 3' : undefined} />
                ))}
                <LabelList dataKey="pctValue" position="top" formatter={label1} style={{ fontWeight: 700, fontSize: 15, fill: '#15212B' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          “Perfectly” is an upper limit, not a forecast. The software bar is also generous: it assumes the software fully fixes both road problems.
        </p>
        {effectivenessNeeded != null && (
          <p className="mt-4 rounded-md border-l-[3px] border-ink bg-paper px-4 py-3 text-[15px] text-ink" data-testid="effectiveness-needed">
            <strong>Each fix must work ~{Math.round(effectivenessNeeded * 100)}% of the time to reach {pct(data.benchmark, 0)}.</strong>{' '}
            <span className="text-ink-soft">That is the bar for the pilot: if all five fixes together cannot get close, no single vendor will.</span>
          </p>
        )}
      </section>

      <section className="panel panel-pad flex flex-col" aria-labelledby="adds-title">
        <SectionTitle>
          <span id="adds-title">What the vendor actually adds</span>
        </SectionTitle>
        <ul className="flex flex-col gap-4 text-[15px] leading-relaxed">
          <li className="flex gap-3">
            <Check className="mt-1 h-4 w-4 shrink-0 text-route" aria-label="Needs the vendor" />
            <span>
              <strong>Route deviation{points('route_deviation') != null && `, about ${points('route_deviation')!.toFixed(1)} points`}.</strong> This is the
              vendor&apos;s own unique contribution: catching drivers who go far beyond the planned route.
            </span>
          </li>
          <li className="flex gap-3">
            <X className="mt-1 h-4 w-4 shrink-0 text-late" aria-label="Does not need the vendor" />
            <span>
              <strong>Weak carrier lanes{points('weak_carrier_lane') != null && `, ${points('weak_carrier_lane')!.toFixed(1)} points`}.</strong> Carrier switching
              needs no software: stop sending Carrier D anywhere, E to the West and F to the Northeast and Southeast.
              {carrierCost != null && ` Higher carrier rates cost about ${usd(carrierCost)} a year (estimate).`}
            </span>
          </li>
        </ul>
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
        <div className="mt-6 flex flex-col gap-5 border-t border-line pt-5">
          <MoneyBar label="Routing vendor contract" value={data.vendor_cost_usd} max={data.at_risk_revenue_usd} tone="slate" />
          <MoneyBar label="Annual revenue from 9 at-risk clients" value={data.at_risk_revenue_usd} max={data.at_risk_revenue_usd} tone="late" />
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          The revenue at risk is about <strong className="num text-ink">{Math.round(ratio)}×</strong> the vendor contract.
        </p>
      </section>
    </div>
  );
}

/** Signed money: a minus sign for losses, never "$-160K". */
function money(value: number): string {
  return value < 0 ? `−${usd(-value)}` : usd(value);
}

function BusinessCase({ roi, source }: { roi: RoiResponse; source: DataSource | null }) {
  // Only the three options someone can actually choose; "perfectly" is a limit, not a plan.
  const rows = roi.scenarios.filter((s) => optionOf(s.name) !== 'ceiling');
  const vendor = rows.find((s) => optionOf(s.name) === 'vendor');
  const own = rows.find((s) => optionOf(s.name) === 'process');

  return (
    <section className="panel overflow-hidden" aria-labelledby="roi-title">
      <div className="panel-pad pb-0 sm:pb-0">
        <SectionTitle note={<SourceTag source={source} />}>
          <span id="roi-title">Business case, per year</span>
        </SectionTitle>
        <p className="-mt-2 mb-4 max-w-[80ch] text-[15px] text-ink-soft">Penalties saved minus what it costs. Costs are our estimates.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-[15px]" aria-labelledby="roi-title">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="th pl-5 sm:pl-6">Option</th>
              <th scope="col" className="th text-right">On time</th>
              <th scope="col" className="th text-right">Penalties saved</th>
              <th scope="col" className="th text-right">Cost</th>
              <th scope="col" className="th pr-5 text-right sm:pr-6">Gain</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const opt = optionOf(s.name);
              const plan = opt === 'realistic';
              const gain = s.net_benefit_penalties_only_usd;
              return (
                <tr key={s.name} className={`border-b border-line last:border-b-0 ${plan ? 'bg-route-tint' : ''}`}>
                  <th scope="row" className="td pl-5 text-left font-semibold sm:pl-6">
                    {opt ? OPTIONS[opt].name : s.name}
                    {plan && <div className="text-sm font-normal text-route-dark">Our plan</div>}
                  </th>
                  <td className="td num text-right font-semibold">{pct(s.on_time_rate)}</td>
                  <td className="td num text-right">{usd(s.sla_penalties_avoided_usd)}</td>
                  <td className="td num text-right">{usd(s.cost_per_year_usd)}</td>
                  <td className={`td num pr-5 text-right text-[17px] font-bold sm:pr-6 ${gain < 0 ? 'text-late' : 'text-route-dark'}`}>{money(gain)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {vendor && own && (
        <p className="panel-pad border-t border-line text-[15px] text-ink" data-testid="roi-summary">
          The software alone <strong className={vendor.net_benefit_penalties_only_usd < 0 ? 'text-late' : ''}>
            {vendor.net_benefit_penalties_only_usd < 0 ? 'loses' : 'gains'} {usd(Math.abs(vendor.net_benefit_penalties_only_usd))}
          </strong>{' '}
          a year. Fixing our own work <strong className="text-route-dark">gains {usd(own.net_benefit_penalties_only_usd)}</strong> and costs about{' '}
          {Math.round(vendor.cost_per_year_usd / own.cost_per_year_usd)}× less.
        </p>
      )}
    </section>
  );
}

function Recommendation({ data }: { data: VendorAssessment }) {
  return (
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
