import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Mail } from 'lucide-react';
import type { DeskActor, DeskStep } from '../api/types';
import { EASE_OUT, useInView, useReducedMotion } from '../lib/motion';
import { Client, Truck, TripMap, Warehouse } from './TripArt';

/**
 * Order desk run playback: an envelope travels down the pipeline trace and each step lights up in its
 * actor colour as the envelope reaches it. Unit tests and reduced motion show the final state at once.
 */

/* ---------- playback ---------- */

export interface Playback {
  /** Index of the step the envelope is at (-1 before it starts). */
  active: number;
  /** How many steps have finished (are lit). */
  revealed: number;
  /** Duration of the envelope's current hop, ms. */
  hopMs: number;
  /** The envelope passed a failed step: it is orange from here. */
  late: boolean;
  /** The run ended at a failed step (the envelope stays there). */
  stopped: boolean;
  done: boolean;
  /** False when everything is shown at once (tests, reduced motion). */
  animated: boolean;
  skip: () => void;
  /** Plays the run again from the first step. */
  replay: () => void;
}

const START_MS = 250;
const HOP_MS = 360;
const HOP_SKIPPED_MS = 160;
/** Extra time the envelope waits at a step before it lights: AI steps take visibly longer. */
const DWELL_MS: Record<DeskActor, number> = { 'AI agent': 260, Rule: 100, 'Data lookup': 100, Guardrail: 140 };
const SETTLE_MS = 100;

/** Where the envelope stops: the first failed step, when nothing after it runs (only skipped or failed steps follow). */
export function stopIndex(steps: DeskStep[]): number {
  const fail = steps.findIndex((s) => s.status === 'fail');
  if (fail < 0) return -1;
  return steps.slice(fail + 1).some((s) => s.status !== 'skipped' && s.status !== 'fail') ? -1 : fail;
}

