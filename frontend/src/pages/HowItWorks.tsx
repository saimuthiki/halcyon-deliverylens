import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import type { DeskActor } from '../api/types';
import { useApi } from '../lib/useApi';
import { pct, usd } from '../lib/format';
import PageHeader, { SectionTitle } from '../components/PageHeader';
import { SourceTag } from '../components/States';
import { ACTORS, ACTOR_ORDER } from '../components/Actor';

type Mode = 'today' | 'with';

interface Cause {
  label: string;
  points: number;
}

interface Act {
  name: string;
  actor: DeskActor;
  to: string;
  does: string;
}

interface Step {
  n: number;
  title: string;
  today: string;
  /** How the step reads once DeliveryLens is in place (defaults to `today`). */
  with?: string;
  who: string;
  cause?: Cause;
  acts?: Act[];
  /** The $680K routing tool changes this step. */
  routing?: boolean;
}

const STEPS: Step[] = [
  {
    n: 1,
    title: 'Client sends an order',
    today: 'By EDI, API or email. Emails come in 14 different layouts.',
    with: 'Same three ways in. Every email is safety-checked and read by the AI.',
    who: 'Client',
    acts: [
      { name: 'Safety check', actor: 'Guardrail', to: '/order-desk', does: 'Stops emails that try to instruct the AI' },
      { name: 'Order Intake Agent', actor: 'AI agent', to: '/order-desk', does: 'Reads the email and pulls out the order' },
    ],
  },
  {
    n: 2,
    title: 'Order enters the WMS',
    today: 'EDI and API flow in. Emails are typed in by hand; 28% arrive with part of the address missing.',
    with: 'Nothing typed by hand. An incomplete address is held and the client asked, before picking.',
    who: 'Order desk staff',
    cause: { label: 'Incomplete address', points: 6.9 },
    acts: [{ name: 'Address check', actor: 'Rule', to: '/order-desk', does: 'Holds orders missing street, city, state or postcode' }],
  },
  {
    n: 3,
    title: '08:00 pick list',
    today: 'Each warehouse prints its list at 08:00. A same-day order at 08:05 waits a day.',
    with: 'Same-day after 08:00 is re-promised for tomorrow, and the client is told now.',
    who: 'Warehouse',
    cause: { label: 'Same-day after 08:00', points: 5.4 },
    acts: [{ name: 'Promise check', actor: 'Rule', to: '/order-desk', does: 'Flags same-day orders after the 08:00 cutoff' }],
  },
  {
    n: 4,
    title: 'Pick & pack',
    today: 'At the warehouse holding stock. If the nearest is empty, the order travels up to 10× further.',
    with: 'Stock is checked at intake; regions that run out most are shown for rebalancing.',
    who: 'Warehouse',
    cause: { label: 'Stock not at nearest warehouse', points: 4.9 },
    acts: [{ name: 'Stock check', actor: 'Data lookup', to: '/stock-routes', does: 'Finds which warehouse has the stock' }],
  },
  {
    n: 5,
    title: 'Carrier chosen',
    today: 'From a rate card and a spreadsheet, so the cheapest usually wins.',
    with: 'Weak lanes avoided: each region gets a carrier that is about 99% on time.',
    who: 'Transport planner',
    cause: { label: 'Weak carrier on a lane', points: 7.7 },
    acts: [{ name: 'Carrier advisor', actor: 'Rule', to: '/carriers', does: 'Picks a strong carrier for the region' }],
  },
  {
    n: 6,
    title: 'Carrier collects',
    today: 'Between 14:00 and 18:00 at the warehouse dock.',
    who: 'Carrier',
  },
  {
    n: 7,
    title: 'Delivery drive',
    today: 'The driver follows the planned route, or goes more than 20% beyond it.',
    who: 'Carrier',
    cause: { label: 'Route deviation', points: 3.1 },
    routing: true,
  },
  {
    n: 8,
    title: 'Late?',
    today: '71 of every 100 arrive on time. Nobody tells the client about the rest.',
    with: 'When a delivery will be late, the client gets a message with the new date first.',
    who: 'Carrier',
    acts: [{ name: 'Delay Alert Agent', actor: 'AI agent', to: '/why-late', does: 'Drafts a delay message before the client chases' }],
  },
  {
    n: 9,
    title: 'Client chases',
    today: '34 complaints in 90 days; 12 say “nobody told us it would be late”.',
    with: 'Fewer chases: the client already has the new date.',
    who: 'Client',
  },
  {
    n: 10,
    title: 'Customer success',
    today: 'Re-delivery, penalties and complaints take 64% of the team’s week.',
    with: 'Managers ask questions of the data in plain English instead of building reports.',
    who: 'Customer success',
    acts: [{ name: 'Ask DeliveryLens', actor: 'AI agent', to: '/ask', does: 'Answers questions from the analysis' }],
  },
];

