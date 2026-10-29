import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { CauseKey, CauseRow, WrongWarehouse } from '../api/types';
import { num } from '../lib/format';
import { useInView, useReducedMotion } from '../lib/motion';
import { MAP_W, SPOTS, US_BORDERS, US_LAND } from './usMap';

/**
 * How it works: the same order on two US maps, side by side. Left is today (orange), right is with
 * DeliveryLens (teal). Six real cases play in a loop; for each one the camera moves to the region, the order
 * email arrives, and the trucks drive the roads at the same speed, so a longer or delayed trip visibly arrives
 * later. Pauses when off screen; reduced motion shows the end of each case with no movement.
 */

type Spot = keyof typeof SPOTS;
type Wh = 'W1' | 'W2' | 'W3' | 'W4' | 'W5';
type Tone = 'late' | 'route' | 'ai' | 'data' | 'neutral';

interface Badge {
  at: Spot;
  start: number;
  end?: number;
  text: string;
  tone: Tone;
}
interface Message {
  from: Spot;
  to: Spot;
  start: number;
  dur: number;
}
interface Side {
  from: Wh;
  marks?: Partial<Record<Wh, 'empty' | 'stocked'>>;
  badges: Badge[];
  messages?: Message[];
  depart: number;
  /** 1 = normal truck speed. */
  speed?: number;
  /** Stops on the way: at this share of the trip, for this long. */
  stop?: { at: number; ms: number };
  detour?: boolean;
  /** Arrives, cannot deliver, drives back part of the way. */
  turnBack?: boolean;
  late: boolean;
  result: string;
  text: string;
}
interface Scene {
  title: string;
  stat: (d: Stats) => string | null;
  client: Spot;
  nearest: Wh;
  /** Show the Late / On time tag under the client (when a warehouse sits just above it). */
  resultBelow?: boolean;
  /** Camera: left, top, width of the map shown (height follows the 960 x 600 ratio). */
  cam: [number, number, number];
  today: Side;
  with: Side;
}

interface Stats {
  causes: Partial<Record<CauseKey, CauseRow>>;
  wrong?: WrongWarehouse | null;
}

const ORDER_MS = 900;
const SCENE_MS = 9000;
/** Map units per millisecond at normal speed. */
const SPEED = 0.16;
/** Marks and labels are drawn this much larger than map units at full zoom, so they read at card size. */
const UI = 1.7;

const WH_LABEL: Record<Wh, string> = { W1: 'Midwest 1', W2: 'Midwest 2', W3: 'Southeast', W4: 'Northeast', W5: 'West' };
const causeStat = (key: CauseKey) => (d: Stats) => {
  const c = d.causes[key];
  return c ? `In the data: ${num(c.deliveries)} deliveries had this problem, and only ${Math.round(c.on_time_rate * 100)} in 100 arrived on time.` : null;
};

