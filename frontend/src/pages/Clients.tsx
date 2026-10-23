import { api } from '../api/client';
import type { AtRiskClient } from '../api/types';
import { useApi } from '../lib/useApi';
import { num, pct, usd } from '../lib/format';
import { BENCHMARK, causeShort } from '../lib/causes';
import PageHeader, { SectionTitle } from '../components/PageHeader';
import CauseChip from '../components/CauseChip';
import { ErrorState, LoadingBlock, SourceTag } from '../components/States';

export default function Clients() {
  const c = useApi(() => api.atRisk());
  return (
    <>
      <PageHeader
        title="Nine clients are deciding whether to stay"
        lede="Each of these accounts has told Halcyon it may leave. Together they bring in $14.2M a year, and their deliveries arrive on time about 71% of the time."
        aside={<SourceTag source={c.source} />}
      />
      {c.loading && !c.data ? (
        <LoadingBlock rows={8} />
      ) : c.error || !c.data ? (
        <ErrorState message={c.error ?? 'No data returned.'} onRetry={c.reload} />
      ) : c.data.length === 0 ? (
        <div className="panel panel-pad text-ink-soft">No clients are flagged as at risk.</div>
      ) : (
        <ClientsBody rows={c.data} />
      )}
    </>
  );
}

function ClientsBody({ rows }: { rows: AtRiskClient[] }) {
  const sorted = [...rows].sort((a, b) => b.annual_revenue_usd - a.annual_revenue_usd);
  const total = sorted.reduce((s, r) => s + r.annual_revenue_usd, 0);
  const max = Math.max(...sorted.map((r) => r.annual_revenue_usd));
  const deliveries = sorted.reduce((s, r) => s + r.deliveries, 0);
  const weighted = deliveries ? sorted.reduce((s, r) => s + r.on_time_rate * r.deliveries, 0) / deliveries : 0;
  const penalties = sorted.reduce((s, r) => s + r.penalties_usd, 0);

  const causeCounts = new Map<string, number>();
  for (const r of sorted) for (const c of r.main_causes) causeCounts.set(c, (causeCounts.get(c) ?? 0) + 1);
  const topCause = [...causeCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="flex flex-col gap-6">
      <section className="panel overflow-hidden" aria-labelledby="clients-title">
        <div className="panel-pad pb-0 sm:pb-0">
          <SectionTitle note="Sorted by annual revenue">
            <span id="clients-title">At-risk accounts</span>
          </SectionTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th pl-5 sm:pl-6">Client</th>
                <th className="th">Annual revenue</th>
                <th className="th whitespace-nowrap text-right">On time</th>
                <th className="th whitespace-nowrap text-right">Penalties, 6 mo</th>
                <th className="th whitespace-nowrap">Orders by</th>
                <th className="th pr-5 sm:pr-6">Main causes of their late deliveries</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.client_id} className="border-b border-line">
                  <td className="td pl-5 sm:pl-6">
                    <div className="font-semibold">{r.client_name}</div>
                    <div className="whitespace-nowrap text-sm text-slate">
                      {r.region}, {r.tier}
                    </div>
                  </td>
                  <td className="td w-[170px]">
                    <div className="num font-semibold">{usd(r.annual_revenue_usd)}</div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-light">
                      <div className="h-1.5 rounded-full bg-ink-soft" style={{ width: `${(r.annual_revenue_usd / max) * 100}%` }} />
                    </div>
                  </td>
                  <td className={`td num text-right font-semibold ${r.on_time_rate < BENCHMARK ? 'text-late' : 'text-route-dark'}`}>{pct(r.on_time_rate)}</td>
                  <td className="td num text-right">{usd(r.penalties_usd)}</td>
                  <td className="td">{r.channel}</td>
                  <td className="td pr-5 sm:pr-6">
                    <div className="flex flex-wrap gap-1.5">
                      {r.main_causes.map((c) => (
                        <CauseChip key={c} cause={c} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-paper font-semibold">
                <td className="td pl-5 sm:pl-6">{sorted.length} clients</td>
                <td className="td num">{usd(total)}</td>
                <td className="td num text-right text-late">{pct(weighted)}</td>
                <td className="td num text-right">{usd(penalties)}</td>
                <td className="td" colSpan={2}>
                  <span className="font-normal text-ink-soft">{num(deliveries)} deliveries in 6 months</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {topCause && (
        <section className="panel panel-pad" aria-labelledby="pattern-title">
          <h2 id="pattern-title" className="text-lg font-semibold">
            What these clients have in common
          </h2>
          <p className="mt-2 max-w-[72ch] text-[15px] leading-relaxed text-ink-soft">
            {causeShort(topCause[0])} is a main cause for {topCause[1]} of the {sorted.length} accounts. These clients also raised 24 of the 34
            complaints in the period. Across all clients, 12 complaints were about not being told about a delay. A proactive delay alert costs almost nothing to
            send and removes that complaint entirely.
          </p>
        </section>
      )}
    </div>
  );
}
