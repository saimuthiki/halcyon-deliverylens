import { useId } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { useApiStatus, useHealth } from '../lib/useApi';
import type { Health } from '../api/types';

/** "AI: Mock (canned)" / "AI: Gemini gemini-2.0-flash" / "AI: Bedrock" from /api/health. */
export function aiLabel(h: Pick<Health, 'llm_provider' | 'llm_model'> | null | undefined): string {
  const provider = (h?.llm_provider ?? '').toLowerCase();
  const model = h?.llm_model ? String(h.llm_model) : '';
  if (!provider) return 'AI: unknown';
  if (provider === 'mock') return 'AI: Mock (canned)';
  if (provider === 'gemini') return `AI: Gemini${model ? ` ${model}` : ''}`;
  if (provider === 'bedrock') return 'AI: Bedrock';
  if (provider === 'sample') return 'AI: sample (offline)';
  return `AI: ${provider}${model ? ` ${model}` : ''}`;
}

export default function AiBadge({ className = '' }: { className?: string }) {
  const health = useHealth();
  const status = useApiStatus();
  const tipId = useId();

  if (status === 'offline' || (!health && status !== 'unknown')) {
    return (
      <span data-testid="ai-badge" className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1 text-sm text-slate ${className}`}>
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        AI: API offline
      </span>
    );
  }
  if (!health) return null;

  const label = aiLabel(health);
  const notReady = health.llm_ready === false;
  if (!notReady) {
    return (
      <span data-testid="ai-badge" className={`inline-flex max-w-full items-center gap-1.5 rounded-full border border-ai/30 bg-ai-tint px-2.5 py-1 text-sm font-medium text-ai ${className}`}>
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <span className={`group relative inline-flex max-w-full ${className}`}>
      <button
        type="button"
        data-testid="ai-badge"
        aria-describedby={tipId}
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-late/40 bg-late-tint px-2.5 py-1 text-sm font-medium text-late"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
        <span className="sr-only">(not ready)</span>
      </button>
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-40 mt-1.5 w-[260px] rounded-md bg-ink px-3 py-2 text-sm text-white opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        The AI model is not ready. Add GEMINI_API_KEY to backend/.env and restart the API.
      </span>
    </span>
  );
}
