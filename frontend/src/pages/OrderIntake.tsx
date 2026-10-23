import { useState } from 'react';
import { AlertTriangle, Check, Copy, Sparkles } from 'lucide-react';
import { api } from '../api/client';
import { SAMPLE_EMAILS } from '../api/mockData';
import type { OrderIntakeResult } from '../api/types';
import { useAction } from '../lib/useApi';
import PageHeader, { SectionTitle } from '../components/PageHeader';
import { ErrorState, SampleResponseNotice, SourceTag } from '../components/States';

const FIELD_LABELS: Record<string, string> = {
  name: 'Ship-to name',
  country: 'Country',
  street: 'Street',
  city: 'City',
  state: 'State',
  zip: 'ZIP code',
  contact: 'Contact name',
  phone: 'Phone',
};

export default function OrderIntake() {
  const initial = SAMPLE_EMAILS.find((e) => e.id === '02_incomplete_address') ?? SAMPLE_EMAILS[0];
  const [email, setEmail] = useState(initial.text);
  const [sample, setSample] = useState(initial.id);
  const intake = useAction(api.orderIntake);

  return (
    <>
      <PageHeader
        title="Check every email order before it reaches the pick list"
        lede="Email orders are five times more likely to arrive with an incomplete address, and incomplete addresses are the largest cause that starts at order intake. The agent reads the email, checks the address and drafts the follow-up for a person to send."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel panel-pad flex flex-col lg:self-start" aria-labelledby="email-title">
          <SectionTitle>
            <span id="email-title">Order email</span>
          </SectionTitle>
          <label htmlFor="sample" className="mb-1.5 text-sm text-ink-soft">
            Start from a sample
          </label>
          <select
            id="sample"
            className="field mb-4"
            value={sample}
            onChange={(e) => {
              const s = SAMPLE_EMAILS.find((x) => x.id === e.target.value);
              setSample(e.target.value);
              if (s) setEmail(s.text);
              intake.reset();
            }}
          >
            {SAMPLE_EMAILS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
            <option value="custom">My own email</option>
          </select>
          <label htmlFor="email" className="mb-1.5 text-sm text-ink-soft">
            Email text
          </label>
          <textarea
            id="email"
            className="field min-h-[340px] font-sans leading-relaxed"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSample('custom');
            }}
            placeholder="Paste the client's order email here"
          />
          <div className="mt-4 flex items-center gap-3">
            <button type="button" className="btn-primary" disabled={!email.trim() || intake.loading} onClick={() => intake.run(email)}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {intake.loading ? 'Reading the email…' : 'Check this order'}
            </button>
            {intake.loading && <span className="text-sm text-slate">This can take a few seconds.</span>}
          </div>
        </section>

        <section className="flex flex-col gap-6" aria-live="polite" aria-label="Agent result">
          {intake.error ? (
            <ErrorState message={`The order could not be checked. ${intake.error}`} onRetry={() => intake.run(email)} />
          ) : intake.data ? (
            <IntakeResult data={intake.data} source={intake.source} />
          ) : (
            <div className="panel panel-pad flex min-h-[240px] flex-col items-start justify-center gap-2 border-dashed text-ink-soft">
              <p className="text-[17px] font-semibold text-ink">No order checked yet</p>
              <p className="max-w-[46ch] text-[15px]">Pick a sample or paste an email, then select Check this order. The extracted order, address check and draft reply appear here.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function IntakeResult({ data, source }: { data: OrderIntakeResult; source: 'live' | 'sample' | null }) {
  const fields = Object.entries(data.address.fields);
  const missing = new Set(data.address.missing);
  return (
    <>
      <SampleResponseNotice source={source} />
      <div className="panel panel-pad">
        <SectionTitle note={<SourceTag source={source} />}>Extracted order</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[15px]">
          <Item label="Client" value={data.client} />
          <Item label="PO number" value={data.po_number} />
          <Item label="Promise" value={data.commitment_type?.replace('_', '-') ?? null} />
          <Item label="Received" value={data.received_at} />
          <Item label="Requested delivery" value={data.requested_date} />
        </dl>
        {data.lines.length > 0 && (
          <table className="mt-4 w-full border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th pl-0">SKU</th>
                <th className="th">Item</th>
                <th className="th pr-0 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l, i) => (
                <tr key={i} className="border-b border-line last:border-b-0">
                  <td className="td pl-0 font-medium">{l.sku}</td>
                  <td className="td text-ink-soft">{l.description ?? '–'}</td>
                  <td className="td num pr-0 text-right">{l.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel panel-pad">
        <SectionTitle
          note={
            data.address.complete ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-route-dark">
                <Check className="h-4 w-4" aria-hidden="true" /> Ready for the pick list
              </span>
            ) : (
              <span className="font-semibold text-late">
                {data.address.missing.length} field{data.address.missing.length === 1 ? '' : 's'} missing
              </span>
            )
          }
        >
          Address check
        </SectionTitle>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fields.map(([k, v]) => {
            const isMissing = missing.has(k);
            return (
              <div key={k} className={`rounded-md border px-3 py-2 ${isMissing ? 'border-late bg-late-tint' : 'border-line'}`}>
                <dt className={`text-sm ${isMissing ? 'font-semibold text-late' : 'text-slate'}`}>{FIELD_LABELS[k] ?? k}</dt>
                <dd className={`text-[15px] ${isMissing ? 'text-late' : 'text-ink'}`}>{v ?? (isMissing ? 'Missing' : 'Not given')}</dd>
              </div>
            );
          })}
        </dl>
      </div>

      {data.same_day_warning && (
        <div role="alert" className="flex gap-3 rounded-lg border border-late/40 bg-late-tint p-4 text-[15px] text-ink">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-late" aria-hidden="true" />
          <div>
            <p className="font-semibold">Same-day order after the 08:00 cutoff</p>
            <p className="text-ink-soft">{data.same_day_warning}</p>
          </div>
        </div>
      )}

      {data.follow_up_email && <FollowUp text={data.follow_up_email} />}
    </>
  );
}

function FollowUp({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="panel panel-pad">
      <SectionTitle
        note={
          <button
            type="button"
            className="btn-quiet min-h-[32px] text-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy draft'}
          </button>
        }
      >
        Draft follow-up to the client
      </SectionTitle>
      <pre className="whitespace-pre-wrap rounded-md bg-paper p-4 font-sans text-[15px] leading-relaxed">{text}</pre>
      <p className="mt-2 text-sm text-slate">Drafted for review. Nothing is sent until a person sends it.</p>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-sm text-slate">{label}</dt>
      <dd className={value ? 'font-medium' : 'text-slate'}>{value ?? 'Not given'}</dd>
    </div>
  );
}
