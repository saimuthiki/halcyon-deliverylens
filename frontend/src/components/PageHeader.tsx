import type { ReactNode } from 'react';

export default function PageHeader({ title, lede, aside }: { title: ReactNode; lede?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-[760px]">
        <h1 className="text-[28px] font-bold leading-[1.15] tracking-tight sm:text-[34px]">{title}</h1>
        {lede && <p className="mt-2.5 text-[17px] leading-relaxed text-ink-soft">{lede}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}

export function SectionTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="text-lg font-semibold">{children}</h2>
      {note && <p className="text-sm text-slate">{note}</p>}
    </div>
  );
}
