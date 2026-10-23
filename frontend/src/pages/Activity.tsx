import { RotateCw } from 'lucide-react';
import { api } from '../api/client';
import { useApi } from '../lib/useApi';
import PageHeader from '../components/PageHeader';
import { ErrorState, LoadingBlock, SourceTag } from '../components/States';

const AGENT_NAMES: Record<string, string> = {
  'order-intake': 'Order intake',
  order_intake: 'Order intake',
  'delay-alert': 'Delay alert',
  delay_alert: 'Delay alert',
  ask: 'Ask DeliveryLens',
  'ask.route': 'Ask: choose data tool',
};

function when(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function Activity() {
  const runs = useApi(() => api.runs());
  return (
    <>
      <PageHeader
        title="Agent activity"
        lede="Every agent run is logged with what went in, what came out and how long it took, so a person can check the work."
        aside={
          <div className="flex items-center gap-3">
            <SourceTag source={runs.source} />
            <button type="button" className="btn-secondary" onClick={runs.reload} disabled={runs.loading}>
              <RotateCw className={`h-4 w-4 ${runs.loading ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
              Refresh
            </button>
          </div>
        }
      />
      {runs.loading && !runs.data ? (
        <LoadingBlock rows={6} />
      ) : runs.error || !runs.data ? (
        <ErrorState message={runs.error ?? 'No data returned.'} onRetry={runs.reload} />
      ) : runs.data.length === 0 ? (
        <div className="panel panel-pad">
          <p className="font-semibold">No agent runs yet</p>
          <p className="text-[15px] text-ink-soft">Check an order email, draft a delay alert or ask a question, and the run appears here.</p>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th pl-5 sm:pl-6">When</th>
                <th className="th">Agent</th>
                <th className="th">Input</th>
                <th className="th">Output</th>
                <th className="th text-right">Time</th>
                <th className="th pr-5 sm:pr-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...runs.data]
                .sort((a, b) => b.started_at.localeCompare(a.started_at))
                .map((r) => (
                  <tr key={r.run_id} className="border-b border-line align-top last:border-b-0">
                    <td className="td num whitespace-nowrap pl-5 text-ink-soft sm:pl-6">{when(r.started_at)}</td>
                    <td className="td whitespace-nowrap font-semibold">{AGENT_NAMES[r.agent] ?? r.agent}</td>
                    <td className="td max-w-[260px]">{r.input_summary}</td>
                    <td className="td max-w-[320px] text-ink-soft">{r.output_summary}</td>
                    <td className="td num whitespace-nowrap text-right">{(r.duration_ms / 1000).toFixed(1)} s</td>
                    <td className="td pr-5 sm:pr-6">
                      <span
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm ${
                          r.status === 'success' ? 'bg-route-tint text-route-dark' : r.status === 'error' || r.status === 'blocked' ? 'bg-late-tint text-late' : 'bg-slate-light text-ink-soft'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${r.status === 'success' ? 'bg-route' : r.status === 'error' || r.status === 'blocked' ? 'bg-late' : 'bg-slate'}`} aria-hidden="true" />
                        {r.status === 'success' ? 'Done' : r.status === 'error' ? 'Failed' : r.status === 'blocked' ? 'Blocked by guardrail' : r.status}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
