import { pct } from '../lib/format';

interface Props {
  value: number; // 0..1
  benchmark: number; // 0..1
  baseline: number; // 0..1
  min?: number;
  max?: number;
}

/** Half-circle gauge for projected on-time delivery, with today and benchmark marks. */
export default function Gauge({ value, benchmark, baseline, min = 0.5, max = 1 }: Props) {
  const R = 90;
  const cx = 110;
  const cy = 104;
  const angle = (r: number) => Math.PI * (1 - (Math.min(max, Math.max(min, r)) - min) / (max - min));
  const point = (r: number, radius = R) => [cx + radius * Math.cos(angle(r)), cy - radius * Math.sin(angle(r))] as const;
  const arc = (from: number, to: number) => {
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
  };
  const meets = value >= benchmark;
  const [bx1, by1] = point(benchmark, R - 16);
  const [bx2, by2] = point(benchmark, R + 16);
  const [tx1, ty1] = point(baseline, R - 11);
  const [tx2, ty2] = point(baseline, R + 11);

  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 220 124" className="w-full max-w-[340px]" role="img" aria-label={`Projected on-time delivery ${pct(value)}, benchmark ${pct(benchmark, 0)}`}>
        <path d={arc(min, max)} stroke="#E7ECEA" strokeWidth="16" fill="none" />
        <path d={arc(min, baseline)} stroke="#A84F0B" strokeOpacity="0.85" strokeWidth="16" fill="none" />
        {value > baseline && <path d={arc(baseline, value)} stroke={meets ? '#0A524C' : '#0E6B63'} strokeWidth="16" fill="none" style={{ transition: 'all 200ms ease-out' }} />}
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="#FFFFFF" strokeWidth="2.5" />
        <line x1={bx1} y1={by1} x2={bx2} y2={by2} stroke="#15212B" strokeWidth="2.5" strokeDasharray="3 2" />
        <text x={cx} y={cy - 18} textAnchor="middle" fontSize="34" fontWeight="700" fill={meets ? '#0A524C' : '#15212B'} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {pct(value)}
        </text>
        <text x={cx} y={cy + 2} textAnchor="middle" fontSize="12" fill="#3A4852">
          projected on time
        </text>
        <text x={cx - R} y={cy + 18} textAnchor="middle" fontSize="11" fill="#5E6B75">
          {Math.round(min * 100)}%
        </text>
        <text x={cx + R} y={cy + 18} textAnchor="middle" fontSize="11" fill="#5E6B75">
          {Math.round(max * 100)}%
        </text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-late" aria-hidden="true" />
          Today {pct(baseline)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-3 border-t-2 border-dashed border-ink" aria-hidden="true" />
          Benchmark {pct(benchmark, 0)}
        </span>
      </figcaption>
    </figure>
  );
}
