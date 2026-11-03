'use client';
import { useEffect, useState } from 'react';
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let alive = true;
    set((s) => ({ ...s, loading: true, error: undefined }));
    fn().then((data) => alive && set({ data, loading: false })).catch((e) => alive && set({ error: e?.message ?? String(e), loading: false }));
    return () => { alive = false; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