const PHASES = [
  { label: 'Order comes in', from: 1, to: 2 },
  { label: 'Warehouse', from: 3, to: 4 },
  { label: 'Transport', from: 5, to: 7 },
  { label: 'After delivery', from: 8, to: 10 },
];

const START_HERE: { to: string; title: string; line: string }[] = [
  { to: '/how-it-works', title: 'How it works', line: 'You are here: the process, the causes and where we act.' },
  { to: '/overview', title: 'Overview', line: 'The headline: 71% today, 90.2% with the realistic plan, 80.2% with the vendor alone.' },
  { to: '/why-late', title: 'Why deliveries are late', line: 'The five causes, with real late deliveries behind each one.' },
  { to: '/order-desk', title: 'Order desk (live)', line: 'Watch the agents read 12 client emails and create warehouse orders, step by step.' },
  { to: '/carriers', title: 'Carriers', line: 'The seven weak carrier lanes, and the carrier to use instead.' },
  { to: '/vendor', title: 'Vendor decision', line: 'What the $680K routing tool buys, and the business case for each option.' },
  { to: '/what-if', title: 'What-if simulator', line: 'Change how well each fix works and see where on-time delivery lands.' },
  { to: '/clients', title: 'At-risk clients', line: 'The nine clients worth $14.2M a year who may leave, and why.' },
  { to: '/ask', title: 'Ask DeliveryLens', line: 'Ask your own question about the data in plain English.' },
];

