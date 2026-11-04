'use client';
import { miToKm } from '@/lib/units';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Sunrise, Sunset, Sparkles, Sun, Moon } from 'lucide-react';
import { usePlace } from './usePlace';
import { PlacePicker } from './PlacePicker';
import { CardGrid } from './LocationCard';
import { sortSummaries } from '@/lib/repo/sort';
import type { LocationSummary } from '@/lib/types';
import { getNearby } from '@/lib/data';

/** Homepage block: best spots near the user + today's sunrise / sunset / golden / blue picks — all from live forecast scoring. */
export function NearbyDiscovery() {
  const { place, setPlace, requestGps, gpsState } = usePlace();
  const [items, setItems] = useState<LocationSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [tab, setTab] = useState<'score' | 'sunrise' | 'sunset' | 'golden' | 'blue' | 'astro'>('score');

  useEffect(() => {
    if (!place) return;
    setItems(null); setErr(null);
    getNearby({ lat: place.lat, lng: place.lng, radius: miToKm(30), limit: 40 })
      .then((j) => { setItems(j.data); setNote(j.note ?? null); })
      .catch((e) => setErr(e.message));
  }, [place]);

  const tabs = [
    { k: 'score', label: 'Best near me', icon: Sparkles }, { k: 'sunrise', label: 'Sunrise', icon: Sunrise }, { k: 'sunset', label: 'Sunset', icon: Sunset },
    { k: 'golden', label: 'Golden hour', icon: Sun }, { k: 'blue', label: 'Blue hour', icon: Moon }, { k: 'astro', label: 'Astro tonight', icon: Sparkles },
  ] as const;

  return (
    <div className="space-y-4">
      {!place && <PlacePicker place={place} onPlace={setPlace} requestGps={requestGps} gpsState={gpsState} />}
      {place && (
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((t) => <button key={t.k} onClick={() => setTab(t.k)} className={`chip ${tab === t.k ? 'chip-on' : ''}`}><t.icon size={12} />{t.label}</button>)}
          <span className="ml-auto text-xs text-zinc-500">Within 30 miles of {place.label} · <button className="underline" onClick={() => setPlace(null)}>change</button> · <Link className="underline" href="/near-me">more filters</Link></span>
        </div>
      )}
      {place && !items && !err && <div className="flex items-center gap-2 py-10 text-sm text-zinc-400"><Loader2 className="animate-spin" size={16} />Finding photography locations and scoring today’s light…</div>}
      {err && <p className="text-sm text-rose-300">Couldn’t load nearby locations: {err}</p>}
      {items && items.length === 0 && <p className="text-sm text-zinc-400">No documented photography locations found within 30 miles. Try a larger radius on the Near Me page.</p>}
      {items && items.length > 0 && <CardGrid items={sortSummaries(items, tab).slice(0, 8)} highlight={tab === 'score' ? undefined : tab} />}
      {note && <p className="text-xs text-zinc-500">{note}</p>}
    </div>
  );
}