export function useTracePlayback(steps: DeskStep[], containerRef: RefObject<Element>): Playback {
  const reduced = useReducedMotion();
  const animated = !reduced && import.meta.env.MODE !== 'test';
  const inView = useInView(containerRef, { once: true, threshold: 0.1 });
  const n = steps.length;
  const stop = stopIndex(steps);
  const final = { active: stop >= 0 ? stop : n - 1, revealed: n, hopMs: HOP_MS, late: steps.some((s) => s.status === 'fail'), stopped: stop >= 0, done: true };
  const [state, setState] = useState(animated ? { active: -1, revealed: 0, hopMs: HOP_MS, late: false, stopped: false, done: false } : final);
  const timers = useRef<number[]>([]);
  const [round, setRound] = useState(0);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  useEffect(() => {
    if (!animated) {
      setState(final);
      return;
    }
    setState({ active: -1, revealed: 0, hopMs: HOP_MS, late: false, stopped: false, done: false });
    if (!inView) return;
    clear();
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    let t = START_MS;
    let late = false;
    steps.forEach((s, i) => {
      if (stop >= 0 && i > stop) {
        // The run ended: the remaining (skipped) steps settle in quietly.
        t += 60;
        at(t, () => setState((p) => ({ ...p, revealed: i + 1 })));
        return;
      }
      const skipped = s.status === 'skipped';
      const hop = skipped ? HOP_SKIPPED_MS : HOP_MS;
      at(t, () => setState((p) => ({ ...p, active: i, hopMs: hop })));
      t += hop + (skipped ? 0 : DWELL_MS[s.actor] ?? 100);
      if (s.status === 'fail') late = true;
      const lateNow = late;
      at(t, () => setState((p) => ({ ...p, revealed: i + 1, late: lateNow, stopped: i === stop })));
      t += skipped ? 20 : SETTLE_MS;
    });
    at(t + 150, () => setState((p) => ({ ...p, done: true })));
    return clear;
    // `steps` identity is the run; the rest derives from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, animated, inView, round]);

  return {
    ...state,
    animated,
    skip: () => {
      clear();
      setState(final);
    },
    replay: () => setRound((r) => r + 1),
  };
}

/* ---------- envelope ---------- */

/** The order travelling down the step rail. Decorative: the steps themselves carry the state. */
export function Envelope({ y, hopMs, late, visible }: { y: number | null; hopMs: number; late: boolean; visible: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-testid="trace-envelope"
      className={`pointer-events-none absolute left-0 top-0 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors duration-200 ${
        late ? 'border-late/50 bg-late-tint text-late' : 'border-line bg-surface text-ink'
      }`}
      style={{
        transform: `translateY(${y ?? 0}px)`,
        opacity: visible && y != null ? 1 : 0,
        transition: `transform ${hopMs}ms ${EASE_OUT}, opacity 250ms ${EASE_OUT}, background-color 200ms, color 200ms, border-color 200ms`,
      }}
    >
      <Mail className="h-3.5 w-3.5" strokeWidth={2.25} />
    </span>
  );
}

/** Track the vertical offset of each step (its dot) inside the list, re-measured when the list changes size. */
export function useStepOffsets(listRef: RefObject<HTMLElement>, deps: unknown[]): number[] {
  const [offsets, setOffsets] = useState<number[]>([]);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const rows = Array.from(list.querySelectorAll<HTMLElement>(':scope > [data-testid="trace-step"]'));
      const next = rows.map((r) => r.offsetTop);
      setOffsets((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return offsets;
}

/* ---------- lighting up ---------- */

const RING: Record<DeskActor, string> = {
  'AI agent': 'border-ai text-ai',
  Rule: 'border-route text-route',
  'Data lookup': 'border-data text-data',
  Guardrail: 'border-guard text-guard',
};

/** Pending dot: hollow; while the envelope is at it, the outline takes the actor colour. */
export function pendingDotClass(actor: DeskActor, working: boolean): string {
  return working ? `border-2 bg-surface ${RING[actor] ?? RING.Rule}` : 'border-2 border-line bg-surface text-slate';
}

/** Runs a short scale-in plus a single fading halo when `lit` turns true (once, no loop). */
export function useLightUp(dot: RefObject<HTMLElement>, halo: RefObject<HTMLElement>, lit: boolean, animated: boolean) {
  const was = useRef(lit);
  useEffect(() => {
    if (lit && !was.current && animated) {
      dot.current?.animate?.([{ transform: 'scale(0.7)' }, { transform: 'scale(1)' }], { duration: 220, easing: EASE_OUT });
      halo.current?.animate?.(
        [
          { transform: 'scale(1)', opacity: 0.45 },
          { transform: 'scale(1.75)', opacity: 0 },
        ],
        { duration: 250, easing: EASE_OUT, fill: 'forwards' },
      );
    }
    was.current = lit;
  }, [lit, animated, dot, halo]);
}

/** Opens its content smoothly (height and opacity) when it mounts, so the steps below glide down. */
export function GrowIn({ children, animated }: { children: ReactNode; animated: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !animated || !el.animate) return;
    const h = el.scrollHeight;
    el.animate(
      [
        { height: '0px', opacity: 0 },
        { height: `${h}px`, opacity: 1 },
      ],
      { duration: 300, easing: EASE_OUT },
    );
  }, [animated]);
  return (
    <div ref={ref} className="overflow-hidden">
      {children}
    </div>
  );
}

/* ---------- mini trips ---------- */

const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x : null);
const numOrNull = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const obj = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);

export interface StockTripInfo {
  nearest: string;
  from: string;
  moved: boolean;
  region: string | null;
}

/** Step 7 details, live (`nearest_warehouse_id`, `fulfilment_warehouse_id`) or sample (`nearest_warehouse`, `fulfilment_warehouse`). */
export function parseStockTrip(details: Record<string, unknown> | null | undefined): StockTripInfo | null {
  const d = details ?? {};
  const nearest = str(d.nearest_warehouse_id) ?? str(d.nearest_warehouse);
  const from = str(d.fulfilment_warehouse_id) ?? str(d.fulfilment_warehouse);
  if (!nearest || !from) return null;
  return { nearest, from, moved: nearest !== from, region: str(d.destination_region) };
}

