'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Heart, Navigation, Share2 } from 'lucide-react';
import { KEYS, toSaved, useLocal, type Collection, type SavedSpot } from '@/lib/localStore';
import type { LocationDetail } from '@/lib/types';

export function LocationActions({ l }: { l: LocationDetail }) {
  const [favs, setFavs] = useLocal<SavedSpot[]>(KEYS.favorites, []);
  const [cols, setCols] = useLocal<Collection[]>(KEYS.collections, []);
  const [msg, setMsg] = useState<string | null>(null);
  const fav = favs.some((f) => f.id === l.id);

  const toggleFav = () => setFavs((all) => (all.some((f) => f.id === l.id) ? all.filter((f) => f.id !== l.id) : [toSaved(l), ...all]));
  const addTo = (cid: string) => {
    setCols((all) => all.map((c) => (c.id === cid && !c.items.some((i) => i.id === l.id) ? { ...c, items: [...c.items, toSaved(l)] } : c)));
    setMsg('Added to collection.');
  };
  const share = async () => {
    const url = window.location.href;
    try { if (navigator.share) await navigator.share({ title: l.name, url }); else { await navigator.clipboard.writeText(url); setMsg('Link copied.'); } } catch { /* cancelled */ }
  };

  const p0 = l.parking[0];
  const dest = p0 ?? l;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}`} target="_blank" rel="noreferrer" className="btn-primary"><Navigation size={15} />{p0 ? 'Navigate to parking' : 'Google Maps'}</a>
        <a href={`https://maps.apple.com/?daddr=${dest.lat},${dest.lng}`} target="_blank" rel="noreferrer" className="btn-ghost">Apple Maps</a>
        <Link href={`/planner?loc=${encodeURIComponent(l.slug)}`} className="btn-ghost"><CalendarClock size={15} />Plan a shoot</Link>
        <button onClick={toggleFav} className="btn-ghost" aria-pressed={fav}><Heart size={15} className={fav ? 'fill-rose-400 text-rose-400' : ''} />{fav ? 'Saved' : 'Save'}</button>
        <button onClick={share} className="btn-ghost"><Share2 size={15} />Share</button>
        {cols.length > 0 && (
          <select value="" onChange={(e) => e.target.value && addTo(e.target.value)} className="input w-auto py-1.5 text-xs" aria-label="Add to collection">
            <option value="">+ Collection…</option>{cols.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        )}
      </div>
      {msg && <p className="text-xs text-gold-200">{msg}</p>}
    </div>
  );
}
