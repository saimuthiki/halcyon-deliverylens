import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { RouteDeviation, StockPlacement, WrongWarehouse } from '../api/types';
import { useApi } from '../lib/useApi';
import { num, pct, usd } from '../lib/format';
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

  return (
    <>
      <PageHeader
        title="Two problems that happen everywhere: no stock nearby, and drivers going off route"
        lede="Both happen at every warehouse, with every carrier and in every region, so the fix is a rule for all of them, not one site."
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

/** Two big numbers: on time without the problem vs with it. */
function Compare({ goodLabel, good, badLabel, bad }: { goodLabel: string; good: number; badLabel: string; bad: number }) {
  return (
    <dl className="mt-4 grid max-w-[560px] grid-cols-2 gap-3">
      <div className="rounded-md border border-line px-4 py-3">
        <dt className="text-sm text-slate">{goodLabel}</dt>
        <dd className="num text-2xl font-bold text-route-dark">{Math.round(good * 100)} in 100</dd>
      </div>
      <div className="rounded-md border border-late/30 bg-late-tint px-4 py-3">
        <dt className="text-sm text-slate">{badLabel}</dt>
        <dd className="num text-2xl font-bold text-late">{Math.round(bad * 100)} in 100</dd>
      </div>
    </dl>
  );
}

/* ---------- stock ---------- */

function StockSection({ data }: { data: StockPlacement }) {
  const overall = stockOverall(data);
  return (
    <div className="flex flex-col gap-6">
      <section className="panel overflow-hidden" aria-labelledby="wh-title">
        <div className="panel-pad pb-0 sm:pb-0">
          <SectionTitle note="The same at every warehouse">
            <span id="wh-title">No stock at the nearest warehouse</span>
          </SectionTitle>
          {overall && (
            <>
              <p className="-mt-2 max-w-[72ch] text-[15px] text-ink-soft">
                About <strong className="text-ink">1 in {Math.round(1 / overall.rate)}</strong> orders find no stock at the warehouse nearest the client, so they
                ship from further away.
              </p>
              <Compare goodLabel="Stock nearby: on time" good={overall.stocked} badLabel="No stock nearby: on time" bad={overall.stockOut} />
            </>
          )}
        </div>
        <div className="mt-4 overflow-x-auto">
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
        <p className="panel-pad pt-3 text-[15px] text-ink-soft sm:pt-3">
          <span className="font-semibold text-ink">The fix: </span>no single warehouse is the problem, so move fast-selling stock to the warehouse nearest each
          region before it runs out, at all five.{' '}
          <Link to="/why-late?cause=stock_not_at_nearest" className="font-semibold text-route underline-offset-4 hover:underline">
            See late deliveries
          </Link>
        </p>
      </section>

      {data.wrong_warehouse && data.wrong_warehouse.deliveries > 0 && <WrongWarehouseSection w={data.wrong_warehouse} />}

      <section className="panel overflow-hidden" aria-labelledby="sc-title">
        <div className="panel-pad pb-0 sm:pb-0">
          <SectionTitle note="Most often without stock nearby">
            <span id="sc-title">Clients hit hardest by stock-outs</span>
          </SectionTitle>
        </div>
        <div className="overflow-x-auto">
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
      </section>
    </div>
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

/** Far warehouse chosen although the nearest one had the stock. */
function WrongWarehouseSection({ w }: { w: WrongWarehouse }) {
  return (
    <section className="panel panel-pad" aria-labelledby="ww-title">
      <SectionTitle note="A choice, not a stock-out">
        <span id="ww-title">Shipped from far away, although the nearest warehouse had the stock</span>
      </SectionTitle>
      <p className="-mt-2 max-w-[72ch] text-[15px] text-ink-soft">
        <strong className="text-ink">{num(w.deliveries)}</strong> orders went out from a warehouse about {num(w.avg_miles)} miles away instead of about{' '}
        {num(w.avg_miles_nearest)}, even though the nearest one had everything.
      </p>
      <Compare goodLabel="Nearest warehouse: on time" good={w.on_time_nearest} badLabel="Far warehouse: on time" bad={w.on_time} />
      <p className="mt-4 max-w-[72ch] text-[15px] text-ink-soft" data-testid="wrong-warehouse-explains">
        {w.late_with_no_other_cause === w.late_with_no_cause_total ? (
          <>
            They explain <strong className="text-ink">all {num(w.late_with_no_cause_total)}</strong> late deliveries that had none of the five causes, so every
            late delivery now has a reason.
          </>
        ) : (
          <>
            They explain {num(w.late_with_no_other_cause)} of the {num(w.late_with_no_cause_total)} late deliveries that had none of the five causes.
          </>
        )}
        {w.top_client && ` ${w.top_client.client_name} alone had ${num(w.top_client.deliveries)} of them.`} Penalties paid: {usd(w.sla_penalties_usd)}.
      </p>
      <p className="mt-3 text-[15px] text-ink-soft">
        <span className="font-semibold text-ink">The fix: </span>the{' '}
        <Link to="/order-desk" className="font-semibold text-route underline-offset-4 hover:underline">
          Order desk
        </Link>{' '}
        always ships from the nearest warehouse that has every item, so this cannot happen there.
      </p>
    </section>
  );
}

/* ---------- routes ---------- */

function RouteSection({ data }: { data: RouteDeviation }) {
  const n = data.by_carrier.reduce((t, c) => t + c.deliveries, 0);
  const off = data.by_carrier.reduce((t, c) => t + c.deliveries * c.deviation_rate, 0);
  const offOnTime = data.by_carrier.reduce((t, c) => t + c.deliveries * c.deviation_rate * c.on_time_with_deviation, 0) / (off || 1);
  const onOnTime = data.by_carrier.reduce((t, c) => t + c.deliveries * (1 - c.deviation_rate) * c.on_time_without_deviation, 0) / (n - off || 1);
  return (
    <section className="panel overflow-hidden" aria-labelledby="rc-title">
      <div className="panel-pad pb-0 sm:pb-0">
        <SectionTitle note="The same in every region">
          <span id="rc-title">Drivers going off route</span>
        </SectionTitle>
        {n > 0 && (
          <>
            <p className="-mt-2 max-w-[72ch] text-[15px] text-ink-soft">
              On about <strong className="text-ink">1 in {Math.round(n / off)}</strong> deliveries the driver drives more than 20% further than planned.
            </p>
            <Compare goodLabel="On the planned route: on time" good={onOnTime} badLabel="Off route: on time" bad={offOnTime} />
          </>
        )}
      </div>
      <div className="mt-4 overflow-x-auto">
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
      </div>
      <p className="panel-pad pt-3 text-[15px] text-ink-soft sm:pt-3">
        <span className="font-semibold text-ink">The fix: </span>this is the one problem routing software (or route discipline) can fix. Carrier D is slow even on
        route because of its weak lanes; see{' '}
        <Link to="/carriers" className="font-semibold text-route underline-offset-4 hover:underline">
          Carriers
        </Link>
        .
      </p>
    </section>
  );
}
