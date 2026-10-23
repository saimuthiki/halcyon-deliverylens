import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock,
  MinusCircle,
  Paperclip,
  PauseCircle,
  Play,
  PlayCircle,
  RotateCcw,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../api/client';
import { sampleTrace } from '../api/deskFixtures';
import type { DataSource, DeskDecision, DeskDraft, DeskMessage, DeskMessageDetail, DeskProcessAll, DeskProcessResult, DeskStep, WmsOrder } from '../api/types';
import { useApi, useHealth, type ApiState } from '../lib/useApi';
import PageHeader, { SectionTitle } from '../components/PageHeader';
import { ErrorState, LoadingBlock } from '../components/States';
import { ActorBadge, ACTORS } from '../components/Actor';
import { aiLabel } from '../components/AiBadge';

/* ---------- labels and tones ---------- */

export const DECISION_META: Record<DeskDecision, { label: string; chip: string; panel: string; icon: typeof Check; meaning: string }> = {
  accepted: {
    label: 'Accepted',
    chip: 'border-route/30 bg-route-tint text-route-dark',
    panel: 'border-route/40 bg-route-tint',
    icon: CheckCircle2,
    meaning: 'Created in the warehouse system and put on a pick list.',
  },
  on_hold: {
    label: 'On hold',
    chip: 'border-late/30 bg-late-tint text-late',
    panel: 'border-late/40 bg-late-tint',
    icon: PauseCircle,
    meaning: 'Created in the warehouse system but held off the pick list until the client replies.',
  },
  needs_review: {
    label: 'Needs review',
    chip: 'border-data/30 bg-data-tint text-data',
    panel: 'border-data/40 bg-data-tint',
    icon: CircleHelp,
    meaning: 'A person decides before anything is picked. The AI does not guess.',
  },
  blocked: {
    label: 'Blocked',
    chip: 'border-guard/30 bg-guard-tint text-guard',
    panel: 'border-guard/40 bg-guard-tint',
    icon: Ban,
    meaning: 'Stopped by a guardrail. Nothing reached the warehouse system.',
  },
};

const STATUS_META: Record<DeskStep['status'], { label: string; icon: typeof Check; cls: string }> = {
  pass: { label: 'Passed', icon: CheckCircle2, cls: 'text-route' },
  warn: { label: 'Warning', icon: AlertTriangle, cls: 'text-late' },
  fail: { label: 'Failed', icon: XCircle, cls: 'text-guard' },
  skipped: { label: 'Skipped', icon: MinusCircle, cls: 'text-slate' },
};

/** WMS status chip. Matches on the prefix, so "on_hold_missing_address" reads "On hold" with "missing address" underneath. */
export function wmsStatus(status: string): { label: string; chip: string; detail: string | null } {
  const s = (status || '').toLowerCase();
  const rest = (prefix: string) => {
    const r = s.slice(prefix.length).replace(/^_+/, '').replace(/_/g, ' ');
    return r || null;
  };
  if (s.startsWith('ready') || s === 'accepted') return { label: 'Ready for pick list', chip: DECISION_META.accepted.chip, detail: null };
  if (s.startsWith('on_hold')) return { label: 'On hold', chip: DECISION_META.on_hold.chip, detail: rest('on_hold') };
  if (s.startsWith('needs_review')) return { label: 'Needs review', chip: DECISION_META.needs_review.chip, detail: rest('needs_review') };
  return { label: humanKey(s || 'unknown'), chip: 'border-line bg-paper text-ink', detail: null };
}

