'use client';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabaseBrowser } from './supabase/client';

export function useAuth() {
  const sb = supabaseBrowser();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!sb);
  useEffect(() => {
    if (!sb) return;
    sb.auth.getUser().then(({ data }) => { setUser(data.user); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, [sb]);
  return { sb, user, ready, enabled: !!sb };
}

/** Resolve a location ref (uuid / slug / live id) to a stored uuid, indexing it if needed. */
export async function ensureLocationId(ref: string): Promise<string> {
  const r = await fetch('/api/locations/persist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ref }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j.locationId;
}
