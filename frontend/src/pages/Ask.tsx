import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { api } from '../api/client';
import type { DataSource } from '../api/types';
import PageHeader from '../components/PageHeader';
import { SourceTag } from '../components/States';

const SUGGESTIONS = [
  'Should we sign the $680K routing vendor?',
  'What is the biggest cause of late deliveries?',
  'Which carriers are weak, and where?',
  'How much have late deliveries cost us in penalties?',
  'Which clients are at risk of leaving?',
  'What happens to same-day orders after 08:00?',
];

interface Message {
  role: 'user' | 'assistant';
  text: string;
  source?: DataSource;
  error?: boolean;
}

export default function Ask() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const r = await api.ask(q);
      setMessages((m) => [...m, { role: 'assistant', text: r.data.answer, source: r.source }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: `The question could not be answered: ${err instanceof Error ? err.message : String(err)}. Try again or rephrase it.`, error: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };

  return (
    <>
      <PageHeader title="Ask DeliveryLens" lede="Ask about late deliveries in plain English. Answers come from the same analysis of 48,340 deliveries behind every page here." />
      <div className="panel flex min-h-[520px] flex-col">
        <div className="flex-1 overflow-y-auto p-5 sm:p-6" aria-live="polite">
          {messages.length === 0 ? (
            <div>
              <p className="mb-3 font-semibold">Try one of these</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="rounded-full border border-line bg-surface px-3.5 py-2 text-left text-[15px] text-ink transition-colors hover:border-route hover:bg-route-tint" onClick={() => ask(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="flex flex-col gap-4">
              {messages.map((m, i) => (
                <li key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={`max-w-[680px] rounded-lg px-4 py-3 text-[15px] leading-relaxed ${
                      m.role === 'user' ? 'bg-ink text-white' : m.error ? 'border border-late/40 bg-late-tint text-ink' : 'border border-line bg-paper text-ink'
                    }`}
                  >
                    <span className="sr-only">{m.role === 'user' ? 'You asked: ' : 'DeliveryLens: '}</span>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {m.source === 'sample' && (
                      <div className="mt-2">
                        <SourceTag source="sample" />
                      </div>
                    )}
                  </div>
                </li>
              ))}
              {busy && (
                <li className="flex justify-start">
                  <div className="rounded-lg border border-line bg-paper px-4 py-3 text-[15px] text-slate">Looking at the data…</div>
                </li>
              )}
            </ol>
          )}
          <div ref={endRef} />
        </div>
        {messages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-t border-line px-5 py-3 sm:px-6">
            {SUGGESTIONS.slice(0, 4).map((s) => (
              <button key={s} type="button" disabled={busy} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-route hover:text-ink disabled:opacity-50" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit} className="flex gap-2 border-t border-line p-4 sm:p-5">
          <label htmlFor="question" className="sr-only">
            Your question
          </label>
          <input id="question" className="field flex-1" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about causes, carriers, clients or costs" autoComplete="off" />
          <button type="submit" className="btn-primary" disabled={!input.trim() || busy}>
            <Send className="h-4 w-4" aria-hidden="true" />
            Ask
          </button>
        </form>
      </div>
    </>
  );
}
