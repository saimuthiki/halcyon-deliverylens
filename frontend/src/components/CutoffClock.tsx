import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useInView, useReducedMotion } from '../lib/motion';

/**
 * A three-second explainer of the 08:00 cutoff: the clock reaches 08:00, the pick list prints and the truck
 * leaves with the day's orders (teal); an order arriving at 08:05 (orange) misses it and waits for tomorrow.
 * Plays once when it comes into view; Replay plays it again. Reduced motion and tests show the final frame.
 */

const DURATION_MS = 3000;
const ROUTE = '#0E6B63';
const LATE = '#A84F0B';
const SLATE = '#5E6B75';
const TRACK = '#E7ECEA';
const INK = '#15212B';

const clamp = (x: number) => Math.min(1, Math.max(0, x));
/** Progress of a segment from a to b within the overall progress p, eased out (no bounce). */
const seg = (p: number, a: number, b: number) => 1 - Math.pow(1 - clamp((p - a) / (b - a)), 3);
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

// Key moments, as a share of the 3 seconds.
const AT_0800 = 0.42;
const AT_0805 = 0.6;

export default function CutoffClock() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { threshold: 0.4 });
  const instant = useReducedMotion() || import.meta.env.MODE === 'test';
  const [p, setP] = useState(instant ? 1 : 0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (instant || typeof requestAnimationFrame === 'undefined') {
      setP(1);
      return;
    }
    if (!inView) return;
    setP(0);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const v = Math.min(1, (now - t0) / DURATION_MS);
      setP(v);
      if (v < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, run, instant]);

  // Time of day in minutes: 06:00 to 08:00, then on to 08:05.
  const minutes = p < AT_0800 ? lerp(360, 480, seg(p, 0, AT_0800)) : lerp(480, 485, clamp((p - AT_0800) / (AT_0805 - AT_0800)));
  const hh = Math.floor(minutes / 60);
  const mm = Math.floor(minutes % 60);
  const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const hourAngle = ((minutes / 60) % 12) * 30;
  const minuteAngle = (minutes % 60) * 6;

  const printed = p >= AT_0800;
  const truckX = lerp(0, 290, seg(p, AT_0800, 0.82));
  const orderIn = seg(p, AT_0800, AT_0805); // slides up to the depot, arriving at 08:05
  const orderDrop = seg(p, 0.7, 0.92); // then moves to tomorrow's lane
  const orderX = lerp(lerp(178, 268, orderIn), 330, orderDrop);
  const orderY = lerp(84, 140, orderDrop);
  const lateLabel = clamp((p - 0.84) / 0.12);
  const leftLabel = clamp((p - 0.7) / 0.12);

  const hand = (angle: number, length: number) => {
    const r = (angle * Math.PI) / 180;
    return { x2: 80 + length * Math.sin(r), y2: 82 - length * Math.cos(r) };
  };

  return (
    <section className="panel panel-pad mb-6" aria-labelledby="cutoff-clock-title" data-testid="cutoff-clock">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="cutoff-clock-title" className="text-lg font-semibold">
          Why an order at 08:05 is late
        </h2>
        {!instant && (
          <button type="button" className="btn-secondary min-h-[36px] px-3 text-sm" onClick={() => setRun((n) => n + 1)}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Replay
          </button>
        )}
      </div>
      <div ref={ref}>
        <svg
          viewBox="0 0 640 176"
          className="w-full max-w-[800px]"
          role="img"
          aria-label="At 08:00 the pick list prints and the truck leaves with the day's orders. An order that arrives at 08:05 misses that truck and waits for tomorrow, so it is late."
        >
          {/* Clock */}
          <circle cx={80} cy={82} r={60} fill="#FFFFFF" stroke={INK} strokeWidth={2} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * 30 * Math.PI) / 180;
            return (
              <line
                key={i}
                x1={80 + 52 * Math.sin(a)}
                y1={82 - 52 * Math.cos(a)}
                x2={80 + (i % 3 === 0 ? 45 : 48) * Math.sin(a)}
                y2={82 - (i % 3 === 0 ? 45 : 48) * Math.cos(a)}
                stroke={SLATE}
                strokeWidth={i % 3 === 0 ? 2.5 : 1.5}
              />
            );
          })}
          <line x1={80} y1={82} {...hand(hourAngle, 28)} stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <line x1={80} y1={82} {...hand(minuteAngle, 42)} stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={80} cy={82} r={3.5} fill={INK} />
          <text x={80} y={166} textAnchor="middle" fontSize={15} fontWeight={700} fill={p >= AT_0805 ? LATE : INK} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {clock}
          </text>

          {/* Today's road */}
          <line x1={170} y1={98} x2={630} y2={98} stroke={TRACK} strokeWidth={4} strokeLinecap="round" />
          {/* Pick list at the depot */}
          <g opacity={printed ? 1 : 0.45}>
            <rect x={258} y={24} width={22} height={28} rx={2} fill="#FFFFFF" stroke={printed ? ROUTE : SLATE} strokeWidth={2} />
            {[32, 38, 44].map((y) => (
              <line key={y} x1={263} y1={y} x2={275} y2={y} stroke={printed ? ROUTE : SLATE} strokeWidth={1.5} />
            ))}
            <text x={288} y={36} fontSize={13} fontWeight={600} fill={printed ? ROUTE : SLATE}>
              08:00 pick list
            </text>
            <text x={288} y={51} fontSize={12} fill={SLATE}>
              prints
            </text>
          </g>

          {/* Truck: leaves at 08:00 with today's orders */}
          <g transform={`translate(${truckX} 0)`}>
            <rect x={240} y={66} width={40} height={26} rx={3} fill={ROUTE} />
            <path d="M280 74 h12 l8 9 v9 h-20 z" fill={ROUTE} />
            <rect x={284} y={77} width={7} height={6} rx={1} fill="#FFFFFF" />
            <circle cx={252} cy={94} r={5} fill={INK} />
            <circle cx={290} cy={94} r={5} fill={INK} />
          </g>
          <text x={630} y={60} textAnchor="end" fontSize={13} fontWeight={600} fill={ROUTE} opacity={leftLabel}>
            Left at 08:00 with today’s orders
          </text>

          {/* Tomorrow's lane */}
          <line x1={300} y1={150} x2={630} y2={150} stroke={TRACK} strokeWidth={4} strokeLinecap="round" strokeDasharray="2 8" />
          <text x={630} y={140} textAnchor="end" fontSize={12} fill={SLATE}>
            tomorrow’s truck
          </text>

          {/* The 08:05 order */}
          <g transform={`translate(${orderX} ${orderY})`}>
            <rect x={-10} y={-10} width={20} height={20} rx={3} fill={LATE} />
            <line x1={-10} y1={-2} x2={10} y2={-2} stroke="#FFFFFF" strokeWidth={1.5} />
            <text x={0} y={-16} textAnchor="middle" fontSize={12} fontWeight={600} fill={LATE}>
              08:05 order
            </text>
          </g>
          <text x={348} y={145} fontSize={13} fontWeight={700} fill={LATE} opacity={lateLabel}>
            Waits for tomorrow: late
          </text>
        </svg>
      </div>
      <p className="mt-2 max-w-[80ch] text-[15px] text-ink-soft">
        The pick list prints at 08:00 and the truck leaves with it. An order that arrives five minutes later misses that truck and waits for tomorrow, so it
        arrives late.
      </p>
    </section>
  );
}
