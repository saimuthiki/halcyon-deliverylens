import { AlertTriangle, RotateCw } from 'lucide-react';
import type { DataSource } from '../api/types';

export function LoadingBlock({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="panel panel-pad">
      <span className="sr-only">{label}</span>
      <div className="flex animate-pulse flex-col gap-3" aria-hidden="true">
        <div className="h-5 w-1/3 rounded bg-slate-light" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-4 rounded bg-slate-light" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="panel panel-pad flex flex-col items-start gap-3 border-late/40 sm:flex-row sm:items-center">
      <AlertTriangle className="h-5 w-5 shrink-0 text-late" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-semibold">This section could not load.</p>
        <p className="text-[15px] text-ink-soft">{message}</p>
      </div>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}

export function SourceTag({ source }: { source: DataSource | null }) {
  if (source !== 'sample') return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-late/30 bg-late-tint px-2.5 py-0.5 text-sm text-late">
      <span className="h-1.5 w-1.5 rounded-full bg-late" aria-hidden="true" />
      Sample data
    </span>
  );
}
