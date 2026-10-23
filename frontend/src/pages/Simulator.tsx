import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { CauseKey, CauseRow, FixLevels, SimulateResponse } from '../api/types';
import { useApi } from '../lib/useApi';
import { simulateExact } from '../lib/calc';
import { comboModel, REALISTIC_FIXES } from '../api/mockData';
import { BENCHMARK, CAUSE_META, CAUSE_ORDER } from '../lib/causes';
import { num, pct, pts, usd } from '../lib/format';
import PageHeader, { SectionTitle } from '../components/PageHeader';
import Gauge from '../components/Gauge';
import { ErrorState, LoadingBlock, SourceTag } from '../components/States';

function presets(realistic: FixLevels): { label: string; fixes: FixLevels }[] {
  return [
    { label: 'Realistic plan', fixes: realistic },
    { label: 'Routing vendor only', fixes: { weak_carrier_lane: 1, route_deviation: 1 } },
    { label: 'Process fixes only', fixes: { incomplete_address: 1, same_day_after_cutoff: 1, stock_not_at_nearest: 1 } },
    { label: 'Ceiling: all fully fixed', fixes: { incomplete_address: 1, same_day_after_cutoff: 1, stock_not_at_nearest: 1, weak_carrier_lane: 1, route_deviation: 1 } },
    { label: 'Reset', fixes: {} },
  ];
}

/** Realistic effectiveness per cause: from the API when it sends it, otherwise from the saved analysis. */
function realisticFrom(causes: CauseRow[] | undefined): FixLevels {
  const fromApi = Object.fromEntries((causes ?? []).filter((c) => c.realistic_effectiveness != null).map((c) => [c.cause, c.realistic_effectiveness]));
  return Object.keys(fromApi).length ? (fromApi as FixLevels) : REALISTIC_FIXES;
}

