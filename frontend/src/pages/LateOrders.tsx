import { useEffect, useId, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import { LATE_ORDER_TIMES } from '../api/mockData';
import type { DataSource, LateOrdersAdded, LateOrdersResponse, LateOrdersRule, SameDayWindow } from '../api/types';
import { num, pct, usd } from '../lib/format';
import PageHeader, { SectionTitle } from '../components/PageHeader';
import { ErrorState, LoadingBlock, SourceTag } from '../components/States';
import { ActorBadge } from '../components/Actor';

const PICK_LIST_CUTOFF = '08:00';

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** "1-hour", "30-minute", "1.5-hour": how long the window from `from` to `to` lasts. */
export function durationLabel(from: string, to: string): string {
  const mins = minutesOf(to) - minutesOf(from);
  if (mins < 60) return `${mins}-minute`;
  const hours = mins / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}-hour`;
}

/** The page title: the grace period's saving, then what urgent orders add at most. Built from the response. */
export function lateOrdersTitle(r: LateOrdersResponse): string {
  const { grace_until: g, hard_stop: h } = r.inputs;
  const hasGrace = g !== PICK_LIST_CUTOFF;
  const hasUrgent = h !== g;
  const urgent = num(r.urgent_priority_clients_at_most.late_avoided_per_year);
  if (!hasGrace && !hasUrgent)
    return `With no grace period and no urgent orders, all ${num(r.population.after_cutoff_same_day)} late same-day orders wait for tomorrow.`;
  if (!hasGrace) return `Taking urgent orders until ${h} saves up to ${urgent} late deliveries a year.`;
  const head = `A ${durationLabel(PICK_LIST_CUTOFF, g)} grace period saves ${num(r.grace.late_avoided_per_year)} late deliveries a year`;
  return hasUrgent ? `${head}; urgent orders until ${h} add up to ${urgent} more.` : `${head}; from ${g} every order goes to tomorrow.`;
}

/** Colour and words for each window, used by the timeline and its legend. Teal is added, purple needs the AI, orange waits. */
export const WINDOW_META: Record<Exclude<SameDayWindow, 'before_cutoff'>, { label: string; outcome: string; bar: string; swatch: string }> = {
  grace: { label: 'Grace period', outcome: 'added to today', bar: 'bg-route', swatch: 'bg-route' },
  urgent_window: { label: 'Urgent orders only', outcome: 'added only if urgent (the AI reads the email)', bar: 'bg-ai', swatch: 'bg-ai' },
  after_hard_stop: { label: 'After the hard stop', outcome: 'tomorrow', bar: 'bg-late', swatch: 'bg-late' },
};

export default function LateOrders() {
  const [times, setTimes] = useState<{ grace_until: string; hard_stop: string } | null>(null);
  const [result, setResult] = useState<{ data: LateOrdersResponse; source: DataSource } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // No times yet: ask with none, so the API answers with the Order desk settings and the controls start there.
  const key = times ? `${times.grace_until}|${times.hard_stop}` : null;
  const shownKey = result ? `${result.data.inputs.grace_until}|${result.data.inputs.hard_stop}` : null;

  // A new pair of times asks the API again; the last answer stays on screen meanwhile.
  useEffect(() => {
    if (key !== null && key === shownKey) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.lateOrders(times ?? {});
        if (cancelled) return;
        setResult({ data: r.data, source: r.source });
        if (!times) setTimes({ grace_until: r.data.inputs.grace_until, hard_stop: r.data.inputs.hard_stop });
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  if (!result || !times) {
    if (error) return <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />;
    return <LoadingBlock label="Running the late same-day orders replay" rows={6} />;
  }

  const r = result.data;
  const pending = key !== shownKey;

  return (
    <>
      <PageHeader
        title={<span data-testid="late-orders-title">{lateOrdersTitle(r)}</span>}
        lede={`${num(r.population.after_cutoff_same_day)} same-day orders arrived after the 08:00 pick list over ${num(r.population.days)} days, and only ${pct(r.population.on_time_rate_today, 0)} of them were on time. The 08:00 pick list stays. Late orders are still added to it during a grace period, then only urgent ones until a hard stop.`}
        aside={<SourceTag source={result.source} />}
      />

      {result.source === 'sample' && (
        <p role="note" data-testid="sample-response" className="mb-6 flex items-start gap-2 rounded-md border border-late/40 bg-late-tint px-4 py-3 text-[15px] text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-late" aria-hidden="true" />
          <span>
            <span className="font-semibold">Sample — API offline.</span> These figures are a saved snapshot of the real replay, not a live run. Start the API
            to run it live.
          </span>
        </p>
      )}
      {error && (
        <div className="mb-6">
          <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Controls times={times} onChange={setTimes} desk={r.order_desk_settings} />
        <Timeline r={r} pending={pending} />
      </div>

      <div className="mt-6">
        <Results r={r} pending={pending} />
      </div>

      <div className="mt-6">
        <DecisionTable rules={r.rules} />
      </div>

      <MethodNotes method={r.method} assumptions={r.assumptions} />
    </>
  );
}

/* ---------- controls ---------- */

function Controls({
  times,
  onChange,
  desk,
}: {
  times: { grace_until: string; hard_stop: string };
  onChange: (t: { grace_until: string; hard_stop: string }) => void;
  desk: { grace_until: string; hard_stop: string };
}) {
  const graceId = useId();
  const hardId = useId();
  const g = minutesOf(times.grace_until);
  const h = minutesOf(times.hard_stop);
  const isDesk = times.grace_until === desk.grace_until && times.hard_stop === desk.hard_stop;
  return (
    <section className="panel panel-pad flex flex-col gap-5" aria-labelledby="late-controls-title" data-testid="late-controls">
      <SectionTitle>
        <span id="late-controls-title">The two times</span>
      </SectionTitle>

      <div className="-mt-3">
        <label htmlFor={graceId} className="font-semibold">
          Grace period until
        </label>
        <p className="mb-2 text-sm text-slate">From 08:00 to this time, every same-day order with a complete address is added to today’s pick list.</p>
        <select
          id={graceId}
          className="field num"
          value={times.grace_until}
          onChange={(e) => onChange({ ...times, grace_until: e.target.value })}
          data-testid="grace-select"
        >
          {LATE_ORDER_TIMES.map((t) => (
            <option key={t} value={t} disabled={minutesOf(t) > h}>
              {t === PICK_LIST_CUTOFF ? '08:00 (no grace period)' : t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={hardId} className="font-semibold">
          Hard stop
        </label>
        <p className="mb-2 text-sm text-slate">Until this time only urgent orders are added. From it, every order goes to tomorrow.</p>
        <select
          id={hardId}
          className="field num"
          value={times.hard_stop}
          onChange={(e) => onChange({ ...times, hard_stop: e.target.value })}
          data-testid="hard-select"
        >
          {LATE_ORDER_TIMES.map((t) => (
            <option key={t} value={t} disabled={minutesOf(t) < g}>
              {t === times.grace_until ? `${t} (no urgent window)` : t}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4 text-sm text-ink-soft" data-testid="desk-settings">
        <p>
          The Order desk uses <span className="num font-semibold text-ink">{desk.grace_until}</span> and{' '}
          <span className="num font-semibold text-ink">{desk.hard_stop}</span>, set in <code className="text-[13px]">SAME_DAY_GRACE_UNTIL</code> and{' '}
          <code className="text-[13px]">SAME_DAY_HARD_STOP</code>. This page lets you test other times; it does not change the Order desk.
        </p>
        {!isDesk && (
          <button type="button" className="btn-quiet self-start px-0" onClick={() => onChange({ ...desk })}>
            Back to the Order desk settings
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------- arrivals timeline ---------- */

function Timeline({ r, pending }: { r: LateOrdersResponse; pending: boolean }) {
  const max = Math.max(1, ...r.arrivals.map((a) => a.orders));
  const p = r.population;
  const shown = (['grace', 'urgent_window', 'after_hard_stop'] as const).filter((w) => r.arrivals.some((a) => a.window === w));
  return (
    <section className="panel panel-pad" aria-labelledby="arrivals-title" aria-busy={pending} data-testid="arrivals">
      <SectionTitle note={pending ? 'Updating…' : `Same-day orders after 08:00, ${num(p.days)} days`}>
        <span id="arrivals-title">When late orders arrive</span>
      </SectionTitle>
      <ul className="-mt-1 mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-soft" aria-label="Legend">
        {shown.map((w) => (
          <li key={w} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${WINDOW_META[w].swatch}`} aria-hidden="true" />
            {WINDOW_META[w].label}: {WINDOW_META[w].outcome}
          </li>
        ))}
      </ul>
      <ol className={`flex flex-col gap-1.5 transition-opacity duration-200 ${pending ? 'opacity-60' : ''}`}>
        {r.arrivals.map((a) => {
          const meta = WINDOW_META[a.window as Exclude<SameDayWindow, 'before_cutoff'>] ?? WINDOW_META.after_hard_stop;
          return (
            <li key={a.from} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.75rem] items-center gap-2 text-sm" data-testid="arrival" data-window={a.window}>
              <span className="num text-ink-soft">
                {a.from}–{a.to}
              </span>
              <span className="h-4 rounded-sm bg-slate-light" aria-hidden="true">
                <span className={`block h-full rounded-sm ${meta.bar}`} style={{ width: `${(a.orders / max) * 100}%` }} />
              </span>
              <span className="num text-right font-semibold">{num(a.orders)}</span>
              <span className="sr-only">
                orders, {meta.label.toLowerCase()}: {meta.outcome}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-sm text-slate" data-testid="window-counts">
        <span className="num">{num(p.grace_orders)}</span> in the grace period, <span className="num">{num(p.urgent_window_orders)}</span> in the urgent window (
        <span className="num">{num(p.urgent_window_priority_client_orders)}</span> from priority clients), <span className="num">{num(p.after_hard_stop_orders)}</span>{' '}
        after the hard stop. <span className="num">{num(p.incomplete_address_excluded)}</span> in the first two had an incomplete address and stay on hold.
      </p>
    </section>
  );
}

/* ---------- results ---------- */

function Figures({ a, days, tone }: { a: LateOrdersAdded; days: number; tone: string }) {
  const rows: [string, string][] = [
    ['Late deliveries avoided a year', num(a.late_avoided_per_year)],
    ['SLA penalties avoided a year', usd(a.sla_penalties_avoided_usd_per_year)],
    ['At-risk clients: late avoided a year', num(a.at_risk_late_avoided_per_year)],
    [`Orders added, ${num(days)} days`, num(a.orders)],
    ['Extra orders per warehouse a day', a.extra_orders_per_warehouse_day.toFixed(2)],
  ];
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-[15px]">
      {rows.map(([k, v], i) => (
        <div key={k} className="contents">
          <dt className="text-ink-soft">{k}</dt>
          <dd className={`num text-right ${i === 0 ? `text-[22px] font-bold ${tone}` : 'font-semibold'}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Results({ r, pending }: { r: LateOrdersResponse; pending: boolean }) {
  const { grace_until: g, hard_stop: h } = r.inputs;
  const ot = r.on_time_rate_after_cutoff_orders;
  return (
    <section className="panel overflow-hidden" aria-labelledby="results-title" aria-live="polite" aria-busy={pending} data-testid="results">
      <div className="panel-pad pb-4 sm:pb-4">
        <SectionTitle note={pending ? 'Updating…' : 'Per year, from the six-month replay'}>
          <span id="results-title">What each window is worth</span>
        </SectionTitle>
      </div>
      <div className={`grid border-t border-line transition-opacity duration-200 md:grid-cols-2 ${pending ? 'opacity-60' : ''}`}>
        <div className="panel-pad border-line md:border-r" data-testid="result-grace">
          <h3 className="flex flex-wrap items-baseline gap-x-2 font-semibold">
            Grace period, <span className="num">08:00 to {g}</span>
            <span className="rounded-full border border-route/30 bg-route-tint px-2 py-0.5 text-sm font-medium text-route-dark">Exact</span>
          </h3>
          <p className="mb-3 mt-1 text-sm text-slate">Every same-day order with a complete address is added, so the history gives the exact figure.</p>
          {g === PICK_LIST_CUTOFF ? <p className="text-[15px] text-ink-soft">No grace period at these times.</p> : <Figures a={r.grace} days={r.population.days} tone="text-route-dark" />}
        </div>
        <div className="panel-pad border-t border-line md:border-t-0" data-testid="result-urgent">
          <h3 className="flex flex-wrap items-baseline gap-x-2 font-semibold">
            Urgent orders only, <span className="num">{g} to {h}</span>
            <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-sm font-medium text-ink-soft">At most</span>
          </h3>
          <p className="mb-3 mt-1 text-sm text-slate">
            An upper bound: history has no email text, so every priority-client order (Tier 1 or at risk) is counted as if it said it was urgent.
          </p>
          {g === h ? (
            <p className="text-[15px] text-ink-soft">No urgent window at these times.</p>
          ) : (
            <>
              <Figures a={r.urgent_priority_clients_at_most} days={r.population.days} tone="text-route-dark" />
              <p className="mt-3 rounded-md bg-paper px-3 py-2 text-sm text-ink-soft" data-testid="other-clients">
                <span className="num font-semibold text-ink">{num(r.urgent_other_clients_with_valid_reason)}</span> orders from other clients in this window need a
                valid reason in the email. History cannot show the reason, so they are not counted.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="border-t border-line panel-pad" data-testid="on-time">
        <h3 className="mb-3 font-semibold">On time, same-day orders after 08:00</h3>
        <ol className="grid gap-3 sm:grid-cols-3">
          <li>
            <p className="text-sm text-ink-soft">Today</p>
            <p className="num text-[28px] font-bold text-late">{pct(ot.today, 0)}</p>
          </li>
          <li>
            <p className="text-sm text-ink-soft">With the grace period</p>
            <p className="num text-[28px] font-bold text-route-dark">{pct(ot.with_grace, 1)}</p>
          </li>
          <li>
            <p className="text-sm text-ink-soft">Plus urgent orders, at most</p>
            <p className="num text-[28px] font-bold text-route-dark">{pct(ot.with_grace_and_urgent_at_most, 1)}</p>
          </li>
        </ol>
      </div>
    </section>
  );
}

/* ---------- decision table ---------- */

function DecisionTable({ rules }: { rules: LateOrdersRule[] }) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="rules-title" data-testid="rules">
      <div className="panel-pad pb-4 sm:pb-4">
        <SectionTitle note="Applied top to bottom. Same rules here and on the Order desk">
          <span id="rules-title">Which late order goes on today’s pick list</span>
        </SectionTitle>
        <p className="-mt-1 max-w-[70ch] text-[15px] text-ink-soft">
          The AI only reads the urgency and quotes the sentence; code checks the quote is really in the email, and these rules decide.
        </p>
      </div>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[760px] border-collapse text-[15px]" aria-labelledby="rules-title">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="th pl-5 sm:pl-6">
                Received
              </th>
              <th scope="col" className="th">
                The email
              </th>
              <th scope="col" className="th">
                Client
              </th>
              <th scope="col" className="th">
                Pick list
              </th>
              <th scope="col" className="th">
                Decided by
              </th>
              <th scope="col" className="th pr-5 sm:pr-6">
                Note
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, i) => (
              <tr key={i} className="border-b border-line align-top last:border-b-0" data-testid="rule-row" data-result={rule.result}>
                <th scope="row" className="td num whitespace-nowrap pl-5 text-left font-semibold sm:pl-6">
                  {rule.when}
                </th>
                <td className="td">{rule.email}</td>
                <td className="td">{rule.client}</td>
                <td className="td">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-sm font-medium ${
                      rule.result === 'today' ? 'border-route/30 bg-route-tint text-route-dark' : 'border-late/30 bg-late-tint text-late'
                    }`}
                  >
                    {rule.result === 'today' ? 'Today' : 'Tomorrow'}
                  </span>
                </td>
                <td className="td">
                  <ActorBadge actor={rule.actor} className="whitespace-nowrap" />
                </td>
                <td className="td pr-5 text-ink-soft sm:pr-6">{rule.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- method ---------- */

function MethodNotes({ method, assumptions }: { method: string; assumptions: string[] }) {
  if (!method && assumptions.length === 0) return null;
  return (
    <section className="panel panel-pad mt-6 text-[15px] text-ink-soft" aria-label="Method and assumptions">
      <details>
        <summary className="cursor-pointer font-semibold text-route">Method and assumptions</summary>
        {method && <p className="mt-3 max-w-[80ch]">{method}</p>}
        {assumptions.length > 0 && (
          <ul className="mt-3 flex max-w-[80ch] list-disc flex-col gap-1.5 pl-5" data-testid="assumptions">
            {assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
