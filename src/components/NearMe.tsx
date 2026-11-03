'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Route as RouteIcon, LocateFixed } from 'lucide-react';
import { usePlace } from './usePlace';
import { PlacePicker } from './PlacePicker';
import { CategoryChips, RadiusSelect, SortSelect } from './Filters';
import { CardGrid } from './LocationCard';
import { Map, type MapMarker } from './Map';
import { parseCats, parseSortClient } from './params';
import type { Category, LocationSummary, SortKey } from '@/lib/types';

export function NearMe() {
  const sp = useSearchParams();
  const { place, setPlace, requestGps, gpsState } = usePlace();
  const [radius, setRadius] = useState(Number(sp.get('radius')) || 25);
  const [cats, setCats] = useState<Category[]>(parseCats(sp.get('cats')));
  const [sort, setSort] = useState<SortKey>(parseSortClient(sp.get('sort')));
  const [items, setItems] = useState<LocationSummary[] | null>(null);
  const [state, setState] = useState<{ loading: boolean; err?: string; note?: string; mode?: string }>({ loading: false });
  const [tab, setTab] = useState<'radius' | 'route'>('radius');

  useEffect(() => {
    if (!place || tab !== 'radius') return;
    const ctrl = new AbortController();
    setState({ loading: true });
    fetch(`/api/locations/nearby?lat=${place.lat}&lng=${place.lng}&radius=${radius}&cats=${cats.join(',')}&sort=${sort}&limit=80`, { signal: ctrl.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; })
      .then((j) => { setItems(j.data); setState({ loading: false, note: j.note, mode: j.mode }); })
      .catch((e) => e.name !== 'AbortError' && setState({ loading: false, err: e.message }));
    return () => ctrl.abort();
  }, [place, radius, cats, sort, tab]);

  const markers: MapMarker[] = useMemo(() => [
    ...(place ? [{ id: 'me', lat: place.lat, lng: place.lng, kind: (place.source === 'gps' ? 'me' : 'pin') as MapMarker['kind'], label: place.label }] : []),
    ...(items ?? []).map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, kind: 'spot' as const, label: l.name, score: l.photoScore, href: `/location/${l.slug}`, sub: l.categories.slice(0, 3).join(' · ') })),
  ], [items, place]);

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="label">GPS discovery</p><h1 className="section-title">Best photography spots near me</h1></div>
        <div className="flex gap-1 rounded-full border border-white/10 bg-white/5 p-0.5">
          <button onClick={() => setTab('radius')} className={`rounded-full px-3 py-1 text-xs ${tab === 'radius' ? 'bg-white/15 text-white' : 'text-zinc-400'}`}><LocateFixed size={12} className="mr-1 inline" />Radius</button>
          <button onClick={() => setTab('route')} className={`rounded-full px-3 py-1 text-xs ${tab === 'route' ? 'bg-white/15 text-white' : 'text-zinc-400'}`}><RouteIcon size={12} className="mr-1 inline" />Along a route</button>
        </div>
      </header>
      {tab === 'radius' ? (
        <>
          <PlacePicker place={place} onPlace={setPlace} requestGps={requestGps} gpsState={gpsState} />
          <div className="flex flex-wrap items-center gap-3"><RadiusSelect value={radius} onChange={setRadius} /><SortSelect value={sort} onChange={setSort} /></div>
          <CategoryChips value={cats} onChange={setCats} />
          <Map center={place ? [place.lat, place.lng] : [30, 0]} zoom={place ? (radius <= 10 ? 12 : radius <= 50 ? 10 : 8) : 2} markers={markers} radiusKm={place ? radius : undefined}
            onPick={(lat, lng) => setPlace({ lat, lng, label: 'Dropped pin', source: 'pin' })} height={440} />
          {!place && <p className="text-sm text-zinc-400">Share your location, search for a place, or use <b>Drop pin</b> on the map to begin.</p>}
          {state.loading && <p className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="animate-spin" size={16} /> Searching {radius} km and scoring current conditions…</p>}
          {state.err && <p className="text-sm text-rose-300">{state.err}</p>}
          {state.note && <p className="text-xs text-zinc-500">{state.note}</p>}
          {items && !state.loading && (items.length ? <><p className="text-xs text-zinc-500">{items.length} locations · ranked by {sort} · source: {state.mode}</p><CardGrid items={items} highlight={['sunrise', 'sunset', 'golden', 'blue', 'astro'].includes(sort) ? sort as any : undefined} /></>
            : <p className="text-sm text-zinc-400">No documented photography locations match these filters here. Try widening the radius or clearing filters.</p>)}
        </>
      ) : <AlongRoute cats={cats} setCats={setCats} />}
    </div>
  );
}

function AlongRoute({ cats, setCats }: { cats: Category[]; setCats: (c: Category[]) => void }) {
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [buffer, setBuffer] = useState(10);
  const [res, setRes] = useState<{ line: [number, number][]; spots: LocationSummary[]; routed: boolean } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function geo(q: string) {
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`); const j = await r.json();
    if (!r.ok || !j.length) throw new Error(`Couldn’t find “${q}”`); return { lat: j[0].lat, lng: j[0].lng };
  }
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const pts = [await geo(from), await geo(to)];
      const r = await fetch('/api/locations/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points: pts, bufferKm: buffer, cats: cats.join(',') }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error); setRes(j);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={go} className="card grid gap-2 p-4 md:grid-cols-[1fr_1fr_auto_auto]">
        <input className="input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Start (e.g. Reykjavík)" required />
        <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Destination (e.g. Vík)" required />
        <select className="input" value={buffer} onChange={(e) => setBuffer(+e.target.value)} aria-label="Detour distance">{[5, 10, 25, 50].map((b) => <option key={b} value={b}>within {b} km</option>)}</select>
        <button className="btn-primary" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Find spots'}</button>
      </form>
      <CategoryChips value={cats} onChange={setCats} />
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {res && (
        <>
          <Map center={res.line[Math.floor(res.line.length / 2)]} zoom={7} routes={[{ coords: res.line, color: '#7593f5', dashed: !res.routed, label: res.routed ? 'Driving route' : 'Straight line (routing not configured)' }]}
            markers={res.spots.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, kind: 'spot', label: l.name, score: l.photoScore, href: `/location/${l.slug}` }))} height={420} />
          {!res.routed && <p className="text-xs text-amber-300">Road routing isn’t configured (OPENROUTESERVICE_API_KEY), so the corridor follows a straight line between your points.</p>}
          <CardGrid items={res.spots} />
        </>
      )}
    </div>
  );
}