export default function Simulator() {
  const causes = useApi(() => api.causes());
  const kpis = useApi(() => api.kpis());
  const [fixes, setFixes] = useState<FixLevels>(REALISTIC_FIXES);
  const [remote, setRemote] = useState<{ key: string; result: SimulateResponse } | null>(null);
  const fixKey = JSON.stringify(fixes);

  // Same model as the API, computed in the browser from the saved cause combinations: instant while dragging, and offline.
  const local = useMemo(() => simulateExact(fixes, comboModel), [fixes]);
  const realistic = useMemo(() => realisticFrom(causes.data?.causes), [causes.data]);

  // Ask the API for the exact projection once the sliders settle; show the local estimate meanwhile.
  useEffect(() => {
    if (!causes.data) return;
    const key = fixKey;
    const t = setTimeout(async () => {
      try {
        const r = await api.simulate(JSON.parse(key) as FixLevels);
        if (r.source === 'live') setRemote({ key, result: r.data });
      } catch {
        /* keep local estimate */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [fixKey, causes.data]);

  const result = remote && remote.key === fixKey ? remote.result : local;
  const exact = remote != null && remote.key === fixKey;

  if ((causes.loading && !causes.data) || (kpis.loading && !kpis.data)) return <LoadingBlock rows={6} />;
  if (causes.error || !causes.data) return <ErrorState message={causes.error ?? 'No data.'} onRetry={causes.reload} />;
  if (kpis.error || !kpis.data) return <ErrorState message={kpis.error ?? 'No data.'} onRetry={kpis.reload} />;

  const byKey = Object.fromEntries(causes.data.causes.map((c) => [c.cause, c])) as Record<CauseKey, CauseRow>;

  return (
    <>
      <PageHeader
        title="What if we fix part of the problem?"
        lede="No fix is perfect. The sliders start at the realistic plan. Set how well each fix works, from not at all to fully, and see where on-time delivery and penalties land."
        aside={<SourceTag source={exact ? 'live' : causes.source} />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="panel panel-pad" aria-labelledby="levers-title">
          <SectionTitle>
            <span id="levers-title">How well each fix works</span>
          </SectionTitle>
          <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Presets">
            {presets(realistic).map((p) => (
              <button key={p.label} type="button" className="btn-secondary min-h-[36px] px-3 text-sm" onClick={() => setFixes(p.fixes)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col divide-y divide-line">
            {CAUSE_ORDER.filter((c) => byKey[c]).map((c) => {
              const v = Math.round((fixes[c] ?? 0) * 100);
              const id = `slider-${c}`;
              return (
                <div key={c} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <label htmlFor={id} className="font-semibold">
                      {CAUSE_META[c].short}
                    </label>
                    <span className="num text-[15px] text-ink-soft">
                      <span className="font-semibold text-ink">{v}%</span> effective
                    </span>
                  </div>
                  <p className="mb-2 text-sm text-slate">
                    Up to {pts(byKey[c].fair_share_points)}. {CAUSE_META[c].owner === 'routing' ? 'Routing and carriers.' : 'Our process.'}
                    {realistic[c] != null && ` Realistic: ${Math.round((realistic[c] ?? 0) * 100)}%.`}
                  </p>
                  <input
                    id={id}
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={v}
                    onChange={(e) => setFixes((f) => ({ ...f, [c]: Number(e.target.value) / 100 }))}
                    className="h-2 w-full cursor-pointer accent-route"
                    aria-valuetext={`${v}% effective`}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {result && <SimulatorResults result={result} causes={causes.data.causes} exact={exact} />}
      </div>
    </>
  );
}

export function SimulatorResults({ result, causes, exact }: { result: SimulateResponse; causes: CauseRow[]; exact: boolean }) {
  const gained = (result.projected_on_time_rate - result.today_on_time_rate) * 100;
  const gap = (BENCHMARK - result.projected_on_time_rate) * 100;
  return (
    <section className="panel panel-pad flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start" aria-labelledby="result-title" aria-live="polite">
      <SectionTitle note={exact ? 'Calculated by the API' : 'Calculated in the browser, same model as the API'}>
        <span id="result-title">Projected result</span>
      </SectionTitle>
      <Gauge value={result.projected_on_time_rate} baseline={result.today_on_time_rate} benchmark={BENCHMARK} />
      <p className={`rounded-md px-4 py-3 text-[15px] ${result.meets_benchmark ? 'bg-route-tint text-route-dark' : 'bg-paper text-ink'}`} data-testid="verdict">
        {result.meets_benchmark
          ? `Meets the ${pct(BENCHMARK, 0)} benchmark.`
          : `${gap.toFixed(1)} points short of the ${pct(BENCHMARK, 0)} benchmark.`}
      </p>
      <dl className="grid grid-cols-3 gap-4 border-y border-line py-4">
        <div>
          <dt className="text-sm text-ink-soft">Points gained</dt>
          <dd className="num text-[22px] font-bold text-route-dark" data-testid="points-gained">
            {pts(gained)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">Late deliveries avoided</dt>
          <dd className="num text-[22px] font-bold">{num(result.late_deliveries_avoided)}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">SLA penalties avoided a year</dt>
          <dd className="num text-[22px] font-bold" data-testid="penalties">
            {usd(result.penalties_avoided_usd)}
          </dd>
        </div>
      </dl>
      <p className="-mt-3 text-sm text-slate">
        Late deliveries over the 6 months of data; penalties per year.
        {result.redelivery_avoided_usd != null && ` Redelivery cost avoided: ${usd(result.redelivery_avoided_usd)} a year.`}
        {result.at_risk_projected_on_time_rate != null && ` At-risk clients would reach ${pct(result.at_risk_projected_on_time_rate)} on time.`}
      </p>
      <div>
        <h3 className="mb-3 text-[15px] font-semibold">Points by cause</h3>
        <ul className="flex flex-col gap-2.5">
          {CAUSE_ORDER.map((c) => {
            const row = causes.find((x) => x.cause === c);
            if (!row) return null;
            const got = result.points_by_cause[c] ?? 0;
            return (
              <li key={c} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-[15px]">
                <span className="truncate">{CAUSE_META[c].short}</span>
                <span className="num font-semibold">
                  {pts(got)} <span className="font-normal text-slate">of {row.fair_share_points.toFixed(1)}</span>
                </span>
                <div className="col-span-2 h-2 rounded-full bg-slate-light">
                  <div className="h-2 rounded-full bg-route transition-[width] duration-200" style={{ width: `${(got / row.fair_share_points) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
