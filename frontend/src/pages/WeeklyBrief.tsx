import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Mail, RefreshCw, Send } from "lucide-react";
import { api } from "../api/client";
import type { WeeklyBriefResult } from "../api/types";
import { useAction, useApi } from "../lib/useApi";
import { pct, usd } from "../lib/format";
import PageHeader, { SectionTitle } from "../components/PageHeader";
import { ActorBadge } from "../components/Actor";
import { ErrorState, LoadingBlock } from "../components/States";

export default function WeeklyBrief() {
  const weeks = useApi(() => api.briefWeeks());
  const brief = useAction(api.weeklyBrief);
  const [params] = useSearchParams();
  const [week, setWeek] = useState<string | null>(null);

  // The link in the emailed brief opens its week: /weekly-brief?week=YYYY-MM-DD
  useEffect(() => {
    if (week || !weeks.data) return;
    const asked = params.get("week");
    setWeek(
      asked && weeks.data.weeks.includes(asked) ? asked : weeks.data.latest,
    );
  }, [weeks.data, week, params]);
  useEffect(() => {
    if (week) void brief.run(week);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  return (
    <>
      <PageHeader
        title="The Monday brief for the COO and CFO"
        lede="One page, every Monday: on time against last week and the 94% target, the money lost, why deliveries were late and the three actions for the week. The numbers come from the data; the AI writes the email, and any number it cannot trace back to the data sends it back to the template."
      />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="week"
            className="mb-1 block text-sm font-medium text-slate"
          >
            Week of
          </label>
          <select
            id="week"
            className="field min-w-[200px]"
            value={week ?? ""}
            onChange={(e) => setWeek(e.target.value)}
            disabled={!weeks.data}
          >
            {[...(weeks.data?.weeks ?? [])].reverse().map((w) => (
              <option key={w} value={w}>
                {w}
                {w === weeks.data?.latest ? " (latest in the data)" : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => week && brief.run(week)}
          disabled={!week || brief.loading}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Draft again
        </button>
      </div>

      {weeks.error ? (
        <ErrorState message={weeks.error} onRetry={weeks.reload} />
      ) : brief.error ? (
        <ErrorState
          message={`The brief could not be drafted: ${brief.error}`}
          onRetry={() => week && brief.run(week)}
        />
      ) : brief.loading || !brief.data ? (
        <LoadingBlock
          label="The Weekly Brief Agent is writing the email"
          rows={10}
        />
      ) : (
        <BriefBody r={brief.data} />
      )}
    </>
  );
}

function BriefBody({ r }: { r: WeeklyBriefResult }) {
  const f = r.facts;
  const html = r.brief.html;
  const [view, setView] = useState<"html" | "text">(html ? "html" : "text");
  const up = (f.change_points ?? 0) >= 0;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="panel panel-pad" aria-labelledby="email-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="email-title" className="text-lg font-semibold">
            The email
          </h2>
          <ActorBadge actor="AI agent" name="Weekly Brief Agent" />
        </div>
        {html && (
          <div
            className="mb-3 inline-flex rounded-md border border-line p-0.5"
            role="group"
            aria-label="Email format"
          >
            {(["html", "text"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`rounded px-3 py-1 text-sm font-semibold ${view === v ? "bg-route text-white" : "text-ink-soft hover:bg-paper"}`}
              >
                {v === "html" ? "Formatted (HTML)" : "Plain text"}
              </button>
            ))}
          </div>
        )}
        {view === "html" && html ? (
          <iframe
            title="Formatted weekly brief"
            srcDoc={html}
            sandbox=""
            className="h-[820px] w-full rounded-md border border-line bg-paper"
            data-testid="brief-html"
          />
        ) : (
          <div className="rounded-md border border-line bg-paper p-4">
            <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-slate">To</dt>
              <dd>COO, CFO (the weekly brief list)</dd>
              <dt className="text-slate">Subject</dt>
              <dd className="font-semibold text-ink">{r.brief.subject}</dd>
            </dl>
            <pre
              className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-ink"
              data-testid="brief-body"
            >
              {r.brief.body}
            </pre>
          </div>
        )}
        <p className="mt-3 text-sm text-slate">
          {r.guardrail_flags.length
            ? `Guardrail: ${r.guardrail_flags.join(", ").replace(/_/g, " ")}.`
            : "Every number in the email was checked against the data."}{" "}
          {r.method}
        </p>
      </section>

      <div className="flex flex-col gap-6">
        <section className="panel panel-pad" aria-labelledby="week-title">
          <SectionTitle note={`${f.week_of} to ${f.week_end}`}>
            <span id="week-title">The week in numbers</span>
          </SectionTitle>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Stat
              label="On time"
              value={pct(f.on_time_rate)}
              tone={f.on_time_rate < f.target_on_time_rate ? "late" : "route"}
            />
            <Stat
              label="Against last week"
              value={
                f.change_points == null
                  ? "–"
                  : `${up ? "+" : ""}${f.change_points} pts`
              }
              tone={f.change_points == null ? undefined : up ? "route" : "late"}
            />
            <Stat
              label="Below the 94% target"
              value={`${f.gap_to_target_points} pts`}
              tone="late"
            />
            <Stat
              label="Late deliveries"
              value={`${f.late_deliveries.toLocaleString()} of ${f.deliveries.toLocaleString()}`}
            />
            <Stat label="SLA penalties" value={usd(f.sla_penalties_usd)} />
            <Stat label="Redeliveries" value={usd(f.redelivery_cost_usd)} />
            <Stat
              label="At-risk clients on time"
              value={
                f.at_risk_clients.on_time_rate == null
                  ? "–"
                  : pct(f.at_risk_clients.on_time_rate)
              }
            />
          </dl>
          <Trend points={f.trend} target={f.target_on_time_rate} />
        </section>

        <SendCard r={r} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "late" | "route";
}) {
  return (
    <div>
      <dt className="text-sm text-slate">{label}</dt>
      <dd
        className={`num text-xl font-bold ${tone === "late" ? "text-late" : tone === "route" ? "text-route-dark" : "text-ink"}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** On time for the last six weeks, as bars against the target line. */
function Trend({
  points,
  target,
}: {
  points: WeeklyBriefResult["facts"]["trend"];
  target: number;
}) {
  const lo = 0.5;
  const h = (x: number) => `${Math.max(0, ((x - lo) / (1 - lo)) * 100)}%`;
  return (
    <figure className="mt-5">
      <figcaption className="mb-2 text-sm text-slate">
        On time, last {points.length} weeks (line: 94% target)
      </figcaption>
      <div className="relative flex h-24 items-end gap-2 border-b border-line">
        <div
          className="absolute inset-x-0 border-t border-dashed border-route"
          style={{ bottom: h(target) }}
          aria-hidden="true"
        />
        {points.map((p) => (
          <div
            key={p.week_of}
            className="flex h-full flex-1 flex-col justify-end"
            title={`${p.week_of}: ${p.on_time_rate == null ? "–" : pct(p.on_time_rate)}`}
          >
            <div
              className="rounded-t-sm bg-late/80"
              style={{ height: p.on_time_rate == null ? 0 : h(p.on_time_rate) }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2">
        {points.map((p) => (
          <span
            key={p.week_of}
            className="num flex-1 text-center text-xs text-slate"
          >
            {p.week_of.slice(5)}
          </span>
        ))}
      </div>
    </figure>
  );
}

function SendCard({ r }: { r: WeeklyBriefResult }) {
  const send = useAction(api.sendWeeklyBrief);
  const d = r.delivery;
  return (
    <section className="panel panel-pad" aria-labelledby="send-title">
      <h2 id="send-title" className="text-lg font-semibold">
        Sending
      </h2>
      {d.configured && d.backend && d.backend !== "sns" ? (
        <p className="mt-1 text-[15px] text-ink-soft">
          {d.schedule ?? "Every Monday"}, as the formatted HTML email
          {d.backend === "brevo" ? " (Brevo)" : ` (${d.backend})`}
          {d.test_mode
            ? ", in test mode: only to the team's test addresses, marked [TEST]."
            : ` to ${(d.recipients?.to ?? 0) + (d.recipients?.cc ?? 0) + (d.recipients?.bcc ?? 0)} recipients.`}{" "}
          Recipients are set on the server, never from this page.
        </p>
      ) : d.configured ? (
        <p className="mt-1 text-[15px] text-ink-soft">
          {d.schedule ?? "Every Monday"}, as a plain-text email (Amazon SNS)
          with a link to the formatted version, to the people who confirmed
          their subscription
          {d.confirmed_subscribers != null
            ? ` (${d.confirmed_subscribers} confirmed${d.pending_subscribers ? `, ${d.pending_subscribers} pending` : ""})`
            : ""}
          . Recipients are set on the server, never from this page.
        </p>
      ) : (
        <p className="mt-1 text-[15px] text-ink-soft">
          Email is not set up on this server yet, so this is a preview only.
        </p>
      )}
      <button
        type="button"
        className="btn-primary mt-4"
        onClick={() => send.run(r.week_of)}
        disabled={!d.configured || send.loading}
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        {send.loading ? "Sending…" : "Send this week’s brief now"}
      </button>
      {send.error && <p className="mt-2 text-[15px] text-late">{send.error}</p>}
      {send.data && (
        <p
          className="mt-2 flex items-center gap-1.5 text-[15px] text-route-dark"
          role="status"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          Sent: “{send.data.subject}”.
        </p>
      )}
    </section>
  );
}
