import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Building2, ChevronLeft, ChevronRight, Clock, Mail, MapPin, Package, Pause, Play, RotateCcw, Route, Truck, Warehouse, type LucideIcon } from 'lucide-react';
import type { DeskActor } from '../api/types';
import { ACTORS, ActorBadge } from './Actor';
import { EASE_OUT, useCountUp, useInView, useReducedMotion } from '../lib/motion';

/**
 * How it works: one order played twice at the same time, on two roads. The top road is today (orange): at
 * each station something goes wrong and the on-time points lost add up. The bottom road is with DeliveryLens
 * (teal): at the same station an agent, rule or data lookup stops the problem. It plays by itself once it is
 * on screen (about 4 seconds a station), and a presenter can pause, step back and forward, or jump to a station.
 */

interface Stage {
  label: string;
  icon: LucideIcon;
  /** What the parcel looks like when it is at this station. */
  token: LucideIcon;
  today: { title: string; text: string; points?: number };
  with: { title: string; text: string; actor?: DeskActor };
}

const STAGES: Stage[] = [
  {
    label: 'Order email',
    icon: Mail,
    token: Mail,
    today: { title: 'Typed in by hand', text: 'Emails come in 14 different layouts, and someone retypes each one into the warehouse system.' },
    with: { title: 'Order Intake Agent', actor: 'AI agent', text: 'A safety check screens the email first, then the AI reads it and fills in the order. Nothing is retyped.' },
  },
  {
    label: 'Address',
    icon: MapPin,
    token: Mail,
    today: { title: 'Shipped with half an address', text: '28% of emailed orders miss part of the address, and they go out anyway.', points: 6.9 },
    with: { title: 'Address check', actor: 'Rule', text: 'The order is held and the client is asked for the missing part before anything is picked.' },
  },
  {
    label: '08:00 pick list',
    icon: Clock,
    token: Package,
    today: { title: 'Missed the 08:00 list', text: 'A same-day order at 08:05 waits for tomorrow, and nobody tells the client.', points: 5.4 },
    with: { title: 'Promise check', actor: 'Rule', text: 'It is re-promised for tomorrow and the client is told now, so the promise is one we can keep.' },
  },
  {
    label: 'Pick & pack',
    icon: Warehouse,
    token: Package,
    today: { title: 'Nearest warehouse empty', text: 'The order ships from a warehouse up to 10 times further away.', points: 4.9 },
    with: { title: 'Stock check', actor: 'Data lookup', text: 'At intake it finds the nearest warehouse that has every item.' },
  },
  {
    label: 'Carrier',
    icon: Truck,
    token: Truck,
    today: { title: 'Cheapest carrier wins', text: 'Picked from a rate card, even on lanes where that carrier is often late.', points: 7.7 },
    with: { title: 'Carrier advisor', actor: 'Rule', text: 'Each region gets a carrier that is about 99% on time on that lane.' },
  },
  {
    label: 'The drive',
    icon: Route,
    token: Truck,
    today: { title: 'Driver goes off route', text: 'On some trips the driver drives more than 20% further than planned.', points: 3.1 },
    with: { title: 'Same road', text: 'DeliveryLens does not change the drive. This is the one step the $680K routing tool fixes.' },
  },
  {
    label: 'Client',
    icon: Building2,
    token: Package,
    today: { title: 'Late, and nobody said so', text: 'Clients find out when the parcel does not arrive, and chase: 34 complaints in 90 days.' },
    with: { title: 'Delay Alert Agent', actor: 'AI agent', text: 'If a delivery will still be late, the client gets the new date before they have to ask.' },
  },
];

const LAST = STAGES.length - 1;
const DWELL_MS = 4200;
const MOVE_MS = 750;