function DecisionChip({ decision, prefix }: { decision: DeskDecision; prefix?: string }) {
  const m = DECISION_META[decision];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-sm font-medium ${m.chip}`}>
      {prefix}
      {m.label}
    </span>
  );
}

function clock(iso: string) {
  const m = /[T ](\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : iso;
}

function fullTime(iso: string) {
  const d = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function duration(ms: number) {
  if (!ms) return '0 ms';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

const humanKey = (k: string) => {
  const t = k.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/* ---------- page ---------- */

export default function OrderDesk() {
  const inbox = useApi(() => api.deskInbox());
  const wms = useApi(() => api.deskWmsOrders());
  const health = useHealth();
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { data: DeskProcessResult; source: DataSource }>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ data: DeskProcessAll; source: DataSource } | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [resetting, setResetting] = useState(false);

  const messages = inbox.data ?? [];
  useEffect(() => {
    if (!selected && messages.length) setSelected(messages[0].id);
  }, [messages, selected]);

  const message = useApi<DeskMessageDetail | null>(
    () => (selected ? api.deskMessage(selected) : Promise.resolve({ data: null, source: 'live' as DataSource })),
    [selected],
  );

  const offline = inbox.source === 'sample';
  const current = selected ? results[selected] : undefined;
  // Offline, show the pre-computed trace for the selected email straight away (clearly labelled).
  const shown: { data: DeskProcessResult; source: DataSource; preview: boolean } | null = current
    ? { ...current, preview: false }
    : offline && selected
      ? { data: sampleTrace(selected), source: 'sample', preview: true }
      : null;

  const lastLive = Object.values(results).find((r) => r.source === 'live')?.data;
  const modelLabel = offline ? 'AI: sample (offline)' : lastLive?.llm_provider ? aiLabel({ llm_provider: lastLive.llm_provider, llm_model: lastLive.llm_model }) : aiLabel(health);

  const refresh = () => {
    inbox.reload();
    wms.reload();
  };

  async function runOne(id: string) {
    setRunning(id);
    setRunError(null);
    try {
      const r = await api.deskProcess(id);
      setResults((prev) => ({ ...prev, [id]: { data: r.data, source: r.source } }));
      refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  }

  async function runAll() {
    setBatchRunning(true);
    setRunError(null);
    try {
      const r = await api.deskProcessAll();
      setBatch({ data: r.data, source: r.source });
      refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setBatchRunning(false);
    }
  }

  async function reset() {
    setResetting(true);
    setRunError(null);
    try {
      await api.deskReset();
      setResults({});
      setBatch(null);
      refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Order desk: client emails in, warehouse orders out"
        lede="Today staff type email orders into the warehouse system (WMS) by hand, and 28% arrive with part of the address missing. Here DeliveryLens does that job: run it on a sample email and watch each step, who did it, and what lands in the WMS."
        aside={
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span className="text-sm text-slate">Answering now</span>
            <span
              data-testid="desk-model"
              className="inline-flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai-tint px-2.5 py-1 text-sm font-medium text-ai"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {modelLabel}
            </span>
          </div>
        }
      />

      {offline && (
        <p role="note" data-testid="desk-offline" className="mb-6 flex items-start gap-2 rounded-md border border-late/40 bg-late-tint px-4 py-3 text-[15px] text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-late" aria-hidden="true" />
          <span>
            <span className="font-semibold">Sample — API offline.</span> The inbox and every trace below are pre-computed examples, not a live run. Start the
            API to run the real pipeline.
          </span>
        </p>
      )}

      {runError && (
        <div className="mb-6">
          <ErrorState message={runError} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* Inbox */}
        <section className="panel flex flex-col lg:max-h-[640px]" aria-labelledby="inbox-title">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 id="inbox-title" className="text-lg font-semibold">
              Inbox <span className="num font-normal text-slate">({messages.length})</span>
            </h2>
            <button type="button" className="btn-secondary min-h-[36px] px-3 text-sm" onClick={runAll} disabled={batchRunning || !messages.length}>
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              {batchRunning ? 'Running all…' : `Run all ${messages.length || 12}`}
            </button>
          </div>
          {batch && (
            <p data-testid="batch-summary" className="border-b border-line bg-paper px-4 py-2 text-sm text-ink">
              <span className="font-semibold">
                {batch.data.matches_expected} of {batch.data.processed}
              </span>{' '}
              decisions match the expected result{batch.source === 'sample' ? ' (sample)' : ''}.
            </p>
          )}
          {inbox.loading && !inbox.data ? (
            <div className="p-4">
              <LoadingBlock label="Loading inbox" rows={6} />
            </div>
          ) : inbox.error ? (
            <div className="p-4">
              <ErrorState message={inbox.error} onRetry={inbox.reload} />
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto" aria-label="Client emails">
              {messages.map((m) => (
                <InboxItem key={m.id} m={m} active={m.id === selected} running={running === m.id} onSelect={() => setSelected(m.id)} />
              ))}
            </ul>
          )}
        </section>

        {/* Selected email */}
        <section className="panel flex flex-col" aria-labelledby="email-title">
          <h2 id="email-title" className="sr-only">
            Selected email
          </h2>
          {message.loading && !message.data ? (
            <div className="p-5">
              <LoadingBlock label="Loading email" rows={8} />
            </div>
          ) : message.error ? (
            <div className="p-5">
              <ErrorState message={message.error} onRetry={message.reload} />
            </div>
          ) : message.data ? (
            <EmailView m={message.data} running={running === message.data.id} onRun={() => runOne(message.data!.id)} disabled={!!running || batchRunning} />
          ) : (
            <p className="p-5 text-ink-soft">Select an email from the inbox.</p>
          )}
        </section>
      </div>

      {/* Trace + decision */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="panel panel-pad" aria-labelledby="trace-title" aria-live="polite" aria-busy={!!running}>
          <SectionTitle note={shown ? `${shown.data.steps.length} steps, ${duration(shown.data.steps.reduce((t, s) => t + s.duration_ms, 0))} in total` : undefined}>
            <span id="trace-title">Pipeline trace{shown ? ` for email ${shown.data.message_id}` : ''}</span>
          </SectionTitle>
          {shown?.source === 'sample' && <SampleLabel preview={shown.preview} />}
          {running && running === selected ? (
            <LoadingBlock label="Running the pipeline" rows={6} />
          ) : shown ? (
            <Trace steps={shown.data.steps} />
          ) : (
            <EmptyTrace message={messages.find((m) => m.id === selected)} />
          )}
        </section>

        <div className="flex flex-col gap-6">
          {shown && !(running && running === selected) ? (
            <>
              <DecisionCard r={shown.data} />
              <DraftCard draft={shown.data.client_email_draft} />
            </>
          ) : (
            <div className="panel panel-pad border-dashed text-ink-soft">
              <p className="font-semibold text-ink">No decision yet</p>
              <p className="text-[15px]">The decision and the drafted reply to the client appear here after a run.</p>
            </div>
          )}
        </div>
      </div>

      {/* WMS */}
      <WmsTable state={wms} onReset={reset} resetting={resetting} />
    </>
  );
}

/* ---------- inbox ---------- */

function InboxItem({ m, active, running, onSelect }: { m: DeskMessage; active: boolean; running: boolean; onSelect: () => void }) {
  const processed = m.decision != null;
  const matches = processed && m.decision === m.expected_decision;
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        data-testid={`inbox-item-${m.id}`}
        className={`relative flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${active ? 'bg-route-tint' : 'hover:bg-paper'}`}
      >
        {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-route" aria-hidden="true" />}
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-semibold text-ink">
            <span className="num text-slate">{m.id}</span> {m.from_name}
          </span>
          <span className="num shrink-0 text-sm text-slate">{clock(m.received_at)}</span>
        </span>
        <span className="flex items-center gap-1.5 truncate text-sm text-ink-soft">
          {m.has_attachment && <Paperclip className="h-3.5 w-3.5 shrink-0" aria-label="Has attachment" />}
          <span className="truncate">{m.subject}</span>
        </span>
        <span className="text-sm text-ink">{m.scenario}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <DecisionChip decision={m.expected_decision} prefix="Expect: " />
          {running ? (
            <span className="inline-flex items-center gap-1 text-sm text-slate">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Running…
            </span>
          ) : processed ? (
            <span className={`inline-flex items-center gap-1 text-sm font-medium ${matches ? 'text-route-dark' : 'text-guard'}`} data-testid="inbox-status">
              {matches ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
              Done: {DECISION_META[m.decision!].label}
            </span>
          ) : (
            <span className="text-sm text-slate" data-testid="inbox-status">
              New
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/* ---------- email ---------- */

function EmailView({ m, running, onRun, disabled }: { m: DeskMessageDetail; running: boolean; onRun: () => void; disabled: boolean }) {
  return (
    <>
      <div className="border-b border-line px-5 py-4">
        <p className="text-lg font-semibold leading-snug" data-testid="email-subject">
          {m.subject}
        </p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[15px]">
          <dt className="text-slate">From</dt>
          <dd className="min-w-0 break-words">
            {m.from_name} <span className="text-slate">&lt;{m.from_email}&gt;</span>
          </dd>
          <dt className="text-slate">Received</dt>
          <dd>{fullTime(m.received_at)}</dd>
          <dt className="text-slate">Client</dt>
          <dd>{m.client_id ?? 'Unknown sender'}</dd>
        </dl>
        <p className="mt-3 rounded-md bg-paper px-3 py-2 text-sm text-ink">
          <span className="font-semibold">{m.scenario}.</span> {m.what_it_demonstrates}
        </p>
      </div>
      <div className="flex-1 px-5 py-4">
        <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words font-sans text-[15px] leading-relaxed text-ink" data-testid="email-body">
          {m.body}
        </pre>
        {m.attachments.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            {m.attachments.map((a) => (
              <figure key={a.filename} className="rounded-md border border-line">
                <figcaption className="flex items-center gap-2 border-b border-line bg-paper px-3 py-1.5 text-sm">
                  <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="font-semibold">{a.filename}</span>
                  <span className="text-slate">{a.content_type}</span>
                </figcaption>
                <pre className="max-h-[160px] overflow-auto whitespace-pre-wrap px-3 py-2 text-sm text-ink">{a.text}</pre>
              </figure>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
        <button type="button" className="btn-primary" onClick={onRun} disabled={disabled}>
          <Play className="h-4 w-4" aria-hidden="true" />
          {running ? 'Running DeliveryLens…' : 'Run DeliveryLens on this email'}
        </button>
        <span className="text-sm text-slate">10 steps: guardrail, AI reading, rules and data checks, decision, reply.</span>
      </div>
    </>
  );
}

/* ---------- trace ---------- */

function SampleLabel({ preview }: { preview: boolean }) {
  return (
    <p role="note" data-testid="sample-response" className="mb-4 flex items-start gap-2 rounded-md border border-late/40 bg-late-tint px-3 py-2 text-sm text-ink">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-late" aria-hidden="true" />
      <span>
        <span className="font-semibold">Sample — API offline.</span> {preview ? 'A pre-computed example trace for this email.' : 'Pre-computed result, not a live run.'}
      </span>
    </p>
  );
}

function EmptyTrace({ message }: { message?: DeskMessage }) {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-8 text-center text-ink-soft">
      {message?.decision ? (
        <p>
          This email was processed in a batch and ended <span className="font-semibold text-ink">{DECISION_META[message.decision].label}</span>. Run it again
          to see each step.
        </p>
      ) : (
        <p>Select Run DeliveryLens on this email to see every step, who did it and why.</p>
      )}
    </div>
  );
}

export function Trace({ steps }: { steps: DeskStep[] }) {
  return (
    <ol className="flex flex-col" data-testid="trace">
      {steps.map((s, i) => (
        <TraceStep key={`${s.step}-${s.key}`} s={s} last={i === steps.length - 1} />
      ))}
    </ol>
  );
}

function TraceStep({ s, last }: { s: DeskStep; last: boolean }) {
  const [open, setOpen] = useState(false);
  const st = STATUS_META[s.status] ?? STATUS_META.pass;
  const actor = ACTORS[s.actor] ?? ACTORS.Rule;
  const StatusIcon = st.icon;
  const hasDetails = Object.keys(s.details ?? {}).length > 0;
  return (
    <li className="relative flex gap-3 pb-4" data-testid="trace-step" data-status={s.status} data-key={s.key}>
      <div className="flex flex-col items-center">
        <span
          className={`num inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${s.status === 'skipped' ? 'bg-slate/50' : actor.solid}`}
        >
          {s.step}
        </span>
        {!last && <span className="mt-1 w-[2px] flex-1 bg-line" aria-hidden="true" />}
      </div>
      <div className={`min-w-0 flex-1 ${s.status === 'skipped' ? 'opacity-70' : ''}`}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="text-[15px] font-semibold">{s.title}</h3>
          <ActorBadge actor={s.actor} name={s.agent_name || undefined} />
          <span className={`inline-flex items-center gap-1 text-sm font-medium ${st.cls}`}>
            <StatusIcon className="h-4 w-4" aria-hidden="true" />
            {st.label}
          </span>
          <span className="num ml-auto text-sm text-slate">{duration(s.duration_ms)}</span>
        </div>
        <p className="mt-1 text-[15px] leading-snug text-ink-soft">{s.summary}</p>
        {hasDetails && (
          <>
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-route hover:underline"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              {open ? 'Hide details' : 'Details'}
            </button>
            {open && (
              <div className="mt-2 rounded-md border border-line bg-paper px-3 py-2">
                <KeyValues value={s.details} />
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/** Friendly view of a details object: keys in plain words, yes/no for booleans, lists joined. */
export function KeyValues({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value == null || value === '') return <span className="text-slate">none</span>;
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>;
  if (typeof value === 'number' || typeof value === 'string') return <span className="break-words">{String(value)}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate">none</span>;
    if (value.every((v) => v == null || typeof v !== 'object')) return <span className="break-words">{value.map((v) => (v == null ? '–' : String(v))).join(', ')}</span>;
    return (
      <ul className="flex flex-col gap-1">
        {value.map((v, i) => (
          <li key={i} className="rounded border border-line bg-surface px-2 py-1">
            <KeyValues value={v} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return <span className="text-slate">none</span>;
    if (depth > 3) return <span className="break-words">{JSON.stringify(value)}</span>;
    return (
      <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate">{humanKey(k)}</dt>
            <dd className="text-ink">
              <KeyValues value={v} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <>{String(value)}</>;
}

/* ---------- decision + draft ---------- */

export function DecisionCard({ r }: { r: DeskProcessResult }) {
  const m = DECISION_META[r.decision];
  const Icon = m.icon;
  return (
    <section className={`rounded-lg border p-5 sm:p-6 ${m.panel}`} aria-labelledby="decision-title" data-testid="decision-card" data-decision={r.decision}>
      <h2 id="decision-title" className="text-sm font-medium text-ink-soft">
        Decision for email {r.message_id}
      </h2>
      <p className="mt-1 flex items-center gap-2 text-[26px] font-bold leading-tight text-ink">
        <Icon className="h-7 w-7 shrink-0" aria-hidden="true" />
        {m.label}
      </p>
      <p className="mt-1 text-sm text-ink-soft">{m.meaning}</p>
      <p className="mt-3 text-[15px] leading-relaxed text-ink">{r.decision_reason}</p>
      <p
        className={`mt-4 inline-flex items-center gap-1.5 rounded-full border bg-surface px-2.5 py-1 text-sm font-semibold ${
          r.matches_expected ? 'border-route/40 text-route-dark' : 'border-guard/40 text-guard'
        }`}
        data-testid="matches-expected"
      >
        {r.matches_expected ? <Check className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
        {r.matches_expected ? 'Matches expected' : `Expected ${DECISION_META[r.expected_decision].label}`}
      </p>
      {r.wms_order && (
        <p className="mt-3 text-sm text-ink-soft">
          WMS order <span className="font-semibold text-ink">{r.wms_order.wms_order_id}</span>
          {r.wms_order.fulfilment_warehouse_id && <> from {r.wms_order.fulfilment_warehouse_id}</>}
          {r.wms_order.carrier_id && <>, Carrier {r.wms_order.carrier_id}</>}
          {r.wms_order.pick_list_date && <>, pick list {r.wms_order.pick_list_date}</>}.
        </p>
      )}
    </section>
  );
}

function DraftCard({ draft }: { draft: DeskDraft | null }) {
  if (!draft)
    return (
      <div className="panel panel-pad text-[15px] text-ink-soft">
        <p className="font-semibold text-ink">No reply drafted</p>
        <p>This decision needs no message to the client, or the sender is not trusted.</p>
      </div>
    );
  return (
    <section className="panel" aria-labelledby="draft-title" data-testid="draft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <h2 id="draft-title" className="text-lg font-semibold">
          Reply to the client
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-late/40 bg-late-tint px-2.5 py-0.5 text-sm font-semibold text-late">
          DRAFT — needs approval
        </span>
      </div>
      {(draft.to || draft.subject) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-b border-line px-5 py-3 text-[15px]">
          {draft.to && (
            <>
              <dt className="text-slate">To</dt>
              <dd className="min-w-0 break-words">{draft.to}</dd>
            </>
          )}
          {draft.subject && (
            <>
              <dt className="text-slate">Subject</dt>
              <dd className="min-w-0 break-words">{draft.subject}</dd>
            </>
          )}
        </dl>
      )}
      <pre className="whitespace-pre-wrap break-words px-5 py-4 font-sans text-[15px] leading-relaxed text-ink">{draft.body}</pre>
      <p className="border-t border-line px-5 py-2.5 text-sm text-slate">Written by the Order Intake Agent. A person reads and sends it; nothing goes out automatically.</p>
    </section>
  );
}

/* ---------- WMS ---------- */

function WmsTable({ state, onReset, resetting }: { state: ApiState<WmsOrder[]>; onReset: () => void; resetting: boolean }) {
  const orders = useMemo(() => state.data ?? [], [state.data]);
  return (
    <section className="panel mt-6 overflow-hidden" aria-labelledby="wms-title">
      <div className="panel-pad flex flex-wrap items-start justify-between gap-3 pb-4 sm:pb-4">
        <div>
          <h2 id="wms-title" className="text-lg font-semibold">
            Warehouse system (WMS) — orders created
          </h2>
          <p className="mt-1 max-w-[72ch] text-[15px] text-ink-soft">
            What DeliveryLens wrote into the warehouse system. Only orders marked Ready for pick list are picked at the next 08:00 run; the rest wait for
            the client or a person.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={onReset} disabled={resetting}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {resetting ? 'Resetting…' : 'Reset demo'}
        </button>
      </div>
      {state.loading && !state.data ? (
        <div className="px-5 pb-5">
          <LoadingBlock label="Loading WMS orders" rows={3} />
        </div>
      ) : state.error ? (
        <div className="px-5 pb-5">
          <ErrorState message={state.error} onRetry={state.reload} />
        </div>
      ) : orders.length === 0 ? (
        <p className="border-t border-line px-5 py-6 text-[15px] text-ink-soft sm:px-6" data-testid="wms-empty">
          No orders yet. Run DeliveryLens on an email, or Run all 12, and the orders it creates appear here.
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[1100px] border-collapse text-[15px]" aria-label="WMS orders">
            <thead>
              <tr className="border-b border-line">
                <th className="th pl-5 sm:pl-6">WMS order</th>
                <th className="th">Client</th>
                <th className="th">Ship to</th>
                <th className="th">Lines</th>
                <th className="th">Promise</th>
                <th className="th">Warehouse</th>
                <th className="th">Carrier</th>
                <th className="th">Pick list</th>
                <th className="th pr-5 sm:pr-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const st = wmsStatus(o.status);
                const moved = o.nearest_warehouse_id && o.fulfilment_warehouse_id && o.nearest_warehouse_id !== o.fulfilment_warehouse_id;
                const a = o.ship_to;
                return (
                  <tr key={o.wms_order_id} className="border-b border-line align-top last:border-b-0">
                    <td className="td pl-5 sm:pl-6">
                      <div className="whitespace-nowrap font-semibold">{o.wms_order_id}</div>
                      <div className="text-sm text-slate">Email {o.message_id}</div>
                    </td>
                    <td className="td">
                      <div className="whitespace-nowrap">{o.client_name ?? '–'}</div>
                      <div className="text-sm text-slate">{o.destination_region ?? ''}</div>
                    </td>
                    <td className="td max-w-[220px]">
                      <div className="truncate">{a.name ?? '–'}</div>
                      <div className="text-sm text-ink-soft">
                        {a.street ?? <Missing label="street" />}, {a.city ?? <Missing label="city" />}, {a.state ?? <Missing label="state" />}{' '}
                        {a.postcode ?? <Missing label="postcode" />}
                      </div>
                    </td>
                    <td className="td num whitespace-nowrap text-sm">
                      {o.lines.map((l) => (
                        <div key={l.sku}>
                          {l.sku} × {l.qty || '?'}
                        </div>
                      ))}
                    </td>
                    <td className="td text-sm">
                      <div className="text-ink">{o.commitment_type ? humanKey(o.commitment_type.replace('_', '-')) : '–'}</div>
                      <div className="whitespace-nowrap text-slate">{o.promised_date ? `by ${o.promised_date}` : 'date not set'}</div>
                      {o.requested_date && o.promised_date && o.requested_date !== o.promised_date && (
                        <div className="text-late">asked {o.requested_date}</div>
                      )}
                    </td>
                    <td className="td text-sm">
                      <div className="font-semibold text-ink">{o.fulfilment_warehouse_id ?? '–'}</div>
                      {moved && <div className="text-late">nearest {o.nearest_warehouse_id} out of stock</div>}
                    </td>
                    <td className="td text-sm">
                      <div className="font-semibold text-ink">{o.carrier_id ? `Carrier ${o.carrier_id}` : '–'}</div>
                      {o.carrier_reason && (
                        <div className="line-clamp-2 max-w-[240px] text-slate" title={o.carrier_reason}>
                          {o.carrier_reason}
                        </div>
                      )}
                    </td>
                    <td className="td num whitespace-nowrap text-sm">{o.pick_list_date ?? <span className="text-slate">not yet</span>}</td>
                    <td className="td pr-5 sm:pr-6">
                      <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-sm font-medium ${st.chip}`} data-testid="wms-status">
                        {st.label}
                      </span>
                      {st.detail && <div className="mt-1 text-sm text-slate">{st.detail}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Missing({ label }: { label: string }) {
  return <span className="font-semibold text-late">[{label} missing]</span>;
}
