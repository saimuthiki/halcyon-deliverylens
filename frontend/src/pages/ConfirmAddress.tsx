import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, MapPin } from 'lucide-react';
import { api } from '../api/client';
import { useApi } from '../lib/useApi';
import { ErrorState, LoadingBlock } from '../components/States';

/** What the client sees after clicking the link in our email: one address, one button. No app chrome. */
export default function ConfirmAddress() {
  const { token = '' } = useParams();
  const view = useApi(() => api.addressConfirmation(token), [token]);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setState('sending');
    setError(null);
    try {
      await api.confirmAddress(token);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }

  const v = view.data;
  const confirmed = state === 'done' || v?.status === 'confirmed' || v?.status === 'corrected';
  return (
    <main className="min-h-screen bg-paper px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-[480px]">
        <p className="mb-6 text-sm font-semibold uppercase tracking-wide text-slate">Halcyon Logistics</p>
        <div className="panel panel-pad">
          {view.loading && !v ? (
            <LoadingBlock label="Loading your order" rows={4} />
          ) : view.error || !v ? (
            <ErrorState message={view.error ?? 'This confirmation link is not valid.'} />
          ) : confirmed ? (
            <div className="flex flex-col items-start gap-3" role="status">
              <CheckCircle2 className="h-8 w-8 text-route" aria-hidden="true" />
              <h1 className="text-xl font-semibold">Thank you, the address is confirmed</h1>
              <p className="text-[15px] text-ink-soft">
                We are putting your order ({v.subject}) through now and will email you the delivery date.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold">Please confirm the delivery address</h1>
              <p className="mt-1 text-[15px] text-ink-soft">
                For your order <span className="font-semibold text-ink">{v.subject}</span>. We have delivered here for you before.
              </p>
              {v.address && (
                <div className="mt-4 flex gap-3 rounded-md border border-line bg-surface px-4 py-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-route" aria-hidden="true" />
                  <address className="not-italic text-[15px] leading-relaxed">
                    {v.site_name && <span className="font-semibold">{v.site_name}<br /></span>}
                    {v.address.street}
                    <br />
                    {v.address.city}, {v.address.state} {v.address.postcode}
                  </address>
                </div>
              )}
              <button type="button" className="btn-primary mt-5 w-full" onClick={confirm} disabled={state === 'sending'}>
                {state === 'sending' ? 'Confirming…' : 'Yes, deliver to this address'}
              </button>
              {error && <p className="mt-3 text-[15px] text-late">{error}</p>}
              <p className="mt-4 text-sm text-slate">Not right? Reply to our email with the correct address and we will update the order.</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