export default function JourneyExplainer({ onTimeToday, onTimeWith }: { onTimeToday: number; onTimeWith: number }) {
  const reduced = useReducedMotion();
  const box = useRef<HTMLElement>(null);
  const seen = useInView(box, { once: true, threshold: 0.35 });
  const visible = useInView(box, { once: false, threshold: 0.1 });
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const started = useRef(false);

  // Start once, the first time it is on screen (not for reduced motion: the presenter steps through instead).
  useEffect(() => {
    if (seen && !started.current && !reduced && import.meta.env.MODE !== 'test') {
      started.current = true;
      setPlaying(true);
    }
  }, [seen, reduced]);

  // Advance while playing and on screen; stop at the end.
  useEffect(() => {
    if (!playing || !visible) return;
    if (stage >= LAST) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setStage((s) => Math.min(LAST, s + 1)), DWELL_MS);
    return () => window.clearTimeout(t);
  }, [playing, visible, stage]);

  // On narrow screens the roads scroll sideways: keep the current station in the middle of the view.
  const roads = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = roads.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const col = el.scrollWidth / STAGES.length;
    el.scrollTo?.({ left: Math.max(0, col * (stage + 0.5) - el.clientWidth / 2), behavior: reduced ? 'auto' : 'smooth' });
  }, [stage, reduced]);

  const go = (s: number) => {
    setPlaying(false);
    setStage(Math.max(0, Math.min(LAST, s)));
  };
  const replay = () => {
    setStage(0);
    setPlaying(true);
  };

  const lost = STAGES.slice(0, stage + 1).reduce((t, s) => t + (s.today.points ?? 0), 0);
  const fixes = STAGES.slice(0, stage + 1).filter((s) => s.with.actor).length;
  const lostShown = useCountUp(lost, { ms: 700 });
  const done = stage === LAST;
  const cur = STAGES[stage];

  return (
    <section ref={box} className="panel" aria-labelledby="explainer-title" data-testid="journey-explainer" data-stage={stage}>
      <div className="panel-pad pb-0 sm:pb-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="explainer-title" className="text-lg font-semibold">
              Watch one order: today, and with DeliveryLens
            </h2>
            <p className="mt-1 max-w-[70ch] text-[15px] text-ink-soft">
              The same order travels both roads at once. On the top road something goes wrong at each station; on the bottom road DeliveryLens stops it.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Play controls">
            <IconButton label="Previous station" onClick={() => go(stage - 1)} disabled={stage === 0} icon={ChevronLeft} />
            {done ? (
              <IconButton label="Play again" onClick={replay} icon={RotateCcw} wide />
            ) : (
              <IconButton label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)} icon={playing ? Pause : Play} wide />
            )}
            <IconButton label="Next station" onClick={() => go(stage + 1)} disabled={done} icon={ChevronRight} />
          </div>
        </div>
      </div>

      <div ref={roads} className="mt-5 overflow-x-auto px-5 sm:px-6" tabIndex={0} role="region" aria-label="The two roads">
        <div className="min-w-[760px]">
          <Lane
            kind="today"
            stage={stage}
            reduced={reduced}
            title="Today"
            meter={
              <>
                <span className="num font-bold text-late">−{lostShown.toFixed(1)}</span> on-time points lost
              </>
            }
          />
          <Lane
            kind="with"
            stage={stage}
            reduced={reduced}
            title="With DeliveryLens"
            meter={
              <>
                <span className="num font-bold text-route-dark">{fixes}</span> {fixes === 1 ? 'problem' : 'problems'} stopped
              </>
            }
          />
          <StationTabs stage={stage} onPick={go} />
        </div>
      </div>

      <div className="panel-pad pt-4 sm:pt-4" aria-live="polite">
        <p className="mb-2 text-sm text-slate">
          Station {stage + 1} of {STAGES.length}: <span className="font-semibold text-ink">{cur.label}</span>
        </p>
        <div key={stage} className="grid gap-3 sm:grid-cols-2" style={reduced ? undefined : { animation: `rise 320ms ${EASE_OUT} both` }}>
          <div className="rounded-md border border-late/30 bg-late-tint px-4 py-3">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold text-late">
              <span>Today</span>
              {cur.today.points != null && <span className="num">−{cur.today.points.toFixed(1)} on-time points</span>}
            </p>
            <p className="mt-1 font-semibold text-ink">{cur.today.title}</p>
            <p className="text-[15px] text-ink-soft">{cur.today.text}</p>
          </div>
          <div className={`rounded-md border px-4 py-3 ${cur.with.actor ? 'border-route/30 bg-route-tint' : 'border-line bg-paper'}`}>
            <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm font-semibold text-route-dark">
              <span>With DeliveryLens</span>
              {cur.with.actor && <ActorBadge actor={cur.with.actor} />}
            </p>
            <p className="mt-1 font-semibold text-ink">{cur.with.title}</p>
            <p className="text-[15px] text-ink-soft">{cur.with.text}</p>
          </div>
        </div>

        {done && <Outcome today={onTimeToday} withDl={onTimeWith} reduced={reduced} />}
      </div>
    </section>
  );
}

