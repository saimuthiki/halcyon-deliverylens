import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { api } from '../api/client';
import type { DataSource } from '../api/types';
import PageHeader from '../components/PageHeader';
import { SampleResponseNotice } from '../components/States';

/** Sample questions by topic. Each one is answered by one of the fixed data tools in backend/app/agents/ask.py. */
const QUESTION_GROUPS: { topic: string; questions: string[] }[] = [
  { topic: 'The big picture', questions: ['What is our on-time rate today?', 'How much have late deliveries cost us in penalties?'] },
  { topic: 'Why deliveries are late', questions: ['What is the biggest cause of late deliveries?', 'What if we fix everything?'] },
  { topic: 'The routing software decision', questions: ['Should we sign the $680K routing vendor?', 'What is the payback of the plan?'] },
  { topic: 'Carriers', questions: ['Which carriers are weak, and where?', 'Which carrier is best for the West region?'] },
  { topic: 'Clients', questions: ['Which clients are at risk of leaving?', 'How much revenue is at risk?'] },
  { topic: 'Complaints', questions: ['What do clients complain about most?', 'Do we have a refund policy?'] },
];
const SUGGESTIONS = QUESTION_GROUPS.flatMap((g) => g.questions);
/** One question per topic, for the row under a conversation. */
const QUICK = QUESTION_GROUPS.map((g) => g.questions[0]);
/** Matches AskRequest.question min_length in backend/app/api/schemas.py. */
const MIN_QUESTION_LENGTH = 3;

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
    if (q.length < MIN_QUESTION_LENGTH) {
      // The API refuses questions this short; answer here instead of showing a validation error.
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: `Ask me a full question about Halcyon's deliveries, for example: "${SUGGESTIONS[0]}"` },
      ]);
      return;
    }
    setBusy(true);
    try {
      const r = await api.ask(q);
      setMessages((m) => [...m, { role: 'assistant', text: r.data.answer, source: r.source }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: `The question could not be answered. ${err instanceof Error ? err.message : String(err)}`, error: true },
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
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div>
                <p className="mb-3 font-semibold">Try a question</p>
                <div className="flex flex-col gap-4">
                  {QUESTION_GROUPS.map((g) => (
                    <div key={g.topic}>
                      <p className="mb-1.5 text-sm font-medium text-slate">{g.topic}</p>
                      <div className="flex flex-wrap gap-2">
                        {g.questions.map((q) => (
                          <button
                            key={q}
                            type="button"
                            className="rounded-full border border-line bg-surface px-3.5 py-2 text-left text-[15px] text-ink transition-colors hover:border-route hover:bg-route-tint"
                            onClick={() => ask(q)}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <AboutAsk />
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
                    <SampleResponseNotice source={m.source ?? null} className="mt-2" />
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
            {QUICK.map((s) => (
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

/** What Ask can answer, where the answers come from, and what it cannot answer. */
function AboutAsk() {
  return (
    <aside className="rounded-md border border-line bg-paper p-4 text-[15px] leading-relaxed" aria-labelledby="about-ask">
      <h2 id="about-ask" className="font-semibold">
        What Ask can do
      </h2>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink-soft">
        <li>Answers questions about on-time delivery, causes, carriers, clients, complaints and costs.</li>
        <li>The AI picks from 8 fixed data tools; it never writes its own database queries.</li>
        <li>Every answer must quote the numbers it used, and it says so when the data has no answer.</li>
      </ul>
      <h2 className="mt-4 font-semibold">Where the answers come from</h2>
      <p className="text-ink-soft">Halcyon&apos;s data, 1 April to 25 September 2026:</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
        <li>48,340 deliveries, 4,847 SLA penalties</li>
        <li>6 carriers and their rates, 5 warehouses</li>
        <li>280 clients, 34 complaints</li>
        <li>Our analysis on top: the 5 causes, the fixes and their costs</li>
      </ul>
      <h2 className="mt-4 font-semibold">What it cannot answer</h2>
      <p className="text-ink-soft">Anything outside this data: today&apos;s live shipments, weather, future demand or company policies.</p>
    </aside>
  );
}