export interface CarrierTripInfo {
  name: string;
  onTime: number | null;
  region: string | null;
}

/** Step 8 details, live (`advisor_pick`) or sample (`advisor_choice`). */
export function parseCarrierTrip(details: Record<string, unknown> | null | undefined): CarrierTripInfo | null {
  const d = details ?? {};
  const pick = obj(d.advisor_pick);
  const id = str(pick?.carrier_id) ?? str(d.advisor_choice);
  if (!id) return null;
  return { name: str(pick?.carrier_name) ?? `Carrier ${id}`, onTime: numOrNull(pick?.on_time_rate), region: str(d.region) };
}

const clientLabel = (region: string | null) => (region ? `${region} client` : 'Client');
const SHORT_WAY = 'M58 58 H206';
const LONG_WAY = 'M38 58 C70 58 84 12 134 12 S194 58 212 58';
/** Crops the empty sky above a flat trip (TripMap draws a 280 x 86 scene). */
const FLAT_VIEW = '0 24 280 62';

/** Step 7: which warehouse ships it. Nearest in stock: a short teal drive. Nearest empty: an orange long way round. */
export function StockTrip({ info, region }: { info: StockTripInfo; region: string | null }) {
  const where = clientLabel(info.region ?? region);
  return (
    <div className="mt-2 max-w-[380px]" data-testid="trip-stock">
      {info.moved ? (
        <TripMap label={`Nearest warehouse ${info.nearest} has no stock, so the order ships the long way from ${info.from} to the client.`}>
          <path d={LONG_WAY} className="stroke-late" strokeWidth="3" fill="none" strokeLinecap="round" />
          <Warehouse x={22} label={`Ships from ${info.from}`} mark="stocked" />
          <Warehouse x={140} label={`Nearest ${info.nearest}: empty`} mark="empty" />
          <Client x={258} label={where} />
          <Truck path={LONG_WAY} tone="late" dur={1.8} loop={false} />
        </TripMap>
      ) : (
        <TripMap viewBox={FLAT_VIEW} label={`In stock at the nearest warehouse, ${info.from}; a short trip to the client.`}>
          <path d={SHORT_WAY} className="stroke-route" strokeWidth="2.5" strokeDasharray="5 4" fill="none" />
          <Warehouse x={40} label={`${info.from}: in stock`} mark="stocked" />
          <Client x={240} label={where} />
          <Truck path={SHORT_WAY} tone="route" dur={1.2} loop={false} />
        </TripMap>
      )}
    </div>
  );
}

/** Step 8: the carrier the advisor picked, with its on-time rate on this lane when the API gives it. */
export function CarrierTrip({ info, from }: { info: CarrierTripInfo; from: string | null }) {
  const pct = info.onTime != null ? `${Math.round(info.onTime * 100)}% on time` : null;
  return (
    <div className="mt-2 max-w-[380px]" data-testid="trip-carrier">
      <TripMap viewBox={FLAT_VIEW} label={`${info.name} drives the order${from ? ` from ${from}` : ''} to the client${pct ? `, ${pct} on this lane` : ''}.`}>
        <path d={SHORT_WAY} className="stroke-route" strokeWidth="2.5" strokeDasharray="5 4" fill="none" />
        <Warehouse x={40} label={from ?? 'Warehouse'} />
        <Client x={240} label={clientLabel(info.region)} />
        <text x={132} y={36} textAnchor="middle" className="fill-route-dark text-[11px] font-semibold">
          {info.name}
          {pct && <tspan className="fill-slate font-medium">{` · ${pct}`}</tspan>}
        </text>
        <Truck path={SHORT_WAY} tone="route" dur={1.3} loop={false} />
      </TripMap>
    </div>
  );
}
