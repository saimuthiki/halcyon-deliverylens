import { pct } from '../lib/format';

export interface TrackStop {
  key: string;
  rate: number;
  label: string;
  tone: 'today' | 'vendor' | 'process' | 'all';
}

interface Props {
  today: number;
  routingOnly: number;
  processOnly: number;
  allFixed: number;
  benchmark: number;
  min?: number;
  max?: number;
}

const DOT: Record<TrackStop['tone'], string> = {
  today: 'bg-late border-late',
  vendor: 'bg-surface border-slate',
  process: 'bg-surface border-route',
  all: 'bg-route border-route',
};

/**
 * The signature graphic: on-time delivery as a road from today to the benchmark,
 * with each option marked where it would get Halcyon.
 */
export default function DeliveryTrack({ today, routingOnly, processOnly, allFixed, benchmark, min = 0.6, max = 1 }: Props) {
  const pos = (r: number) => `${(((Math.min(max, Math.max(min, r)) - min) / (max - min)) * 100).toFixed(2)}%`;
  const stops: TrackStop[] = [
    { key: 'today', rate: today, label: 'Today', tone: 'today' },
    { key: 'vendor', rate: routingOnly, label: 'Routing vendor only', tone: 'vendor' },
    { key: 'process', rate: processOnly, label: 'Our process fixes', tone: 'process' },
    { key: 'all', rate: allFixed, label: 'All five causes fixed', tone: 'all' },
  ];
  const ticks: number[] = [];
  for (let t = Math.ceil(min * 10) / 10; t <= max + 1e-9; t += 0.1) ticks.push(Math.round(t * 100) / 100);

  return (
    <figure className="w-full" aria-label={`On-time delivery today ${pct(today)}; routing vendor only ${pct(routingOnly)}; process fixes ${pct(processOnly)}; all five causes fixed ${pct(allFixed)}; benchmark ${pct(benchmark, 0)}.`}>
      {/* Desktop / tablet: positioned track */}
      <div className="relative hidden sm:block" aria-hidden="true">
        <div className="relative h-[68px]">
          {stops.map((s) => {
            const right = (s.rate - min) / (max - min) > 0.86;
            return (
              <div
                key={s.key}
                className={`absolute bottom-1 whitespace-nowrap ${right ? '-translate-x-full text-right' : '-translate-x-1/2 text-center'}`}
                style={{ left: pos(s.rate), ...(right ? { marginLeft: 10 } : {}) }}
              >
                <div className={`num text-[26px] font-bold leading-none tracking-tight ${s.tone === 'today' ? 'text-late' : s.tone === 'vendor' ? 'text-ink-soft' : 'text-route-dark'}`}>
                  {pct(s.rate)}
                </div>
                <div className="mt-1 text-sm text-ink-soft">{s.label}</div>
              </div>
            );
          })}
        </div>

        <div className="relative mt-2 h-3">
          <div className="absolute inset-0 rounded-full bg-slate-light" />
          <div className="absolute inset-y-0 left-0 rounded-l-full bg-late/80" style={{ width: pos(today) }} />
          <div
            className="absolute inset-y-0 origin-left bg-[repeating-linear-gradient(90deg,#0E6B63_0_10px,transparent_10px_16px)] opacity-60"
            style={{ left: pos(today), width: `calc(${pos(allFixed)} - ${pos(today)})` }}
          />
          {/* benchmark */}
          <div className="absolute -top-2 bottom-[-34px] w-0 border-l-2 border-dashed border-ink" style={{ left: pos(benchmark) }} />
          {stops.map((s) => (
            <span
              key={s.key}
              className={`absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] ${DOT[s.tone]}`}
              style={{ left: pos(s.rate) }}
            />
          ))}
        </div>

        <div className="relative mt-2 h-10 text-sm text-slate">
          {ticks.map((t) => (
            <span key={t} className="num absolute -translate-x-1/2" style={{ left: pos(t) }}>
              {Math.round(t * 100)}%
            </span>
          ))}
          <span className="absolute top-5 -translate-x-full whitespace-nowrap pr-2 font-semibold text-ink" style={{ left: pos(benchmark) }}>
            Industry benchmark {pct(benchmark, 0)}
          </span>
        </div>
      </div>

      {/* Phone: simple ranked list */}
      <ol className="flex flex-col gap-2 sm:hidden">
        {stops.map((s) => (
          <li key={s.key} className="flex items-center gap-3">
            <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-[3px] ${DOT[s.tone]}`} aria-hidden="true" />
            <span className="flex-1 text-[15px]">{s.label}</span>
            <span className="num font-bold">{pct(s.rate)}</span>
          </li>
        ))}
        <li className="flex items-center gap-3 border-t border-line pt-2 text-[15px]">
          <span className="h-3.5 w-3.5 shrink-0 border-l-2 border-dashed border-ink" aria-hidden="true" />
          <span className="flex-1">Industry benchmark</span>
          <span className="num font-bold">{pct(benchmark, 0)}</span>
        </li>
      </ol>
    </figure>
  );
}
