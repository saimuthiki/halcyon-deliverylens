import { useState } from 'react';
import { ExternalLink, History, MessageSquareReply } from 'lucide-react';
import { api } from '../api/client';
import type { AddressSuggestion, DeskProcessResult } from '../api/types';
import { ActorBadge } from './Actor';

const FIELD_WORDS: Record<string, string> = { street: 'street', city: 'city', state: 'state', postcode: 'postcode' };

/** The address suggested from the client's delivery history, if this trace held the order for confirmation. */
export function addressSuggestion(r: DeskProcessResult): AddressSuggestion | null {
  if (r.decision !== 'on_hold') return null;
  const step = r.steps.find((s) => s.key === 'address_check');
  const sug = step?.details?.suggestion as AddressSuggestion | undefined;
  return sug && sug.address && sug.token ? sug : null;
}

/** Filled from history, waiting for the client: open their one-click link, or simulate their one-line reply. */
export default function AddressConfirmCard({
  r,
  suggestion,
  onResult,
  onRecheck,
  busy,
}: {
  r: DeskProcessResult;
  suggestion: AddressSuggestion;
  onResult: (trace: DeskProcessResult) => void;
  onRecheck: () => void;
  busy: boolean;
}) {
  const [reply, setReply] = useState("Yes, that's right. Thanks!");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const a = suggestion.address;
  const missing = (r.steps.find((s) => s.key === 'address_check')?.details?.missing as string[] | undefined) ?? [];
  const confirmPath = `/confirm-address/${suggestion.token}`;

  async function sendReply() {
    setSending(true);
    setNote(null);
    try {
      const res = await api.clientReply(r.message_id, reply);
      const out = res.data.reply;
      if (res.data.trace) {
        onResult(res.data.trace);
        setNote({ tone: 'ok', text: out.outcome === 'corrected' ? 'The client corrected the address; the order was run again.' : 'The client confirmed; the order was run again.' });
      } else if (out.outcome === 'blocked') {
        setNote({ tone: 'warn', text: `The reply was blocked by the guardrail: ${out.reason ?? 'it tries to instruct the AI'}. The order stays on hold.` });
      } else {
        setNote({ tone: 'warn', text: 'The reply does not confirm or correct the address, so the order stays on hold for a person to read it.' });
      }
    } catch (err) {
      setNote({ tone: 'warn', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="panel panel-pad" aria-labelledby="addr-title" data-testid="address-confirm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="addr-title" className="text-lg font-semibold">
          Address found in the client's history
        </h2>
        <ActorBadge actor="Data lookup" />
      </div>
      <p className="mt-1 text-[15px] text-ink-soft">
        The email left out the {missing.map((m) => FIELD_WORDS[m] ?? m).join(', ') || 'address'}. This is the only site on file that matches the{' '}
        {suggestion.matched_on.join(', ')} it did give. Nothing ships until the client confirms.
      </p>
      <div className="mt-3 flex gap-3 rounded-md border border-route/30 bg-route-tint px-4 py-3">
        <History className="mt-0.5 h-5 w-5 shrink-0 text-route-dark" aria-hidden="true" />
        <address className="not-italic text-[15px] leading-relaxed">
          <span className="font-semibold">{suggestion.site_name}</span>
          <br />
          {a.street}
          <br />
          {a.city}, {a.state} <span className={missing.includes('postcode') ? 'font-semibold text-route-dark' : ''}>{a.postcode}</span>
          <span className="mt-1 block text-sm text-slate">
            {suggestion.deliveries_to_site} past deliveries{suggestion.last_delivered ? `, last on ${suggestion.last_delivered}` : ''}
          </span>
        </address>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a className="btn-secondary" href={confirmPath} target="_blank" rel="noreferrer">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open the client's one-click link
        </a>
        <button type="button" className="btn-quiet" onClick={onRecheck} disabled={busy}>
          Confirmed in the other tab? Run again
        </button>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="client-reply" className="text-[15px] font-semibold">
            Or simulate the client's email reply
          </label>
          <ActorBadge actor="AI agent" name="Reply Reader Agent" />
        </div>
        <textarea id="client-reply" className="field mt-2 min-h-[72px]" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={5000} />
        <p className="mt-1 text-sm text-slate">Try "Yes", a different street or ZIP, or an unclear reply. A corrected detail is used only if it appears in the reply word for word.</p>
        <button type="button" className="btn-primary mt-2" onClick={sendReply} disabled={sending || busy || !reply.trim()}>
          <MessageSquareReply className="h-4 w-4" aria-hidden="true" />
          {sending ? 'Reading the reply…' : 'Send reply'}
        </button>
        {note && (
          <p className={`mt-2 text-[15px] ${note.tone === 'ok' ? 'text-route-dark' : 'text-late'}`} role="status">
            {note.text}
          </p>
        )}
      </div>
    </section>
  );
}