export default function HowItWorks() {
  const [mode, setMode] = useState<Mode>('today');
  const kpis = useApi(() => api.kpis());
  const k = kpis.data;
  const onTime = k?.on_time_rate ?? 0.71;
  const bench = k?.benchmark_on_time_rate ?? 0.94;
  const atRisk = k?.at_risk_revenue_usd ?? 14_200_000;

  return (
    <>
      <PageHeader
        title="How an order travels, where it goes late, and where DeliveryLens steps in"
        lede="Follow one order from the client’s email to the doorstep. The amber markers show where the five causes of lateness hit; switch to “With DeliveryLens” to see which agent or rule acts at each step."
        aside={<SourceTag source={kpis.source} />}
      />

      <div className="flex flex-col gap-6">
        <section className="panel panel-pad" aria-labelledby="problem-title">
          <h2 id="problem-title" className="text-lg font-semibold">
            The problem in one sentence
          </h2>
          <p className="mt-2 max-w-[78ch] text-[17px] leading-relaxed text-ink">
            Halcyon delivers only {Math.round(onTime * 100)} of every 100 orders on time, good companies manage {Math.round(bench * 100)}, and the
            clients who say they will leave are worth {usd(atRisk)} a year; leadership plans to buy a $680K routing tool, but most lateness starts
            before the truck leaves.
          </p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-3" data-testid="problem-numbers">
            <Figure value={pct(onTime, 0)} label="On time today" note="Delivered on or before the promised date" tone="late" />
            <Figure value={pct(bench, 0)} label="Industry benchmark" note="What good logistics companies reach" />
            <Figure value={usd(atRisk)} label="Revenue at risk per year" note={`${k?.at_risk_clients ?? 9} clients threatening to leave`} tone="late" />
          </dl>
        </section>

        <section className="panel" aria-labelledby="journey-title">
          <div className="panel-pad pb-0 sm:pb-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 id="journey-title" className="text-lg font-semibold">
                  The client’s order journey
                </h2>
                <p className="mt-1 max-w-[70ch] text-[15px] text-ink-soft">
                  {mode === 'today'
                    ? 'How it runs today. Amber markers show the points of on-time delivery each cause costs.'
                    : 'With DeliveryLens. Each badge is something we run at that step; select it to see it working.'}
                </p>
              </div>
              <div role="group" aria-label="Show the journey" className="inline-flex shrink-0 rounded-md border border-line bg-paper p-1">
                {(
                  [
                    ['today', 'Today'],
                    ['with', 'With DeliveryLens'],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                    className={`min-h-[36px] rounded px-3 text-[15px] font-semibold transition-colors ${
                      mode === m ? 'bg-surface text-route-dark shadow-sm ring-1 ring-line' : 'text-ink-soft hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-sm text-slate 2xl:hidden">Scroll sideways to see all 10 steps.</p>
          </div>

          <div className="mt-4 overflow-x-auto pb-5" tabIndex={0} role="region" aria-label="Order journey, 10 steps">
            <div
              className="grid min-w-[1080px] grid-cols-10 gap-x-2 px-5 sm:px-6"
              data-testid="process-map"
              data-mode={mode}
              style={{ gridTemplateRows: 'auto auto auto auto auto' }}
            >
              {/* Row 1: phase bands */}
              {PHASES.map((p) => (
                <div
                  key={p.label}
                  aria-hidden="true"
                  className="border-b-2 border-ink/80 pb-1 text-sm font-semibold text-ink"
                  style={{ gridColumn: `${p.from} / ${p.to + 1}`, gridRow: 1 }}
                >
                  {p.label}
                </div>
              ))}
              {STEPS.map((s) => (
                <StepColumn key={s.n} step={s} mode={mode} />
              ))}
              {/* Routing tool bracket under the road */}
              {STEPS.filter((s) => s.routing).map((s) => (
                <div key={`routing-${s.n}`} style={{ gridColumn: `${s.n} / ${s.n + 1}`, gridRow: 5 }}>
                  <div className="mt-2 rounded-md border-2 border-dashed border-slate px-2 py-1.5 text-sm leading-snug text-ink" data-testid="routing-tool">
                    <span className="font-semibold">$680K routing tool</span> acts only here: the road.
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-line px-5 py-3 text-sm text-ink-soft sm:px-6">
            The five causes cost 28.0 of the 29.0 points lost; the routing tool reaches only route deviation (3.1 pts). Carrier choice (7.7 pts) is fixed by
            changing the carrier spreadsheet, with no new software.
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="panel panel-pad" aria-labelledby="legend-title">
            <SectionTitle>
              <span id="legend-title">Who does the work at each step</span>
            </SectionTitle>
            <ul className="flex flex-col gap-4" data-testid="legend">
              {ACTOR_ORDER.map((a) => {
                const m = ACTORS[a];
                const Icon = m.icon;
                return (
                  <li key={a} className="flex gap-3">
                    <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${m.badge}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <div className="font-semibold">{m.label}</div>
                      <p className="text-[15px] text-ink-soft">{m.why}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-5 rounded-md bg-paper px-4 py-3 text-[15px] text-ink">
              <span className="font-semibold">Why split it this way?</span> AI is good at language: reading a messy email, writing a polite reply. It is
              not trusted with arithmetic or decisions. Cutoffs, carrier choice and the final accept-or-hold are rules and data, so the same order always gets
              the same answer and anyone can check why.
            </p>
          </section>

          <section className="panel panel-pad" aria-labelledby="start-title">
            <SectionTitle>
              <span id="start-title">Start here</span>
            </SectionTitle>
            <ol className="flex flex-col" data-testid="start-here">
              {START_HERE.map((p, i) => (
                <li key={p.to} className="border-b border-line last:border-b-0">
                  <Link to={p.to} className="group flex items-start gap-3 rounded-md py-2.5 hover:bg-paper" aria-current={i === 0 ? 'page' : undefined}>
                    <span className="num mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-ink group-hover:text-route-dark">{p.title}</span>
                      <span className="block text-[15px] text-ink-soft">{p.line}</span>
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate group-hover:text-route" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}

function Figure({ value, label, note, tone }: { value: string; label: string; note: string; tone?: 'late' }) {
  return (
    <div className="border-l-4 pl-4" style={{ borderColor: tone === 'late' ? '#A84F0B' : '#0E6B63' }}>
      <dt className="text-[15px] text-ink-soft">{label}</dt>
      <dd className={`num text-[34px] font-bold leading-tight ${tone === 'late' ? 'text-late' : 'text-route-dark'}`}>{value}</dd>
      <dd className="text-sm text-slate">{note}</dd>
    </div>
  );
}

function StepColumn({ step: s, mode }: { step: Step; mode: Mode }) {
  const withMode = mode === 'with';
  return (
    <>
      {/* Row 2: DeliveryLens lane */}
      <div className="pt-3" style={{ gridColumn: `${s.n} / ${s.n + 1}`, gridRow: 2 }}>
        {withMode && s.acts && (
          <div className="flex flex-col gap-1.5">
            {s.acts.map((a) => {
              const m = ACTORS[a.actor];
              const Icon = m.icon;
              return (
                <Link
                  key={a.name}
                  to={a.to}
                  data-testid="act-badge"
                  title={a.does}
                  className={`block rounded-md border px-2 py-1.5 text-sm leading-tight transition-colors hover:brightness-95 ${m.badge}`}
                >
                  <span className="flex items-center gap-1 font-semibold">
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{a.name}</span>
                  </span>
                  <span className="mt-0.5 block text-2xs opacity-90">{a.actor}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Row 3: the station on the line, and the step card */}
      <div
                style={{ gridColumn: `${s.n} / ${s.n + 1}`, gridRow: 3 }}
        data-testid="process-step"
        role="group"
        aria-label={`Step ${s.n}: ${s.title}`}
      >
        <div className="relative mt-3 flex items-center" aria-hidden="true">
          <span className={`absolute inset-x-[-4px] top-1/2 h-[3px] -translate-y-1/2 ${s.cause ? 'bg-late' : 'bg-slate/50'}`} />
          <span
            className={`num relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
              s.cause ? 'bg-late text-white' : 'border-2 border-slate/60 bg-surface text-ink'
            }`}
          >
            {s.n}
          </span>
        </div>
        <h3 className="mt-2 text-[15px] font-semibold leading-snug">{s.title}</h3>
        <p className="mt-1 text-sm leading-snug text-ink-soft">{withMode && s.with ? s.with : s.today}</p>
        <p className="mt-1.5 text-2xs text-slate">{s.who}</p>
      </div>

      {/* Row 4: where it goes late */}
      <div style={{ gridColumn: `${s.n} / ${s.n + 1}`, gridRow: 4 }}>
        {s.cause && (
          <div className="mt-3 rounded-md border border-late/40 bg-late-tint px-2 py-1.5" data-testid="cause-marker">
            <div className="num text-[15px] font-bold text-late">−{s.cause.points.toFixed(1)} pts</div>
            <div className="text-sm leading-tight text-ink">{s.cause.label}</div>
          </div>
        )}
      </div>
    </>
  );
}
