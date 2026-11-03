'use client';
import { useState } from 'react';
import { Loader2, LocateFixed, MapPin, Search } from 'lucide-react';
import type { Place } from './usePlace';
import { parseCoordinates } from '@/lib/geo';

interface GeoHit { name: string; displayName: string; lat: number; lng: number }

export function PlacePicker({ place, onPlace, requestGps, gpsState, compact }: {
  place: Place | null; onPlace: (p: Place) => void; requestGps: () => void; gpsState: string; compact?: boolean;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const c = parseCoordinates(q);
    if (c) { onPlace({ ...c, label: q, source: 'search' }); setHits([]); return; }
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      if (!r.ok) throw new Error((await r.json()).error);
      const list: GeoHit[] = await r.json();
      setHits(list);
      if (!list.length) setErr('No matching place found.');
    } catch (e: any) { setErr(e.message ?? 'Search failed'); } finally { setBusy(false); }
  }

  return (
    <div className={compact ? '' : 'card p-4'}>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-9" placeholder="Town, city, country, postcode or “lat, lng”" aria-label="Search a place" />
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Search'}</button>
          <button type="button" onClick={requestGps} className="btn-primary" title="Uses your device location only after you allow it">
            {gpsState === 'asking' ? <Loader2 className="animate-spin" size={16} /> : <LocateFixed size={16} />} Use my location
          </button>
        </div>
      </form>
      {gpsState === 'denied' && <p className="mt-2 text-xs text-amber-300">Location permission was declined — search for a place or drop a pin on the map instead.</p>}
      {gpsState === 'unavailable' && <p className="mt-2 text-xs text-amber-300">Your device couldn’t provide a location. Search or drop a pin instead.</p>}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
      {hits.length > 0 && (
        <ul className="mt-2 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/5">
          {hits.map((h) => (
            <li key={`${h.lat},${h.lng}`}>
              <button type="button" onClick={() => { onPlace({ lat: h.lat, lng: h.lng, label: h.name, source: 'search' }); setHits([]); setQ(h.name); }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-white/5">
                <MapPin size={14} className="mt-0.5 shrink-0 text-gold-400" />
                <span><span className="text-zinc-100">{h.name}</span><span className="block text-xs text-zinc-500">{h.displayName}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {place && !compact && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400"><MapPin size={12} className="text-gold-400" />
          {place.label} · <span className="font-mono">{place.lat.toFixed(5)}, {place.lng.toFixed(5)}</span>
          {place.source === 'gps' && <span className="text-zinc-600">(device GPS, not stored on our servers)</span>}
        </p>
      )}
      <p className="mt-2 text-[10px] text-zinc-600">Geocoding © OpenStreetMap contributors via Nominatim.</p>
    </div>
  );
}
