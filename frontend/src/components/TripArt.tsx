import { useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from '../lib/motion';

/**
 * Small SVG drawings for delivery trips: a warehouse, a client building and a truck that drives a path.
 * Used by Stock & routes and the Order desk. Colours stay semantic: teal = the right trip, orange = the
 * problem trip; buildings are neutral. Draw them inside <TripMap>, whose ground line sits at y = GROUND.
 */

export const GROUND = 64;
const MAP_TEXT = 'fill-slate text-[11px]';

export function TripMap({ label, children, viewBox = '0 0 280 86' }: { label: string; children: ReactNode; viewBox?: string }) {
  const width = Number(viewBox.split(' ')[2]) || 280;
  return (
    <svg viewBox={viewBox} className="w-full overflow-visible" role="img" aria-label={label}>
      <line x1={4} x2={width - 4} y1={GROUND + 0.75} y2={GROUND + 0.75} className="stroke-line" strokeWidth="1.5" />
      {children}
    </svg>
  );
}

/** A warehouse with a roller door; `empty` = dashed with an orange cross, `stocked` = teal boxes by the door. */
export function Warehouse({ x, label, mark }: { x: number; label?: string; mark?: 'empty' | 'stocked' }) {
  const empty = mark === 'empty';
  return (
    <g>
      <path
        d={`M${x - 15} ${GROUND} V${GROUND - 15} L${x} ${GROUND - 25} L${x + 15} ${GROUND - 15} V${GROUND} Z`}
        className={empty ? 'fill-surface stroke-slate' : 'fill-slate-light stroke-slate'}
        strokeWidth="1.5"
        strokeDasharray={empty ? '3 2' : undefined}
        strokeLinejoin="round"
      />
      <rect x={x - 6} y={GROUND - 11} width={12} height={11} className="fill-surface stroke-slate" strokeWidth="1" />
      {!empty && <path d={`M${x - 6} ${GROUND - 7.5} h12 M${x - 6} ${GROUND - 4} h12`} className="stroke-slate" strokeWidth="0.8" />}
      {mark === 'stocked' && (
        <g className="fill-route">
          <rect x={x + 8} y={GROUND - 7} width={6} height={6} rx={1} />
          <rect x={x + 8} y={GROUND - 13} width={6} height={5} rx={1} />
        </g>
      )}
      {empty && <path d={`M${x - 4} ${GROUND - 20} l8 8 M${x + 4} ${GROUND - 20} l-8 8`} className="stroke-late" strokeWidth="2" strokeLinecap="round" />}
      {label && (
        <text x={x < 60 ? x - 16 : x} y={GROUND + 18} textAnchor={x < 60 ? 'start' : 'middle'} className={MAP_TEXT}>
          {label}
        </text>
      )}
    </g>
  );
}

/** The client: a small office building with lit windows. */
export function Client({ x, label = 'Client' }: { x: number; label?: string }) {
  return (
    <g>
      <rect x={x - 10} y={GROUND - 26} width={20} height={26} rx={1.5} className="fill-ink" />
      <g className="fill-surface">
        {[0, 1, 2].map((r) => [0, 1].map((c) => <rect key={`${r}${c}`} x={x - 6 + c * 8} y={GROUND - 22 + r * 6} width={4} height={3} rx={0.5} />))}
      </g>
      <text x={x + 12} y={GROUND + 18} textAnchor="end" className={MAP_TEXT}>
        {label}
      </text>
    </g>
  );
}

/**
 * A small truck that drives `path`. Looping (default): it waits at the end until the `dur`-second loop
 * restarts, and `arrive` is the share of the loop the drive takes, so a longer trip visibly arrives later.
 * With `loop={false}` it drives once and stays at the end. Hidden for reduced motion (the road still shows).
 */
export function Truck({ path, arrive = 0.8, tone, dur = 6, loop = true }: { path: string; arrive?: number; tone: 'route' | 'late'; dur?: number; loop?: boolean }) {
  const reduced = useReducedMotion();
  const once = useRef<SVGAnimateMotionElement>(null);
  // A one-off drive must start when the truck appears, not when the page loaded (SMIL's default clock).
  useEffect(() => {
    if (!loop) once.current?.beginElement?.();
  }, [loop, path]);
  if (reduced) return null;
  return (
    <g className={tone === 'route' ? 'fill-route' : 'fill-late'}>
      <g transform="translate(0 -8) scale(1.35)">
        <rect x={-11} y={-6} width={13} height={9} rx={1} />
        <path d="M3 -3 h4 l3 3 v3 h-7 z" />
        <circle cx={-6} cy={4} r={2} className="fill-ink" />
        <circle cx={5} cy={4} r={2} className="fill-ink" />
      </g>
      {loop ? (
        <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} rotate="auto" calcMode="linear" keyPoints="0;1;1" keyTimes={`0;${arrive};1`} />
      ) : (
        <animateMotion ref={once} begin="indefinite" dur={`${dur}s`} fill="freeze" path={path} rotate="auto" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.16 1 0.3 1" />
      )}
    </g>
  );
}
