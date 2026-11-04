'use client';
import { fmtMiles } from '@/lib/units';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Map, type MapMarker } from './Map';
import { CategoryChips, SortSelect } from './Filters';
import { PhotoImg } from './LocationCard';
import { usePlace } from './usePlace';
import { PlacePicker } from './PlacePicker';
import type { Category, LocationSummary, SortKey } from '@/lib/types';
import { getNearby } from '@/lib/data';
import { locHref } from '@/lib/links';

export function Explore() {
  const { place, setPlace, requestGps, gpsState } = usePlace();
  const [view, setView] = useState<{ lat: number; lng: number; r: number } | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [sort, setSort] = useState<SortKey>('score');
  const [items, setItems] = useState<LocationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onMoveEnd = useCallback((c: { lat: number; lng: number }, r: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setView({ lat: c.lat, lng: c.lng, r: Math.max(3, Math.min(r, 100)) }), 600);
  }, []);
  useEffect(() => { if (place) setView({ lat: place.lat, lng: place.lng, r: 25 }); }, [place]);
  useEffect(() => {
    if (!view) return;
    let alive = true;
    setLoading(true);
    getNearby({ lat: +view.lat.toFixed(4), lng: +view.lng.toFixed(4), radius: Math.round(view.r), cats, sort, limit: 120 })
      .then((j) => alive && setItems(j.data)).catch(() => {}).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [view, cats, sort]);

  const markers: MapMarker[] = items.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, kind: 'spot', label: l.name, score: l.photoScore, href: locHref(l.slug), sub: `Photo ${l.photoScore} · Popularity ${l.popularityScore}` }));
  return (
    <div className="grid h-[calc(100dvh-3.5rem)] grid-rows-[auto_1fr] md:grid-cols-[380px_1fr] md:grid-rows-1">
      <aside className="space-y-3 overflow-y-auto border-white/5 p-4 md:border-r">
        <h1 className="section-title">Explore map</h1>
        <PlacePicker place={place} onPlace={setPlace} requestGps={requestGps} gpsState={gpsState} compact />
        <SortSelect value={sort} onChange={setSort} />
        <CategoryChips value={cats} onChange={setCats} />
        <p className="flex items-center gap-2 text-xs text-zinc-500">{loading && <Loader2 size={12} className="animate-spin" />}{items.length} locations in view · pan or zoom to search · switch Satellite/Terrain/Topo top-right</p>
        <ul className="hidden space-y-2 md:block">
          {items.slice(0, 40).map((l) => (
            <li key={l.id}>
              <Link href={locHref(l.slug)} className="flex gap-3 rounded-xl p-2 hover:bg-white/5">
                <PhotoImg src={l.heroImage?.thumbUrl} alt={l.name} className="h-14 w-20 shrink-0 rounded-lg" />
                <div className="min-w-0"><p className="truncate text-sm text-zinc-100">{l.name}</p>
                  <p className="text-[11px] text-zinc-500">Photo {l.photoScore} · Pop. {l.popularityScore}{l.distanceKm != null && ` · ${fmtMiles(l.distanceKm)}`}</p>
                  <p className="truncate text-[11px] text-zinc-500">{l.categories.slice(0, 3).join(' · ')}</p></div>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <div className="relative min-h-[60vh] p-2 md:p-3">
        <Map center={place ? [place.lat, place.lng] : [46.5, 9]} zoom={place ? 10 : 5} markers={markers} onMoveEnd={onMoveEnd} height="100%"
          onPick={(lat, lng) => setPlace({ lat, lng, label: 'Dropped pin', source: 'pin' })} />
      </div>
    </div>
  );
}
