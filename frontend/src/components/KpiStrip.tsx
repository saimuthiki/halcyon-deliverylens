import type { ReactNode } from 'react';

export interface Kpi {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'default' | 'late' | 'route';
}

export default function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <dl className="panel grid grid-cols-2 divide-line overflow-hidden lg:grid-cols-4 lg:divide-x [&>div:nth-child(-n+2)]:border-b [&>div:nth-child(-n+2)]:border-line lg:[&>div:nth-child(-n+2)]:border-b-0 [&>div:nth-child(odd)]:border-r [&>div:nth-child(odd)]:border-line lg:[&>div:nth-child(odd)]:border-r-0">
      {items.map((k) => (
        <div key={k.label} className="flex flex-col gap-1 px-5 py-4 sm:px-6 sm:py-5">
          <dt className="text-[15px] text-ink-soft">{k.label}</dt>
          <dd className={`num text-[28px] font-bold leading-tight tracking-tight ${k.tone === 'late' ? 'text-late' : k.tone === 'route' ? 'text-route-dark' : 'text-ink'}`}>
            {k.value}
          </dd>
          {k.note && <dd className="text-sm text-slate">{k.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
