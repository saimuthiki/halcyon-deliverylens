import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { RouteDeviation, StockPlacement } from '../api/types';
import { useApi } from '../lib/useApi';
import { num, pct } from '../lib/format';
import PageHeader, { SectionTitle } from '../components/PageHeader';
import { ErrorState, LoadingBlock, SourceTag } from '../components/States';

/**
 * Stock & routes: the two "fix" views the solution design promised (stock placement, route deviation watch).
 * Each comparison is drawn as a dumbbell: on time when the problem happened vs when it did not.
 */
export default function StockRoutes() {
  const stock = useApi(() => api.stockPlacement());
  const routes = useApi(() => api.routeDeviation());

  const s = stock.data;
  const r = routes.data;
  const avgStockOut = s ? weighted(s.by_warehouse, (w) => w.stock_out_rate) : null;
  const avgDeviation = r ? weighted(r.by_carrier, (c) => c.deviation_rate) : null;

  return (
    <>
      <PageHeader
        title="Stock-outs and long routes happen everywhere, so fix the rules, not one site"
        lede={
          avgStockOut != null && avgDeviation != null
            ? `About ${pct(avgStockOut, 0)} of deliveries ship from further away because the nearest warehouse had no stock, and about ${pct(avgDeviation, 0)} of drivers go more than 20% beyond the planned route. Both are spread evenly across warehouses, carriers and regions, and both cut on-time delivery sharply wherever they happen.`
            : 'Where the nearest warehouse runs out of stock, and where drivers go more than 20% beyond the planned route.'
        }
        aside={<SourceTag source={stock.source === 'sample' || routes.source === 'sample' ? 'sample' : stock.source} />}
      />

      <div className="flex flex-col gap-6">
        {stock.loading && !s ? (
          <LoadingBlock label="Loading stock placement" rows={6} />
        ) : stock.error || !s ? (
          <ErrorState message={stock.error ?? 'No stock data returned.'} onRetry={stock.reload} />
        ) : (
          <StockSection data={s} />
        )}

        {routes.loading && !r ? (
          <LoadingBlock label="Loading route deviation" rows={6} />
        ) : routes.error || !r ? (
          <ErrorState message={routes.error ?? 'No route data returned.'} onRetry={routes.reload} />
        ) : (
          <RouteSection data={r} />
        )}
      </div>
    </>
  );
}

function weighted<T extends { deliveries: number }>(rows: T[], value: (r: T) => number): number | null {
  const n = rows.reduce((t, r) => t + r.deliveries, 0);
  return n ? rows.reduce((t, r) => t + r.deliveries * value(r), 0) / n : null;
}

/* ---------- dumbbell: on time with the problem (late colour) vs without (route colour) ---------- */

const DOMAIN: [number, number] = [0.3, 0.9];

function Dumbbell({ bad, good }: { bad: number; good: number }) {
  if (!Number.isFinite(bad) || !Number.isFinite(good)) return <span className="text-slate">–</span>;
  const x = (v: number) => `${(((Math.min(DOMAIN[1], Math.max(DOMAIN[0], v)) - DOMAIN[0]) / (DOMAIN[1] - DOMAIN[0])) * 100).toFixed(1)}%`;
  const lo = Math.min(bad, good);
  const hi = Math.max(bad, good);
  return (
    <div className="relative h-5 min-w-[160px]" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
      <div className="absolute top-1/2 h-[3px] -translate-y-1/2 bg-slate/40" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
      <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-late" style={{ left: x(bad) }} />
      <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-route bg-surface" style={{ left: x(good) }} />
    </div>
  );
}

function DumbbellScale() {
  const ticks = [0.3, 0.5, 0.7, 0.9];
  return (
    <div className="relative h-4 min-w-[160px] text-2xs text-slate" aria-hidden="true">
      {ticks.map((t) => (
        <span
          key={t}
          className={`num absolute ${t === DOMAIN[0] ? '' : t === DOMAIN[1] ? '-translate-x-full' : '-translate-x-1/2'}`}
          style={{ left: `${((t - DOMAIN[0]) / (DOMAIN[1] - DOMAIN[0])) * 100}%` }}
        >
          {Math.round(t * 100)}%
        </span>
      ))}
    </div>
  );
}

function Key({ bad, good }: { bad: string; good: string }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-late" aria-hidden="true" />
        {bad}
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-full border-[3px] border-route bg-surface" aria-hidden="true" />
        {good}
      </span>
    </div>
  );
}