const SCENES: Scene[] = [
  {
    title: 'The nearest warehouse is out of stock',
    stat: causeStat('stock_not_at_nearest'),
    client: 'westClient',
    nearest: 'W5',
    resultBelow: true,
    cam: [-70, 30, 1080],
    today: {
      from: 'W1',
      marks: { W5: 'empty' },
      badges: [{ at: 'W5', start: ORDER_MS, text: 'Out of stock', tone: 'late' }],
      depart: ORDER_MS + 700,
      late: true,
      result: 'Late: about 1,700 miles',
      text: 'The West warehouse has no stock, so Midwest 1 ships it across the country.',
    },
    with: {
      from: 'W5',
      marks: { W5: 'stocked' },
      badges: [{ at: 'W5', start: ORDER_MS, end: ORDER_MS + 2600, text: 'Stock check: in stock', tone: 'data' }],
      depart: ORDER_MS + 700,
      late: false,
      result: 'On time: about 160 miles',
      text: 'Fast sellers are kept in stock near each region, and the stock check picks the nearest warehouse that has them.',
    },
  },
  {
    title: 'The nearest warehouse had it, but a far one shipped it',
    stat: (d) =>
      d.wrong
        ? `In the data: ${num(d.wrong.deliveries)} orders, and only ${Math.round(d.wrong.on_time * 100)} in 100 arrived on time (${Math.round(d.wrong.on_time_nearest * 100)} from the nearest).`
        : null,
    client: 'southeastClient',
    nearest: 'W3',
    cam: [560, 175, 420],
    today: {
      from: 'W4',
      marks: { W3: 'stocked' },
      badges: [{ at: 'W3', start: ORDER_MS, end: ORDER_MS + 2200, text: 'Has the stock', tone: 'neutral' }],
      depart: ORDER_MS + 700,
      late: true,
      result: 'Late: about 850 miles',
      text: 'The Southeast warehouse has every item, but Northeast is picked and the order travels six times further.',
    },
    with: {
      from: 'W3',
      marks: { W3: 'stocked' },
      badges: [{ at: 'W3', start: ORDER_MS, end: ORDER_MS + 2200, text: 'Stock check: nearest', tone: 'data' }],
      depart: ORDER_MS + 700,
      late: false,
      result: 'On time: about 140 miles',
      text: 'The Order desk always ships from the nearest warehouse that has every item.',
    },
  },
  {
    title: 'A weak carrier on this lane',
    stat: causeStat('weak_carrier_lane'),
    client: 'midwestClient',
    nearest: 'W1',
    cam: [520, 140, 260],
    today: {
      from: 'W1',
      badges: [{ at: 'W1', start: ORDER_MS, end: ORDER_MS + 2400, text: 'Carrier D: cheapest', tone: 'late' }],
      depart: ORDER_MS + 900,
      speed: 0.45,
      stop: { at: 0.45, ms: 1600 },
      late: true,
      result: 'Late: delayed on the lane',
      text: 'Picked from the rate card because it is cheapest, but Carrier D is often late on this lane.',
    },
    with: {
      from: 'W1',
      badges: [{ at: 'W1', start: ORDER_MS, end: ORDER_MS + 2400, text: 'Carrier advisor: Carrier C', tone: 'route' }],
      depart: ORDER_MS + 900,
      late: false,
      result: 'On time',
      text: 'The carrier advisor picks a carrier that is strong on this lane.',
    },
  },
  {
    title: 'Part of the address is missing',
    stat: causeStat('incomplete_address'),
    client: 'northeastClient',
    nearest: 'W4',
    cam: [700, 70, 280],
    today: {
      from: 'W4',
      badges: [],
      depart: ORDER_MS + 500,
      turnBack: true,
      late: true,
      result: 'Late: delivered again later',
      text: 'The order was typed in by hand without the postcode. The driver cannot deliver and brings it back.',
    },
    with: {
      from: 'W4',
      badges: [
        { at: 'W4', start: ORDER_MS, end: ORDER_MS + 1500, text: 'Address check: no postcode', tone: 'route' },
        { at: 'northeastClient', start: ORDER_MS + 1500, end: ORDER_MS + 3000, text: 'Client sends it', tone: 'neutral' },
      ],
      messages: [
        { from: 'W4', to: 'northeastClient', start: ORDER_MS + 600, dur: 800 },
        { from: 'northeastClient', to: 'W4', start: ORDER_MS + 2000, dur: 800 },
      ],
      depart: ORDER_MS + 3000,
      late: false,
      result: 'On time',
      text: 'The address check holds the order and asks the client for the postcode before anything is picked.',
    },
  },
  {
    title: 'A same-day order after the 08:00 pick list',
    stat: causeStat('same_day_after_cutoff'),
    client: 'midwestClient',
    nearest: 'W2',
    cam: [540, 150, 260],
    today: {
      from: 'W2',
      badges: [
        { at: 'W2', start: ORDER_MS, end: ORDER_MS + 1600, text: '08:05: missed the 08:00 list', tone: 'late' },
        { at: 'W2', start: ORDER_MS + 1600, end: ORDER_MS + 3400, text: 'Waits a day', tone: 'late' },
      ],
      depart: ORDER_MS + 3400,
      late: true,
      result: 'Late, and nobody told the client',
      text: 'It arrives at 08:05, misses the pick list and waits a day. The client still expects it today.',
    },
    with: {
      from: 'W2',
      badges: [
        { at: 'W2', start: ORDER_MS, end: ORDER_MS + 1600, text: 'Promise check: tomorrow', tone: 'route' },
        { at: 'midwestClient', start: ORDER_MS + 1500, end: ORDER_MS + 3400, text: 'Told the new date', tone: 'ai' },
      ],
      messages: [{ from: 'W2', to: 'midwestClient', start: ORDER_MS + 700, dur: 800 }],
      depart: ORDER_MS + 3400,
      late: false,
      result: 'On time for the new date',
      text: 'It is re-promised for tomorrow and the client is told now, so the promise is one we keep.',
    },
  },
  {
    title: 'The driver goes off route',
    stat: causeStat('route_deviation'),
    client: 'southeastClient',
    nearest: 'W3',
    cam: [610, 270, 240],
    today: {
      from: 'W3',
      badges: [],
      depart: ORDER_MS + 500,
      detour: true,
      late: true,
      result: 'Late: 20%+ further',
      text: 'The driver drives more than 20% further than the planned route.',
    },
    with: {
      from: 'W3',
      badges: [],
      depart: ORDER_MS + 500,
      detour: true,
      late: true,
      result: 'Same: DeliveryLens does not change the drive',
      text: 'DeliveryLens does not change the drive. This is the one cause the $680K routing tool fixes.',
    },
  },
];

