import { useId } from 'react';
import { ChevronDown, CircleHelp } from 'lucide-react';
import { useStoredFlag } from '../lib/useApi';
import type { HelpContent } from '../lib/help';

/**
 * "What am I looking at?" — a short, plain-English key to the page. Closed by default; whether it is
 * open is remembered per page in localStorage.
 */
export default function HelpPanel({ pageKey, content }: { pageKey: string; content: HelpContent }) {
  const [open, setOpen] = useStoredFlag(`deliverylens.help.${pageKey}`, false);
  const id = useId();
  return (
    <section className="mb-7 rounded-lg border border-line bg-surface" data-testid="help-panel" aria-label="What am I looking at?">
      <button
        type="button"
        className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-4 text-left text-[15px] font-semibold text-route-dark hover:bg-route-tint/60"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <CircleHelp className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        <span className="flex-1">What am I looking at?</span>
        <span className="hidden text-sm font-normal text-slate sm:inline">{open ? 'Hide' : 'A plain-English key to this page'}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="border-t border-line px-4 pb-4 pt-3">
          {content.intro && <p className="mb-3 max-w-[80ch] text-[15px] text-ink-soft">{content.intro}</p>}
          <dl className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {content.items.map((it) => (
              <div key={it.term} className="max-w-[70ch]">
                <dt className="text-[15px] font-semibold text-ink">{it.term}</dt>
                <dd className="text-[15px] leading-relaxed text-ink-soft">
                  {it.text}
                  {it.example && (
                    <>
                      {' '}
                      <span className="text-ink">Example: {it.example}</span>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
