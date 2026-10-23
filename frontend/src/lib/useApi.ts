import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getApiStatus, getHealth, subscribeApiStatus, subscribeHealth, type Result } from '../api/client';
import type { DataSource } from '../api/types';

export interface ApiState<T> {
  data: T | null;
  source: DataSource | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Runs an API call on mount (and when deps change), tracking loading/error state. */
export function useApi<T>(call: () => Promise<Result<T>>, deps: unknown[] = []): ApiState<T> {
  const [state, setState] = useState<Omit<ApiState<T>, 'reload'>>({ data: null, source: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);
  const callRef = useRef(call);
  callRef.current = call;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    callRef
      .current()
      .then((r) => {
        if (!cancelled) setState({ data: r.data, source: r.source, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ data: null, source: null, loading: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

export function useApiStatus() {
  return useSyncExternalStore(subscribeApiStatus, getApiStatus, getApiStatus);
}

/** For user-triggered calls (agents, simulate). */
export function useAction<A extends unknown[], T>(fn: (...args: A) => Promise<Result<T>>) {
  const [data, setData] = useState<T | null>(null);
  const [source, setSource] = useState<DataSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (...args: A) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fnRef.current(...args);
      setData(r.data);
      setSource(r.source);
      return r.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setSource(null);
  }, []);

  return { run, data, source, loading, error, reset };
}

/** The last /api/health answer (null until the first probe, or when the API is unreachable). */
export function useHealth() {
  return useSyncExternalStore(subscribeHealth, getHealth, getHealth);
}

/** A boolean remembered in localStorage (per viewer). Falls back to the default when storage is unavailable. */
export function useStoredFlag(key: string, initial = false): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? initial : raw === '1';
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      setValue(raw == null ? initial : raw === '1');
    } catch {
      setValue(initial);
    }
  }, [key, initial]);
  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, v ? '1' : '0');
      } catch {
        /* storage blocked: keep it for this visit only */
      }
    },
    [key],
  );
  return [value, set];
}
