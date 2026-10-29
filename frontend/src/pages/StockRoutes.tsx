import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { RouteDeviation, StockPlacement, WrongWarehouse } from '../api/types';
import { useApi } from '../lib/useApi';
import { num, pct, usd } from '../lib/format';
import PageHeader from '../components/PageHeader';
import { ErrorState, LoadingBlock, SourceTag } from '../components/States';
import { Client, Truck, TripMap, Warehouse } from '../components/TripArt';

/**
 * Stock & routes, readable in about 30 seconds: three ways an order takes the long way to the client.
 * Each card is one story: a tiny trip map, how often it happens, on time normally vs on that trip, and the fix.
 * The full tables sit in "See the numbers" below for anyone who wants the detail.
 */
export default function StockRoutes() {
  const stock = useApi(() => api.stockPlacement());
  const routes = useApi(() => api.routeDeviation());

  const s = stock.data;
  const r = routes.data;
  const stockOk = !!s && !stock.error;
  const routesOk = !!r && !routes.error;

  return (
    <>
      <PageHeader
        title="Why some orders take the long way"
        lede="Three everyday problems turn a short trip into a long one, and long trips arrive late far more often. Each has a simple fix."
        aside={<SourceTag source={stock.source === 'sample' || routes.source === 'sample' ? 'sample' : stock.source} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {stock.loading && !s ? (
          <LoadingBlock label="Loading stock placement" rows={6} />
        ) : !stockOk ? (
          <ErrorState message={stock.error ?? 'No stock data returned.'} onRetry={stock.reload} />
        ) : (
          <>
            <StockOutCard data={s} />
            {s.wrong_warehouse && s.wrong_warehouse.deliveries > 0 && <WrongWarehouseCard w={s.wrong_warehouse} />}
          </>
        )}
        {routes.loading && !r ? (
          <LoadingBlock label="Loading route deviation" rows={6} />
        ) : !routesOk ? (
          <ErrorState message={routes.error ?? 'No route data returned.'} onRetry={routes.reload} />
        ) : (
          <OffRouteCard data={r} />
        )}
      </div>

      <p className="mt-4 max-w-[80ch] text-[15px] text-ink-soft">
        <span className="font-semibold text-ink">Not one bad site: </span>all three happen at every warehouse and with every carrier, so each fix is a rule for
        everyone.
      </p>
      <p className="mt-2 max-w-[80ch] text-[15px] text-ink-soft">
        <span className="font-semibold text-ink">Late</span> means it arrived after the promised time; every order is still delivered. Even the teal trips are
        sometimes late for other reasons: the order came in after the 08:00 cutoff, the address was incomplete, or the carrier is weak on that lane.
      </p>

      {(stockOk || routesOk) && (
        <details className="panel mt-6 overflow-hidden">
          <summary className="panel-pad cursor-pointer font-semibold text-route">See the numbers by warehouse, client and carrier</summary>
          <div className="flex flex-col gap-6 pb-5">
            {stockOk && <StockTables data={s} />}
            {routesOk && <CarrierTable data={r} />}
          </div>
        </details>
      )}
    </>
  );
}

/* ---------- the three story cards ---------- */

function StoryCard({ n, title, map, often, bars, fix }: { n: number; title: string; map: ReactNode; often: ReactNode; bars: ReactNode; fix: ReactNode }) {
  const id = `story-${n}`;
  return (
    <section className="panel panel-pad flex flex-col" aria-labelledby={id}>
      <h2 id={id} className="flex items-start gap-2.5 text-lg font-semibold leading-snug">
        <span className="num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-late-tint text-sm font-bold text-late" aria-hidden="true">
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-3">{map}</div>
      <p className="mt-3 text-[15px] text-ink-soft">{often}</p>
      <div className="mt-3">{bars}</div>
      <p className="mt-auto border-t border-line pt-3 text-[15px] text-ink-soft">
        <span className="font-semibold text-route-dark">Fix: </span>
        {fix}
      </p>
    </section>
  );
}

/**
 * Out of every 100 orders: on time vs late, without the problem (teal) and with it (orange).
 * Late = arrived after the promised time; every order is still delivered.
 */
function OnTimeBars({ normal, normalLabel, problem, problemLabel }: { normal: number; normalLabel: string; problem: number; problemLabel: string }) {
  const rows = [
    { label: normalLabel, v: normal, bar: 'bg-route', text: 'text-route-dark' },
    { label: problemLabel, v: problem, bar: 'bg-late', text: 'text-late' },
  ];
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-sm text-slate">Out of every 100 orders</p>
      <dl className="flex flex-col gap-2.5">
        {rows.map((row) => {
          const on = Math.round(row.v * 100);
          return (
            <div key={row.label}>
              <dt className="text-sm text-ink-soft">{row.label}</dt>
              <dd>
                <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-slate-light" aria-hidden="true">
                  <div className={`h-full ${row.bar}`} style={{ width: `${on}%` }} />
                </div>
                <p className="mt-0.5 text-sm">
                  <span className={`num font-bold ${row.text}`}>{on} on time</span>
                  <span className="text-slate"> · {100 - on} late</span>
                </p>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/* Trip maps: warehouses and a client on one road, with a small truck driving each trip (teal = the right trip, orange = the trip taken). */

const LONG_WAY = 'M38 52 Q140 4 244 52';

function StockOutCard({ data }: { data: StockPlacement }) {
  const o = stockOverall(data);
  if (!o) return null;
  return (
    <StoryCard
      n={1}
      title="The nearest warehouse ran out"
      map={
        <TripMap label="The nearest warehouse is empty, so a truck drives the long way from a far warehouse to the client.">
          <path d={LONG_WAY} className="stroke-late" strokeWidth="3" fill="none" strokeLinecap="round" />
          <Warehouse x={22} label="Far warehouse" />
          <Warehouse x={140} label="Nearest: empty" mark="empty" />
          <Client x={258} />
          <Truck path={LONG_WAY} arrive={0.8} tone="late" />
        </TripMap>
      }
      often={
        <>
          About <strong className="text-ink">1 in {Math.round(1 / o.rate)} orders</strong> find the shelf empty at the warehouse nearest the client, so another
          warehouse further away sends it.
        </>
      }
      bars={<OnTimeBars normal={o.stocked} normalLabel="Nearest warehouse had the stock" problem={o.stockOut} problemLabel="Nearest was empty, sent from further away" />}
      fix={
        <>
          keep fast-selling items stocked near each region before they run out.{' '}
          <Link to="/why-late?cause=stock_not_at_nearest" className="font-semibold text-route underline-offset-4 hover:underline">
            See these late orders
          </Link>
        </>
      }
    />
  );
}

function WrongWarehouseCard({ w }: { w: WrongWarehouse }) {
  const shortWay = 'M155 58 H244';
  return (
    <StoryCard
      n={2}
      title="We picked a far warehouse anyway"
      map={
        <TripMap
          label={`The nearest warehouse had the stock, about ${num(w.avg_miles_nearest)} miles away, but the order came from about ${num(w.avg_miles)} miles away. The teal truck shows the short trip it should have taken.`}
        >
          <path d={shortWay} className="stroke-route" strokeWidth="2.5" strokeDasharray="5 4" fill="none" />
          <path d={LONG_WAY} className="stroke-late" strokeWidth="3" fill="none" strokeLinecap="round" />
          <text x={190} y={50} textAnchor="middle" className="fill-route-dark text-[11px] font-semibold">
            {num(w.avg_miles_nearest)} mi
          </text>
          <text x={140} y={20} textAnchor="middle" className="fill-late text-[11px] font-semibold">
            {num(w.avg_miles)} mi
          </text>
          <Warehouse x={22} label="Far warehouse" />
          <Warehouse x={140} label="Nearest: in stock" mark="stocked" />
          <Client x={258} />
          <Truck path={shortWay} arrive={0.25} tone="route" />
          <Truck path={LONG_WAY} arrive={0.8} tone="late" />
        </TripMap>
      }
      often={
        <>
          <strong className="text-ink">{num(w.deliveries)} orders</strong> came from a far warehouse although the nearest one had every item: about{' '}
          {num(Math.round(w.avg_miles / Math.max(w.avg_miles_nearest, 1)))}× further than needed. Penalties paid:{' '}
          <strong className="text-ink">{usd(w.sla_penalties_usd)}</strong>.
        </>
      }
      bars={<OnTimeBars normal={w.on_time_nearest} normalLabel="Sent from the nearest warehouse" problem={w.on_time} problemLabel="Sent from a far warehouse instead" />}
      fix={
        <>
          always ship from the nearest warehouse that has every item. The{' '}
          <Link to="/order-desk" className="font-semibold text-route underline-offset-4 hover:underline">
            Order desk
          </Link>{' '}
          already does.
        </>
      }
    />
  );
}

function OffRouteCard({ data }: { data: RouteDeviation }) {
  const n = data.by_carrier.reduce((t, c) => t + c.deliveries, 0);
  const off = data.by_carrier.reduce((t, c) => t + c.deliveries * c.deviation_rate, 0);
  if (!n || !off) return null;
  const offOnTime = data.by_carrier.reduce((t, c) => t + c.deliveries * c.deviation_rate * c.on_time_with_deviation, 0) / off;
  const onOnTime = data.by_carrier.reduce((t, c) => t + c.deliveries * (1 - c.deviation_rate) * c.on_time_without_deviation, 0) / (n - off || 1);
  const planned = 'M38 58 H244';
  const detour = 'M38 58 C72 58 72 24 106 24 S140 72 174 72 S210 58 244 58';
  return (
    <StoryCard
      n={3}
      title="The driver left the planned road"
      map={
        <TripMap label="Two trucks leave the same warehouse: the teal one keeps to the planned road, the orange one takes a detour more than 20% longer and arrives later.">
          <path d={planned} className="stroke-route" strokeWidth="2.5" strokeDasharray="5 4" fill="none" />
          <path d={detour} className="stroke-late" strokeWidth="3" fill="none" strokeLinecap="round" />
          <text x={200} y={50} textAnchor="middle" className="fill-route-dark text-[11px] font-semibold">
            planned
          </text>
          <Warehouse x={22} label="Warehouse" />
          <Client x={258} />
          <Truck path={planned} arrive={0.45} tone="route" />
          <Truck path={detour} arrive={0.8} tone="late" />
        </TripMap>
      }
      often={
        <>
          On about <strong className="text-ink">1 in {Math.round(n / off)} deliveries</strong> the driver drives more than 20% further than the planned route.
        </>
      }
      bars={<OnTimeBars normal={onOnTime} normalLabel="Stayed on the planned route" problem={offOnTime} problemLabel="Drove more than 20% off route" />}
      fix={<>keep drivers on the planned route. This is the one problem routing software can fix.</>}
    />
  );
}

/** All warehouses together: the stock-out rate, and on time with and without stock (weighted by orders). */
function stockOverall(data: StockPlacement): { rate: number; stockOut: number; stocked: number } | null {
  let n = 0, out = 0, outOnTime = 0, inOnTime = 0;
  for (const w of data.by_warehouse) {
    const o = w.deliveries * w.stock_out_rate;
    n += w.deliveries;
    out += o;
    outOnTime += o * w.on_time_when_stock_out;
    inOnTime += (w.deliveries - o) * w.on_time_when_stocked;
  }
  return n && out && n > out ? { rate: out / n, stockOut: outOnTime / out, stocked: inOnTime / (n - out) } : null;
}

/* ---------- detail tables (inside "See the numbers") ---------- */

function TableTitle({ id, children, note }: { id: string; children: ReactNode; note: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pb-2 sm:px-6">
      <h3 id={id} className="font-semibold">
        {children}
      </h3>
      <p className="text-sm text-slate">{note}</p>
    </div>
  );
}

function StockTables({ data }: { data: StockPlacement }) {
  return (
    <>
      <div className="overflow-x-auto">
        <TableTitle id="wh-title" note="1 · The same at every warehouse">
          No stock at the nearest warehouse
        </TableTitle>
        <table className="w-full min-w-[520px] border-collapse text-[15px]" aria-labelledby="wh-title">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="th pl-5 sm:pl-6">Warehouse</th>
              <th scope="col" className="th text-right">Orders with no stock</th>
              <th scope="col" className="th text-right">On time, no stock</th>
              <th scope="col" className="th pr-5 text-right sm:pr-6">On time, with stock</th>
            </tr>
          </thead>
          <tbody>
            {data.by_warehouse.map((w) => (
              <tr key={w.warehouse_id} className="border-b border-line last:border-b-0">
                <th scope="row" className="td pl-5 text-left sm:pl-6">
                  <span className="font-semibold">{w.name}</span>
                  <span className="ml-2 whitespace-nowrap text-sm font-normal text-slate">
                    {w.warehouse_id}, {w.region}
                  </span>
                </th>
                <td className="td num text-right">{pct(w.stock_out_rate, 0)}</td>
                <td className="td num text-right font-semibold text-late">{pct(w.on_time_when_stock_out, 0)}</td>
                <td className="td num pr-5 text-right sm:pr-6">{pct(w.on_time_when_stocked, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <TableTitle id="sc-title" note="Most often without stock nearby">
          Clients hit hardest by stock-outs
        </TableTitle>
        <table className="w-full min-w-[400px] border-collapse text-[15px]" aria-labelledby="sc-title">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="th pl-5 sm:pl-6">Client</th>
              <th scope="col" className="th text-right">Orders with no stock</th>
              <th scope="col" className="th pr-5 text-right sm:pr-6">On time</th>
            </tr>
          </thead>
          <tbody>
            {data.worst_clients.slice(0, 5).map((c) => (
              <tr key={c.client_id} className="border-b border-line last:border-b-0">
                <th scope="row" className="td pl-5 text-left font-semibold sm:pl-6">
                  {c.client_name}
                </th>
                <td className="td num text-right">{pct(c.stock_out_rate, 0)}</td>
                <td className={`td num pr-5 text-right sm:pr-6 ${c.on_time_rate < 0.7 ? 'font-semibold text-late' : ''}`}>{pct(c.on_time_rate, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.wrong_warehouse && data.wrong_warehouse.deliveries > 0 && (
        <p className="px-5 text-[15px] text-ink-soft sm:px-6" data-testid="wrong-warehouse-explains">
          <span className="font-semibold text-ink">2 · Far warehouse by choice: </span>
          {data.wrong_warehouse.late_with_no_other_cause === data.wrong_warehouse.late_with_no_cause_total ? (
            <>explains all {num(data.wrong_warehouse.late_with_no_cause_total)} late deliveries that had none of the five causes.</>
          ) : (
            <>
              explains {num(data.wrong_warehouse.late_with_no_other_cause)} of the {num(data.wrong_warehouse.late_with_no_cause_total)} late deliveries that had none
              of the five causes.
            </>
          )}
          {data.wrong_warehouse.top_client &&
            ` ${data.wrong_warehouse.top_client.client_name} alone had ${num(data.wrong_warehouse.top_client.deliveries)} of these orders.`}
        </p>
      )}
    </>
  );
}

function CarrierTable({ data }: { data: RouteDeviation }) {
  return (
    <div className="overflow-x-auto">
      <TableTitle id="rc-title" note="3 · The same with every carrier">
        Drivers going off route
      </TableTitle>
      <table className="w-full min-w-[520px] border-collapse text-[15px]" aria-labelledby="rc-title">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="th pl-5 sm:pl-6">Carrier</th>
            <th scope="col" className="th text-right">Deliveries off route</th>
            <th scope="col" className="th text-right">On time, off route</th>
            <th scope="col" className="th pr-5 text-right sm:pr-6">On time, on route</th>
          </tr>
        </thead>
        <tbody>
          {[...data.by_carrier]
            .sort((a, b) => a.carrier_id.localeCompare(b.carrier_id))
            .map((c) => (
              <tr key={c.carrier_id} className="border-b border-line last:border-b-0">
                <th scope="row" className="td pl-5 text-left font-semibold sm:pl-6">
                  Carrier {c.carrier_id}
                </th>
                <td className="td num text-right">{pct(c.deviation_rate, 0)}</td>
                <td className="td num text-right font-semibold text-late">{pct(c.on_time_with_deviation, 0)}</td>
                <td className="td num pr-5 text-right sm:pr-6">{pct(c.on_time_without_deviation, 0)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <p className="mt-3 px-5 text-[15px] text-ink-soft sm:px-6">
        Carrier D is slow even on route because of its weak lanes; see{' '}
        <Link to="/carriers" className="font-semibold text-route underline-offset-4 hover:underline">
          Carriers
        </Link>
        .
      </p>
    </div>
  );
}
