import { pct } from '../lib/format';

type Tone = 'today' | 'vendor' | 'process' | 'realistic' | 'ceiling';

export interface TrackStop {
  key: string;
  rate: number;
  label: string;
  tone: Tone;
  /** Above or below the road on wider screens; alternating keeps close stops readable. */
  side: 'above' | 'below';
}

interface Props {
  today: number;
  routingOnly: number;
  processOnly: number;
  /** All five fixes at realistic effectiveness: the headline outcome. */
  realistic: number;
  /** Every cause fully removed: a ceiling, not a forecast. */
  ceiling: number;
  benchmark: number;
  min?: number;
  max?: number;
}

const DOT: Record<Tone, string> = {
  today: 'bg-late border-late',
  vendor: 'bg-surface border-slate',
  process: 'bg-surface border-route',
  realistic: 'bg-route border-route',
  ceiling: 'bg-surface border-route border-dashed',
};

const NUMBER: Record<Tone, string> = {
  today: 'text-late',
  vendor: 'text-ink-soft',
  process: 'text-route-dark',
  realistic: 'text-route-dark',
  ceiling: 'text-ink-soft',
};

/**
 * The signature graphic: on-time delivery as a road from today to the benchmark, with each option
 * marked where it would get Halcyon. The realistic case is the destination; the ceiling is drawn
 * faint and dashed because it assumes every cause is removed completely.
 */
export default function DeliveryTrack({ today, routingOnly, processOnly, realistic, ceiling, benchmark, min = 0.6, max = 1 }: Props) {
  const frac = (r: number) => (Math.min(max, Math.max(min, r)) - min) / (max - min);
  const pos = (r: number) => `${(frac(r) * 100).toFixed(2)}%`;
  const stops: TrackStop[] = [
    { key: 'today', rate: today, label: 'Today', tone: 'today', side: 'above' },
    { key: 'vendor', rate: routingOnly, label: 'Routing vendor only', tone: 'vendor', side: 'above' },
    { key: 'process', rate: processOnly, label: 'Process fixes only', tone: 'process', side: 'below' },
    { key: 'realistic', rate: realistic, label: 'All five fixes, realistic', tone: 'realistic', side: 'above' },
    { key: 'ceiling', rate: ceiling, label: 'Ceiling, if every cause were fully removed', tone: 'ceiling', side: 'below' },
  ];
  const ticks: number[] = [];
  for (let t = Math.ceil(min * 10) / 10; t <= max + 1e-9; t += 0.1) ticks.push(Math.round(t * 100) / 100);

  const label = (s: TrackStop) => {
    // Stops near the right edge, and the below-the-road stops, end at their dot so neighbours never collide.
    const anchorRight = s.side === 'below' || frac(s.rate) > 0.86;
    return (
      <div
        key={s.key}
        className={`absolute ${s.side === 'above' ? 'bottom-1' : 'top-1'} ${anchorRight ? '-translate-x-full text-right' : '-translate-x-1/2 text-center'}`}
        style={{ left: pos(s.rate), ...(anchorRight ? { marginLeft: 10 } : {}) }}
      >
        <div
          className={`num font-bold leading-none tracking-tight ${NUMBER[s.tone]} ${s.tone === 'realistic' ? 'text-[34px]' : s.tone === 'ceiling' ? 'text-[22px]' : 'text-[26px]'}`}
        >
          {pct(s.rate)}
        </div>
        <div
          className={`mt-1 text-sm ${s.tone === 'realistic' ? 'font-semibold text-ink' : 'text-ink-soft'} ${s.tone === 'ceiling' ? 'w-[170px] leading-snug' : 'whitespace-nowrap'}`}
        >
          {s.label}
        </div>
      </div>
    );
  };

  return (
    <figure
      className="w-full"
      aria-label={`On-time delivery today ${pct(today)}; routing vendor only ${pct(routingOnly)}; process fixes only ${pct(processOnly)}; all five fixes, realistic ${pct(realistic)}; ceiling if every cause were fully removed ${pct(ceiling)}; benchmark ${pct(benchmark, 0)}.`}
    >
      {/* Tablet / desktop: positioned track */}
      <div className="relative hidden md:block" aria-hidden="true">
        <div className="relative h-[78px]">{stops.filter((s) => s.side === 'above').map(label)}</div>

        <div className="relative mt-2 h-3">
          <div className="absolute inset-0 rounded-full bg-slate-light" />
          <div className="absolute inset-y-0 left-0 rounded-l-full bg-late/80" style={{ width: pos(today) }} />
          <div
            className="absolute inset-y-0 bg-[repeating-linear-gradient(90deg,#0E6B63_0_10px,transparent_10px_16px)] opacity-70"
            style={{ left: pos(today), width: `calc(${pos(realistic)} - ${pos(today)})` }}
          />
          <div
            className="absolute inset-y-0 bg-[repeating-linear-gradient(90deg,#0E6B63_0_3px,transparent_3px_9px)] opacity-30"
            style={{ left: pos(realistic), width: `calc(${pos(ceiling)} - ${pos(realistic)})` }}
          />
          {/* benchmark */}
          <div className="absolute -top-2 bottom-[-6px] w-0 border-l-2 border-dashed border-ink" style={{ left: pos(benchmark) }} />
          {stops.map((s) => (
            <span
              key={s.key}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${s.tone === 'realistic' ? 'h-[22px] w-[22px] border-4' : 'h-[18px] w-[18px] border-[3px]'} ${DOT[s.tone]}`}
              style={{ left: pos(s.rate) }}
            />
          ))}
        </div>

        <div className="relative mt-2 h-6 text-sm text-slate">
          {ticks.map((t) => (
            <span key={t} className={`num absolute ${t >= max ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: pos(t) }}>
              {Math.round(t * 100)}%
            </span>
          ))}
          <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap bg-surface px-1.5 font-semibold text-ink" style={{ left: pos(benchmark) }}>
            Benchmark {pct(benchmark, 0)}
          </span>
        </div>

        <div className="relative h-[64px]">{stops.filter((s) => s.side === 'below').map(label)}</div>
      </div>

      {/* Phone: simple ranked list */}
      <ol className="flex flex-col gap-2 md:hidden">
        {stops.map((s) => (
          <li key={s.key} className="flex items-center gap-3">
            <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-[3px] ${DOT[s.tone]}`} aria-hidden="true" />
            <span className={`flex-1 text-[15px] ${s.tone === 'realistic' ? 'font-semibold' : ''}`}>{s.label}</span>
            <span className={`num font-bold ${NUMBER[s.tone]}`}>{pct(s.rate)}</span>
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
