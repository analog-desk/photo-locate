'use client';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabaseBrowser } from './supabase/client';
import { liveCandidateById } from './repo/live';
import { validateCandidate } from './jobs/persist';

export function useAuth() {
  const sb = supabaseBrowser();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!sb);
  useEffect(() => {
    if (!sb) { setReady(true); return; }
    sb.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, [sb]);
  return { sb, user, ready, enabled: !!sb };
}

/**
 * Resolve a location ref (uuid / slug / live id) to a stored uuid. Spots not yet in the index are submitted through
 * the `request_index` database function (validated, rate-limited, unique by Wikidata/OSM id); the next six-hour
 * cycle enriches them fully.
 */
export async function ensureLocationId(ref: string): Promise<string> {
  const sb = supabaseBrowser();
  if (!sb) throw new Error('Accounts need the Supabase backend.');
  if (/^[0-9a-f-]{36}$/.test(ref)) return ref;
  const { data: bySlug } = await sb.from('locations').select('id').eq('slug', ref).maybeSingle();
  if (bySlug) return bySlug.id;
  const c = await liveCandidateById(ref);
  if (!c) throw new Error('Unknown location');
  const invalid = validateCandidate(c);
  if (invalid) throw new Error(`This spot can’t be indexed (${invalid}).`);
  const { data, error } = await sb.rpc('request_index', {
    p_name: c.name, p_lat: c.lat, p_lng: c.lng, p_categories: c.categories,
    p_wikidata: c.wikidataId ?? null, p_osm: c.osmId ?? null, p_country: c.country ?? null, p_image: c.commonsImage ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