function RateBar({ value, max }: { value: number; max: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="num w-[52px] text-right font-semibold">{pct(value)}</span>
      <span className="hidden h-2 w-[72px] rounded-full bg-slate-light sm:block" aria-hidden="true">
        <span className="block h-2 rounded-full bg-late/80" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </span>
    </div>
  );
}

function Gap({ bad, good }: { bad: number; good: number }) {
  if (!Number.isFinite(bad) || !Number.isFinite(good)) return <>–</>;
  return <span className="num font-semibold text-late">−{((good - bad) * 100).toFixed(0)} pts</span>;
}

/* ---------- stock ---------- */

function StockSection({ data }: { data: StockPlacement }) {
  const maxRate = Math.max(0.01, ...data.by_warehouse.map((w) => w.stock_out_rate), ...data.worst_clients.map((c) => c.stock_out_rate));
  return (
    <div className="flex flex-col gap-6">
      <section className="panel overflow-hidden" aria-labelledby="wh-title">
        <div className="panel-pad pb-0 sm:pb-0">
          <SectionTitle note="By the warehouse nearest the client">
            <span id="wh-title">Stock-outs by warehouse</span>
          </SectionTitle>
          <Key bad="On time when the nearest warehouse had no stock" good="On time when it had stock" />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[15px]" aria-labelledby="wh-title">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="th pl-5 sm:pl-6">Warehouse</th>
                <th scope="col" className="th text-right">Deliveries</th>
                <th scope="col" className="th text-right">Stock-out rate</th>
                <th scope="col" className="th text-right">On time, stock-out</th>
                <th scope="col" className="th text-right">On time, stocked</th>
                <th scope="col" className="th text-right">Gap</th>
                <th scope="col" className="th pr-5 sm:pr-6">
                  <span className="sr-only">Comparison</span>
                  <DumbbellScale />
                </th>
              </tr>
            </thead>
            <tbody>
              {data.by_warehouse.map((w) => (
                <tr key={w.warehouse_id} className="border-b border-line last:border-b-0">
                  <th scope="row" className="td pl-5 text-left sm:pl-6">
                    <span className="font-semibold">{w.name}</span>
                    <span className="block whitespace-nowrap text-sm font-normal text-slate">
                      {w.warehouse_id}, {w.region}
                    </span>
                  </th>
                  <td className="td num text-right">{num(w.deliveries)}</td>
                  <td className="td text-right">
                    <RateBar value={w.stock_out_rate} max={maxRate} />
                  </td>
                  <td className="td num text-right font-semibold text-late">{pct(w.on_time_when_stock_out, 0)}</td>
                  <td className="td num text-right">{pct(w.on_time_when_stocked, 0)}</td>
                  <td className="td text-right">
                    <Gap bad={w.on_time_when_stock_out} good={w.on_time_when_stocked} />
                  </td>
                  <td className="td pr-5 sm:pr-6">
                    <Dumbbell bad={w.on_time_when_stock_out} good={w.on_time_when_stocked} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panel-pad pt-3 text-sm text-ink-soft sm:pt-3">
          No single warehouse stands out, so the fix is a rule for all of them: rebalance fast-moving stock to the warehouse nearest each region before it runs
          out. See the cause on{' '}
          <Link to="/why-late?cause=stock_not_at_nearest" className="font-semibold text-route underline-offset-4 hover:underline">
            Why deliveries are late
          </Link>
          .
        </p>
      </section>

      <section className="panel overflow-hidden" aria-labelledby="sc-title">
        <div className="panel-pad pb-0 sm:pb-0">
          <SectionTitle note="Highest stock-out rate first">
            <span id="sc-title">Clients hit hardest by stock-outs</span>
          </SectionTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] border-collapse text-[15px]" aria-labelledby="sc-title">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="th pl-5 sm:pl-6">Client</th>
                <th scope="col" className="th text-right">Deliveries</th>
                <th scope="col" className="th text-right">Stock-out rate</th>
                <th scope="col" className="th pr-5 text-right sm:pr-6">On time</th>
              </tr>
            </thead>
            <tbody>
              {data.worst_clients.slice(0, 10).map((c) => (
                <tr key={c.client_id} className="border-b border-line last:border-b-0">
                  <th scope="row" className="td pl-5 text-left font-semibold sm:pl-6">
                    {c.client_name}
                  </th>
                  <td className="td num text-right">{num(c.deliveries)}</td>
                  <td className="td text-right">
                    <RateBar value={c.stock_out_rate} max={maxRate} />
                  </td>
                  <td className={`td num pr-5 text-right sm:pr-6 ${c.on_time_rate < 0.7 ? 'font-semibold text-late' : ''}`}>{pct(c.on_time_rate, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ---------- routes ---------- */

function RouteTable({
  id,
  title,
  note,
  first,
  rows,
  extra,
}: {
  id: string;
  title: string;
  note: string;
  first: string;
  rows: { key: string; label: ReactNode; deliveries: number; deviation_rate: number; on_time_with_deviation: number; on_time_without_deviation: number; extra?: ReactNode }[];
  extra?: string;
}) {
  const maxRate = Math.max(0.01, ...rows.map((r) => r.deviation_rate));
  return (
    <section className="panel overflow-hidden" aria-labelledby={id}>
      <div className="panel-pad pb-0 sm:pb-0">
        <SectionTitle note={note}>
          <span id={id}>{title}</span>
        </SectionTitle>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[15px]" aria-labelledby={id}>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="th pl-5 sm:pl-6">{first}</th>
              <th scope="col" className="th text-right">Deliveries</th>
              <th scope="col" className="th text-right">Deviation rate</th>
              <th scope="col" className="th text-right">On time, deviated</th>
              <th scope="col" className="th text-right">On time, on route</th>
              <th scope="col" className="th text-right">Gap</th>
              {extra && <th scope="col" className="th text-right">{extra}</th>}
              <th scope="col" className="th pr-5 sm:pr-6">
                <span className="sr-only">Comparison</span>
                <DumbbellScale />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line last:border-b-0">
                <th scope="row" className="td pl-5 text-left font-semibold sm:pl-6">
                  {r.label}
                </th>
                <td className="td num text-right">{num(r.deliveries)}</td>
                <td className="td text-right">
                  <RateBar value={r.deviation_rate} max={maxRate} />
                </td>
                <td className="td num text-right font-semibold text-late">{pct(r.on_time_with_deviation, 0)}</td>
                <td className="td num text-right">{pct(r.on_time_without_deviation, 0)}</td>
                <td className="td text-right">
                  <Gap bad={r.on_time_with_deviation} good={r.on_time_without_deviation} />
                </td>
                {extra && <td className="td num text-right">{r.extra}</td>}
                <td className="td pr-5 sm:pr-6">
                  <Dumbbell bad={r.on_time_with_deviation} good={r.on_time_without_deviation} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RouteSection({ data }: { data: RouteDeviation }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-[72ch]">
          <h2 className="text-[22px] font-bold tracking-tight">Route deviation</h2>
          <p className="mt-1 text-[15px] text-ink-soft">
            A delivery deviates when the driver goes more than 20% beyond the planned route. This is the one cause only routing software (or route
            discipline) can fix.
          </p>
        </div>
        <Key bad="On time when the driver deviated" good="On time on the planned route" />
      </div>
      <RouteTable
        id="rc-title"
        title="By carrier"
        note="All deliveries, 6 months"
        first="Carrier"
        extra="No route record"
        rows={[...data.by_carrier]
          .sort((a, b) => a.carrier_id.localeCompare(b.carrier_id))
          .map((c) => ({
            key: c.carrier_id,
            label: `Carrier ${c.carrier_id}`,
            deliveries: c.deliveries,
            deviation_rate: c.deviation_rate,
            on_time_with_deviation: c.on_time_with_deviation,
            on_time_without_deviation: c.on_time_without_deviation,
            extra: pct(c.missing_actual_km_rate),
          }))}
      />
      <RouteTable
        id="rr-title"
        title="By destination region"
        note="All deliveries, 6 months"
        first="Region"
        rows={[...data.by_region]
          .sort((a, b) => a.region.localeCompare(b.region))
          .map((r) => ({ key: r.region, label: r.region, ...r }))}
      />
      <p className="text-sm text-ink-soft">
        Deliveries with no recorded actual route are counted as on route, so the true deviation rate may be slightly higher. Carrier D&apos;s low on-time rate
        on the planned route comes from its weak lanes, not from deviation; see{' '}
        <Link to="/carriers" className="font-semibold text-route underline-offset-4 hover:underline">
          Carriers
        </Link>
        .
      </p>
    </div>
  );
}
