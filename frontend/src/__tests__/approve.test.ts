// Approving into the WMS: sample approvals only when the app is already offline, never on a live blip.

type ClientModule = typeof import('../api/client');

/** A fresh client module (its connection status starts at 'unknown'). */
async function freshClient(): Promise<ClientModule> {
  vi.resetModules();
  return import('../api/client');
}

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

describe('Order desk approval', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('surfaces a network error when the API is live, instead of approving sample orders', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (String(url).endsWith('/api/health') ? json({ status: 'ok' }) : Promise.reject(new TypeError('Failed to fetch')))),
    );
    const { api, getApiStatus } = await freshClient();
    await expect(api.deskApprove('M01')).rejects.toThrow('Failed to fetch');
    await expect(api.deskApproveAll()).rejects.toThrow('Failed to fetch');
    expect(getApiStatus()).toBe('live');
  });

  it('uses the sample approvals when the API was unreachable at load', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    const { api } = await freshClient();
    const r = await api.deskApproveAll();
    expect(r.source).toBe('sample');
  });
});