/* ---------- geometry ---------- */

type Pt = [number, number];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** The road from a warehouse to a client: a gentle arc (or a winding detour), sampled into a polyline. */
function road(a: Pt, b: Pt, detour = false): { pts: Pt[]; len: number[] } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d, ny = dx / d;
  const bend = (ny < 0 ? 1 : -1) * d * 0.18; // bow the arc upwards on screen
  const pts: Pt[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const arc = 4 * t * (1 - t) * bend;
    const wig = detour ? Math.sin(t * Math.PI * 2) * d * 0.2 : 0;
    pts.push([a[0] + dx * t + nx * (arc + wig), a[1] + dy * t + ny * (arc + wig)]);
  }
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len };
}

function at(r: { pts: Pt[]; len: number[] }, dist: number): { p: Pt; angle: number; upto: Pt[] } {
  const total = r.len[r.len.length - 1];
  const d = Math.min(total, Math.max(0, dist));
  let i = 1;
  while (i < r.len.length - 1 && r.len[i] < d) i++;
  const seg = r.len[i] - r.len[i - 1] || 1;
  const f = (d - r.len[i - 1]) / seg;
  const a = r.pts[i - 1], b = r.pts[i];
  const p: Pt = [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
  return { p, angle: Math.atan2(b[1] - a[1], b[0] - a[0]), upto: [...r.pts.slice(0, i), p] };
}

/** Where the truck is at time t, and when it arrives. */
function drive(side: Side, scene: Scene, t: number) {
  const r = road(SPOTS[side.from] as unknown as Pt, SPOTS[scene.client] as unknown as Pt, side.detour);
  const total = r.len[r.len.length - 1];
  const v = SPEED * (side.speed ?? 1);
  const toStop = side.stop ? (total * side.stop.at) / v : Infinity;
  const pause = side.stop?.ms ?? 0;
  const moving = (ms: number) => (ms <= toStop ? ms : ms <= toStop + pause ? toStop : ms - pause);
  const arriveMs = side.depart + total / v + pause;
  const backMs = side.turnBack ? arriveMs + 700 : arriveMs;
  const finishMs = side.turnBack ? backMs + (total * 0.6) / v : arriveMs;
  const el = t - side.depart;
  let dist = el <= 0 ? 0 : Math.min(total, moving(el) * v);
  let back = false;
  if (side.turnBack && t > backMs) {
    dist = Math.max(total * 0.4, total - (t - backMs) * v);
    back = true;
  }
  const pos = at(r, dist);
  const stopped = !!side.stop && el > toStop && el <= toStop + pause;
  return { r, pos, started: el > 0, arrived: t >= arriveMs, arriveMs, finished: t >= finishMs, back, stopped };
}

/* ---------- component ---------- */

export default function DeliveryMap({ stats, onTimeToday, onTimeWith }: { stats: Stats; onTimeToday: number; onTimeWith: number }) {
  const reduced = useReducedMotion();
  const still = reduced || import.meta.env.MODE === 'test';
  const box = useRef<HTMLElement>(null);
  const visible = useInView(box, { once: false, threshold: 0.15 });
  const [scene, setScene] = useState(0);
  const [prev, setPrev] = useState(0);
  const [t, setT] = useState(still ? SCENE_MS : 0);
  const [playing, setPlaying] = useState(!still);
  const tRef = useRef(t);
  const sceneRef = useRef(scene);

  useEffect(() => {
    if (still || !playing || !visible) return;
    let last: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(64, now - last);
      last = now;
      let next = tRef.current + dt;
      if (next >= SCENE_MS) {
        next = 0;
        setPrev(sceneRef.current);
        sceneRef.current = (sceneRef.current + 1) % SCENES.length;
        setScene(sceneRef.current);
      }
      tRef.current = next;
      setT(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [still, playing, visible]);

  const go = (s: number) => {
    const next = (s + SCENES.length) % SCENES.length;
    setPrev(scene);
    setScene(next);
    sceneRef.current = next;
    tRef.current = still ? SCENE_MS : 0;
    setT(tRef.current);
  };

  const sc = SCENES[scene];
  const camT = still ? 1 : ease(t / 1100);
  const pc = SCENES[prev].cam;
  const cam: [number, number, number] = [lerp(pc[0], sc.cam[0], camT), lerp(pc[1], sc.cam[1], camT), lerp(pc[2], sc.cam[2], camT)];
  const stat = sc.stat(stats);

  return (
    <section ref={box} className="panel" aria-labelledby="map-title" data-testid="delivery-map" data-scene={scene}>
      <div className="panel-pad pb-0 sm:pb-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="map-title" className="text-lg font-semibold">
              The same order, today and with DeliveryLens
            </h2>
            <p className="mt-1 max-w-[72ch] text-[15px] text-ink-soft">
              Six real cases from the data play in turn. Both trucks drive at the same speed, so the longer or delayed trip arrives later.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Play controls">
            <CtrlButton label="Previous case" onClick={() => go(scene - 1)} icon={ChevronLeft} />
            {!still && <CtrlButton label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)} icon={playing ? Pause : Play} wide />}
            <CtrlButton label="Next case" onClick={() => go(scene + 1)} icon={ChevronRight} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2" aria-live="polite">
          <span className="num inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-2 text-sm font-semibold text-white">
            {scene + 1} of {SCENES.length}
          </span>
          <h3 className="font-semibold text-ink">{sc.title}</h3>
          <div className="ml-auto flex gap-1.5" role="group" aria-label="Jump to a case">
            {SCENES.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => go(i)}
                aria-label={`Case ${i + 1}: ${s.title}`}
                aria-current={i === scene ? 'step' : undefined}
                className={`h-2.5 rounded-full transition-all duration-300 ${i === scene ? 'w-6 bg-ink' : 'w-2.5 bg-line hover:bg-slate'}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-5 pt-4 sm:px-6 lg:grid-cols-2">
        <MapPanel kind="today" scene={sc} t={t} cam={cam} still={still} />
        <MapPanel kind="with" scene={sc} t={t} cam={cam} still={still} />
      </div>

      <div className="panel-pad pt-3 sm:pt-3">
        {stat && <p className="text-sm text-slate">{stat}</p>}
        <p className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-line pt-3 text-[15px] text-ink-soft">
          <span>Out of every 100 orders, on time:</span>
          <span>
            Today <strong className="num text-[20px] text-late">{Math.round(onTimeToday * 100)}</strong>
          </span>
          <span>
            With DeliveryLens <strong className="num text-[20px] text-route-dark">{Math.round(onTimeWith * 100)}</strong>{' '}
            <span className="text-sm text-slate">(realistic plan)</span>
          </span>
        </p>
      </div>
    </section>
  );
}

function CtrlButton({ label, onClick, icon: Icon, wide }: { label: string; onClick: () => void; icon: typeof Play; wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-line bg-surface text-ink transition-colors hover:border-route hover:text-route-dark ${
        wide ? 'px-3.5 font-semibold' : 'w-10'
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {wide && <span>{label}</span>}
    </button>
  );
}

const TONE: Record<Tone, { fill: string; text: string; stroke: string }> = {
  late: { fill: '#FBEEE2', text: '#A84F0B', stroke: '#A84F0B' },
  route: { fill: '#E3F1EE', text: '#0A524C', stroke: '#0E6B63' },
  ai: { fill: '#EEEBF9', text: '#5B47B0', stroke: '#5B47B0' },
  data: { fill: '#E5EEF7', text: '#2C5D8F', stroke: '#2C5D8F' },
  neutral: { fill: '#FFFFFF', text: '#3A4852', stroke: '#5E6B75' },
};

function MapPanel({ kind, scene, t, cam, still }: { kind: 'today' | 'with'; scene: Scene; t: number; cam: [number, number, number]; still: boolean }) {
  const today = kind === 'today';
  const side = today ? scene.today : scene.with;
  const colour = today ? '#A84F0B' : '#0E6B63';
  const [cx, cy, cw] = cam;
  const ch = cw * 0.625;
  const s = (cw / MAP_W) * UI; // keeps marks the same size on screen as the camera zooms
  const d = drive(side, scene, t);
  const client = SPOTS[scene.client] as unknown as Pt;
  const order = ease(t / ORDER_MS);
  const nearest = SPOTS[scene.nearest] as unknown as Pt;
  const orderAt: Pt = [lerp(client[0], nearest[0], order), lerp(client[1], nearest[1], order)];
  const resultIn = d.finished;

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex items-baseline justify-between gap-3">
        <span className={`flex items-center gap-2 font-semibold ${today ? 'text-late' : 'text-route-dark'}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${today ? 'bg-late' : 'bg-route'}`} aria-hidden="true" />
          {today ? 'Today' : 'With DeliveryLens'}
        </span>
        <span
          className={`text-sm font-semibold transition-opacity duration-300 ${side.late ? 'text-late' : 'text-route-dark'}`}
          style={{ opacity: resultIn ? 1 : 0 }}
          data-testid={`map-result-${kind}`}
        >
          {side.result}
        </span>
      </figcaption>
      <div className="overflow-hidden rounded-md border border-line bg-[#EEF3F6]">
        <svg viewBox={`${cx} ${cy} ${cw} ${ch}`} className="block aspect-[16/10] w-full" role="img" aria-label={`${today ? 'Today' : 'With DeliveryLens'}: ${side.text}`}>
          <path d={US_LAND} fill="#FBFCFB" stroke="#B9C3C0" strokeWidth={1.2 * s} />
          <path d={US_BORDERS} fill="none" stroke="#D9DFDD" strokeWidth={0.9 * s} />

          {/* planned road, then the part driven so far */}
          {d.started && <polyline points={d.r.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={colour} strokeOpacity={0.22} strokeWidth={3 * s} strokeDasharray={`${8 * s} ${6 * s}`} />}
          {d.started && <polyline points={d.pos.upto.map((p) => p.join(',')).join(' ')} fill="none" stroke={colour} strokeWidth={4 * s} strokeLinecap="round" strokeLinejoin="round" />}

          {(Object.keys(WH_LABEL) as Wh[]).map((w) => (
            <WarehouseMark key={w} w={w} s={s} active={w === side.from || w === scene.nearest} mark={t >= ORDER_MS ? side.marks?.[w] : undefined} />
          ))}
          <ClientMark p={client} s={s} done={resultIn} late={side.late} />

          {/* the order email arriving */}
          {t > 50 && order < 1 && <Envelope p={orderAt} s={s} colour="#3A4852" />}
          {side.messages?.map((m, i) => {
            const k = (t - m.start) / m.dur;
            if (k <= 0 || k >= 1) return null;
            const a = SPOTS[m.from] as unknown as Pt, b = SPOTS[m.to] as unknown as Pt;
            return <Envelope key={i} p={[lerp(a[0], b[0], ease(k)), lerp(a[1], b[1], ease(k))]} s={s} colour={colour} />;
          })}

          {d.started && !(d.finished && !side.turnBack) && <TruckMark p={d.pos.p} angle={d.pos.angle} s={s} colour={colour} flip={d.back} />}
          {d.finished && !side.turnBack && <TruckMark p={d.pos.p} angle={0} s={s} colour={colour} />}
          {d.finished && side.turnBack && <TruckMark p={d.pos.p} angle={d.pos.angle} s={s} colour={colour} flip />}

          {side.badges.map((b, i) =>
            t >= b.start && (b.end === undefined || t < b.end) ? <Tag key={i} p={SPOTS[b.at] as unknown as Pt} s={s} text={b.text} tone={b.tone} t={t - b.start} still={still} /> : null,
          )}
          {d.stopped && <Tag p={d.pos.p} s={s} text="Delayed" tone="late" t={1000} still />}
          {side.turnBack && d.arrived && !d.back && <Tag p={client} s={s} text="Can't deliver: no postcode" tone="late" t={1000} still />}
          {resultIn && <Tag p={client} s={s} text={side.late ? 'Late' : 'On time'} tone={side.late ? 'late' : 'route'} t={t - d.arriveMs} still={still} strong below={scene.resultBelow} />}
        </svg>
      </div>
      <p className="mt-2 text-[15px] text-ink-soft">{side.text}</p>
    </figure>
  );
}

function WarehouseMark({ w, s, active, mark }: { w: Wh; s: number; active: boolean; mark?: 'empty' | 'stocked' }) {
  const [x, y] = SPOTS[w] as unknown as Pt;
  const k = 15 * s;
  const empty = mark === 'empty';
  return (
    <g opacity={active ? 1 : 0.55}>
      <path
        d={`M${x - k} ${y + k * 0.7} V${y - k * 0.2} L${x} ${y - k} L${x + k} ${y - k * 0.2} V${y + k * 0.7} Z`}
        fill={empty ? '#FFFFFF' : '#E7ECEA'}
        stroke="#5E6B75"
        strokeWidth={1.6 * s}
        strokeDasharray={empty ? `${3 * s} ${2 * s}` : undefined}
        strokeLinejoin="round"
      />
      <rect x={x - k * 0.4} y={y} width={k * 0.8} height={k * 0.7} fill="#FFFFFF" stroke="#5E6B75" strokeWidth={1 * s} />
      {mark === 'stocked' && <rect x={x + k * 0.55} y={y + k * 0.05} width={k * 0.42} height={k * 0.6} rx={1.5 * s} fill="#0E6B63" />}
      {empty && <path d={`M${x - k * 0.3} ${y - k * 0.55} l${k * 0.6} ${k * 0.6} M${x + k * 0.3} ${y - k * 0.55} l${-k * 0.6} ${k * 0.6}`} stroke="#A84F0B" strokeWidth={2.4 * s} strokeLinecap="round" />}
      {/* Only the warehouses in this case are named, so the map stays readable. */}
      {active && (
        <text x={x} y={y + k * 0.7 + 17 * s} textAnchor="middle" fontSize={14 * s} fontWeight={600} fill="#3A4852" fontFamily="Barlow, system-ui, sans-serif">
          {WH_LABEL[w]}
        </text>
      )}
    </g>
  );
}

function ClientMark({ p: [x, y], s, done, late }: { p: Pt; s: number; done: boolean; late: boolean }) {
  const w = 18 * s, h = 24 * s;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={2 * s} fill="#15212B" stroke={done ? (late ? '#A84F0B' : '#0E6B63') : 'none'} strokeWidth={3 * s} />
      {[0, 1, 2].map((r) => [0, 1].map((c) => <rect key={`${r}${c}`} x={x - w / 2 + 3.5 * s + c * 7 * s} y={y - h / 2 + 4 * s + r * 6.5 * s} width={4 * s} height={3.2 * s} fill="#FFFFFF" />))}
      <text x={x} y={y + h / 2 + 16 * s} textAnchor="middle" fontSize={14 * s} fontWeight={600} fill="#15212B" fontFamily="Barlow, system-ui, sans-serif">
        Client
      </text>
    </g>
  );
}

function TruckMark({ p: [x, y], angle, s, colour, flip }: { p: Pt; angle: number; s: number; colour: string; flip?: boolean }) {
  // Keep the truck upright: going left, mirror it instead of turning it upside down.
  let deg = (angle * 180) / Math.PI;
  let mirror = Math.cos(angle) < 0;
  if (flip) mirror = !mirror;
  if (Math.cos(angle) < 0) deg += 180;
  return (
    <g transform={`translate(${x} ${y}) rotate(${deg}) scale(${(mirror ? -1 : 1) * s * 1.7} ${s * 1.7})`}>
      <ellipse cx={0} cy={6} rx={12} ry={2.2} fill="#15212B" opacity={0.15} />
      <rect x={-11} y={-7} width={14} height={10} rx={1.2} fill={colour} />
      <path d="M3 -4 h5 l3.5 3.5 v3.5 h-8.5 z" fill={colour} />
      <rect x={4.5} y={-3} width={3} height={2.5} fill="#FFFFFF" opacity={0.85} />
      <circle cx={-6} cy={4} r={2.2} fill="#15212B" />
      <circle cx={6} cy={4} r={2.2} fill="#15212B" />
    </g>
  );
}

function Envelope({ p: [x, y], s, colour }: { p: Pt; s: number; colour: string }) {
  const w = 18 * s, h = 12 * s;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={1.5 * s} fill="#FFFFFF" stroke={colour} strokeWidth={1.6 * s} />
      <path d={`M${x - w / 2} ${y - h / 2} L${x} ${y + h * 0.1} L${x + w / 2} ${y - h / 2}`} fill="none" stroke={colour} strokeWidth={1.4 * s} />
    </g>
  );
}

/** A label above a place on the map, with a small pointer. Fades in over 250ms. */
function Tag({ p: [x, y], s, text, tone, t, still, strong, below }: { p: Pt; s: number; text: string; tone: Tone; t: number; still: boolean; strong?: boolean; below?: boolean }) {
  const c = TONE[tone];
  const fs = (strong ? 15 : 13.5) * s;
  const w = text.length * fs * 0.54 + 16 * s;
  const h = fs + 11 * s;
  const top = below ? y + 36 * s : y - 26 * s - h;
  const o = still ? 1 : Math.min(1, t / 250);
  const rise = (1 - o) * 6 * s;
  return (
    <g opacity={o} transform={`translate(0 ${rise})`}>
      <rect x={x - w / 2} y={top} width={w} height={h} rx={h / 2} fill={strong ? c.stroke : c.fill} stroke={c.stroke} strokeWidth={1.2 * s} />
      {!below && <path d={`M${x - 5 * s} ${top + h} L${x} ${top + h + 6 * s} L${x + 5 * s} ${top + h}`} fill={strong ? c.stroke : c.fill} stroke={c.stroke} strokeWidth={1.2 * s} strokeLinejoin="round" />}
      <text x={x} y={top + h / 2 + fs * 0.35} textAnchor="middle" fontSize={fs} fontWeight={600} fill={strong ? '#FFFFFF' : c.text} fontFamily="Barlow, system-ui, sans-serif">
        {text}
      </text>
    </g>
  );
}