function IconButton({ label, onClick, icon: Icon, disabled, wide }: { label: string; onClick: () => void; icon: LucideIcon; disabled?: boolean; wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-line bg-surface text-ink transition-colors hover:border-route hover:text-route-dark disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink ${
        wide ? 'px-3.5 font-semibold' : 'w-10'
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {wide && <span>{label}</span>}
    </button>
  );
}

/**
 * One road: the stations in a row, the road filling in behind the parcel, and the parcel itself.
 * The parcel sits in a box one station wide and moves by translateX(stage × 100%), so it lands exactly on each
 * station whatever the width.
 */
function Lane({ kind, stage, reduced, title, meter }: { kind: 'today' | 'with'; stage: number; reduced: boolean; title: string; meter: ReactNode }) {
  const today = kind === 'today';
  const n = STAGES.length;
  const Token = STAGES[stage].token;
  const move = reduced ? 'none' : `transform ${MOVE_MS}ms ${EASE_OUT}`;
  return (
    <div className="mb-4" data-testid={`lane-${kind}`}>
      <div className="sticky left-0 mb-5 flex w-fit flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h3 className={`flex items-center gap-2 font-semibold ${today ? 'text-late' : 'text-route-dark'}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${today ? 'bg-late' : 'bg-route'}`} aria-hidden="true" />
          {title}
        </h3>
        <p className="text-sm text-ink-soft">{meter}</p>
      </div>

      <div className="relative" aria-hidden="true">
        {/* road: grey all the way, coloured up to the parcel */}
        <div className="absolute top-[22px] h-[4px] rounded-full bg-slate-light" style={{ left: `${50 / n}%`, right: `${50 / n}%` }} />
        <div
          className={`absolute top-[22px] h-[4px] origin-left rounded-full ${today ? 'bg-late' : 'bg-route'}`}
          style={{ left: `${50 / n}%`, right: `${50 / n}%`, transform: `scaleX(${stage / (n - 1)})`, transition: move }}
        />

        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {STAGES.map((s, i) => (
            <Station key={s.label} s={s} i={i} stage={stage} today={today} />
          ))}
        </ol>

        {/* the parcel */}
        <div className="pointer-events-none absolute left-0 top-0 h-[48px]" style={{ width: `${100 / n}%`, transform: `translateX(${stage * 100}%)`, transition: move }}>
          <div className="flex h-full items-start justify-center">
            <span
              className={`-mt-3.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-white shadow-[0_2px_6px_rgba(21,33,43,0.25)] ${
                today ? 'bg-late' : 'bg-route'
              }`}
            >
              <Token className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Station({ s, i, stage, today }: { s: Stage; i: number; stage: number; today: boolean }) {
  const Icon = s.icon;
  const reached = i <= stage;
  const here = i === stage;
  const tone = today ? 'late' : 'route';
  // What this station left behind on this road once the parcel has passed it.
  const actor = s.with.actor ? ACTORS[s.with.actor] : null;
  return (
    <li className="flex flex-col items-center px-1 text-center">
      <span
        className={`relative z-10 mt-[6px] inline-flex h-9 w-9 items-center justify-center rounded-full border-2 bg-surface transition-colors duration-300 ${
          here ? (tone === 'late' ? 'border-late text-late' : 'border-route text-route-dark') : reached ? 'border-ink/70 text-ink' : 'border-line text-slate'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className={`mt-1.5 text-sm leading-tight ${reached ? 'font-semibold text-ink' : 'text-slate'}`}>{s.label}</span>
      <span className="mt-1 flex h-6 items-center">
        {reached &&
          (today ? (
            s.today.points != null ? (
              <Chip className="border-late/40 bg-late-tint text-late">−{s.today.points.toFixed(1)}</Chip>
            ) : i === LAST ? (
              <Chip className="border-late/40 bg-late-tint text-late">late</Chip>
            ) : null
          ) : actor ? (
            <Chip className={actor.badge}>
              <actor.icon className="h-3 w-3" />
              {s.with.actor === 'AI agent' ? 'AI' : s.with.actor === 'Data lookup' ? 'Data' : s.with.actor}
            </Chip>
          ) : (
            <Chip className="border-line bg-paper text-slate">no change</Chip>
          ))}
      </span>
    </li>
  );
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`num inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold ${className}`} style={{ animation: `rise 260ms ${EASE_OUT} both` }}>
      {children}
    </span>
  );
}

function StationTabs({ stage, onPick }: { stage: number; onPick: (s: number) => void }) {
  return (
    <div className="grid border-t border-line pt-2" style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))` }} role="group" aria-label="Jump to a station">
      {STAGES.map((s, i) => (
        <button
          key={s.label}
          type="button"
          onClick={() => onPick(i)}
          aria-current={i === stage ? 'step' : undefined}
          className={`mx-1 rounded py-1 text-2xs font-semibold transition-colors ${i === stage ? 'bg-ink text-white' : 'text-slate hover:bg-paper hover:text-ink'}`}
        >
          {i + 1}. {s.label}
        </button>
      ))}
    </div>
  );
}

/** The end of the trip: how many of every 100 orders arrive on time on each road. */
function Outcome({ today, withDl, reduced }: { today: number; withDl: number; reduced: boolean }) {
  const t = useCountUp(Math.round(today * 100), { ms: 1100 });
  const w = useCountUp(Math.round(withDl * 100), { ms: 1400 });
  return (
    <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2" data-testid="explainer-outcome" style={reduced ? undefined : { animation: `rise 400ms ${EASE_OUT} both` }}>
      <OutcomeBar label="Today" value={t} tone="late" />
      <OutcomeBar label="With DeliveryLens (realistic plan)" value={w} tone="route" />
      <p className="text-sm text-slate sm:col-span-2">
        Out of every 100 orders, how many arrive on time. The realistic plan assumes each fix works only part of the time, and the drive itself is unchanged.
      </p>
    </div>
  );
}

function OutcomeBar({ label, value, tone }: { label: string; value: number; tone: 'late' | 'route' }) {
  const v = Math.round(value);
  return (
    <div>
      <p className="flex items-baseline justify-between text-[15px]">
        <span className="font-semibold text-ink">{label}</span>
        <span className={`num text-[28px] font-bold leading-none ${tone === 'late' ? 'text-late' : 'text-route-dark'}`}>
          {v} <span className="text-[15px] font-semibold">in 100 on time</span>
        </span>
      </p>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-light">
        <div className={`h-full origin-left rounded-full ${tone === 'late' ? 'bg-late' : 'bg-route'}`} style={{ transform: `scaleX(${value / 100})` }} />
      </div>
    </div>
  );
}
