import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WaterfallStep } from '../lib/calc';
import type { CauseKey } from '../api/types';

/** The end bar is the ceiling (every cause fully removed), so it is drawn light and dashed, like on the vendor page. */
const COLORS = { start: '#A84F0B', cause: '#0E6B63', end: '#B9D9D3' } as const;

interface Props {
  steps: WaterfallStep[];
  benchmark: number; // 0..1
  selected?: CauseKey | null;
  onSelect?: (cause: CauseKey) => void;
}

export function WrapTick(props: { x?: number; y?: number; payload?: { value: string } }) {
  const { x = 0, y = 0, payload } = props;
  const words = (payload?.value ?? '').split(' ');
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + w).length <= 14) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  return (
    <text x={x} y={y + 14} textAnchor="middle" fill="#3A4852" fontSize={13}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 15}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

export default function Waterfall({ steps, benchmark, selected, onSelect }: Props) {
  const summary = steps.map((s) => (s.kind === 'cause' ? `${s.label} +${s.value} points` : `${s.label} ${s.total}%`)).join('; ');
  return (
    <div className="h-[340px]" role="img" aria-label={`On-time delivery waterfall: ${summary}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={steps} margin={{ top: 28, right: 8, bottom: 30, left: -12 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="#E7ECEA" />
          <XAxis dataKey="label" interval={0} tickLine={false} axisLine={{ stroke: '#D9DFDD' }} tick={<WrapTick />} />
          <YAxis domain={[60, 100]} allowDataOverflow ticks={[60, 70, 80, 90, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} tick={{ fill: '#5E6B75', fontSize: 14 }} />
          <Tooltip
            cursor={{ fill: '#F3F5F4' }}
            content={({ active, payload }) => {
              const s = active && payload?.[0] ? (payload[0].payload as WaterfallStep) : null;
              if (!s) return null;
              return (
                <div className="rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-sm">
                  <div className="font-semibold">{s.label}</div>
                  {s.kind === 'cause' ? (
                    <div className="num">
                      +{s.value} pts, reaching {s.total}%
                    </div>
                  ) : (
                    <div className="num">{s.total}% on time</div>
                  )}
                </div>
              );
            }}
          />
          <ReferenceLine
            y={benchmark * 100}
            stroke="#15212B"
            strokeDasharray="5 4"
            label={{ value: `Benchmark ${Math.round(benchmark * 100)}%`, position: 'insideTopLeft', fill: '#15212B', fontSize: 13, dy: -18 }}
          />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar
            dataKey="value"
            stackId="w"
            isAnimationActive={false}
            radius={[3, 3, 0, 0]}
            onClick={(d: { payload?: WaterfallStep }) => {
              const c = d?.payload?.cause;
              if (c && onSelect) onSelect(c);
            }}
          >
            {steps.map((s) => (
              <Cell
                key={s.key}
                fill={COLORS[s.kind]}
                stroke={s.kind === 'end' ? '#0E6B63' : undefined}
                strokeDasharray={s.kind === 'end' ? '4 3' : undefined}
                fillOpacity={s.kind === 'cause' && selected && selected !== s.cause ? 0.35 : 1}
                cursor={s.kind === 'cause' && onSelect ? 'pointer' : 'default'}
              />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              content={(p) => {
                const { x = 0, y = 0, width = 0, index = 0 } = p as { x?: number; y?: number; width?: number; index?: number };
                const s = steps[index];
                if (!s) return null;
                const text = s.kind === 'cause' ? `+${s.value.toFixed(1)}` : `${s.total.toFixed(1)}%`;
                return (
                  <text x={Number(x) + Number(width) / 2} y={Number(y) - 7} textAnchor="middle" fontSize={14} fontWeight={700} fill={s.kind === 'start' ? '#A84F0B' : '#0A524C'}>
                    {text}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
