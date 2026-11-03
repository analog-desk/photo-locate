'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderHeart, Heart, Loader2, Plus, Route, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { rowToSummary } from '@/lib/repo/mappers';
import { CardGrid } from './LocationCard';
import type { LocationSummary } from '@/lib/types';

export function Collections() {
  const { sb, user, ready, enabled } = useAuth();
  const [favs, setFavs] = useState<LocationSummary[]>([]);
  const [cols, setCols] = useState<any[]>([]);
  const [its, setIts] = useState<any[]>([]);
  const [title, setTitle] = useState(''); const [itTitle, setItTitle] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!sb || !user) return;
    sb.from('location_favorites').select('locations(*)').eq('user_id', user.id).then(({ data }) => setFavs((data ?? []).map((r: any) => r.locations).filter(Boolean).map((r: any) => rowToSummary(r))));
    sb.from('collections').select('*, collection_items(id, location_id, locations(name, slug))').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => setCols(data ?? []));
    sb.from('itineraries').select('*, itinerary_stops(id, position, planned_at, notes, location_id, locations(name, slug))').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => setIts(data ?? []));
  }, [sb, user, tick]);

  if (!enabled) return <p className="text-sm text-zinc-400">Collections need the Supabase backend.</p>;
  if (!ready) return <Loader2 className="animate-spin" />;
  if (!user) return <p className="text-sm text-zinc-300"><Link className="underline" href="/profile">Sign in</Link> to save favourites, build collections and share itineraries.</p>;
  const refresh = () => setTick((t) => t + 1);

  return (
    <div className="space-y-10">
      <section>
        <h2 className="section-title mb-4 flex items-center gap-2"><Heart size={20} />Favourite locations</h2>
        {favs.length ? <CardGrid items={favs} /> : <p className="text-sm text-zinc-400">Tap “Save” on any location page.</p>}
      </section>
      <section>
        <h2 className="section-title mb-4 flex items-center gap-2"><FolderHeart size={20} />Collections</h2>
        <form className="mb-4 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!title.trim()) return; await sb!.from('collections').insert({ user_id: user.id, title: title.trim() }); setTitle(''); refresh(); }}>
          <input className="input max-w-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New collection, e.g. “Iceland ring road”" />
          <button className="btn-primary"><Plus size={15} />Create</button>
        </form>
        <div className="grid gap-3 md:grid-cols-2">{cols.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex items-center gap-2">
              <p className="h-display flex-1 text-lg">{c.title}</p>
              <label className="flex items-center gap-1 text-xs text-zinc-400"><input type="checkbox" checked={c.is_public} onChange={async (e) => { await sb!.from('collections').update({ is_public: e.target.checked }).eq('id', c.id); refresh(); }} />Public</label>
              <button onClick={async () => { if (confirm(`Delete “${c.title}”?`)) { await sb!.from('collections').delete().eq('id', c.id); refresh(); } }} aria-label="Delete collection"><Trash2 size={14} className="text-zinc-500" /></button>
            </div>
            <ul className="mt-2 space-y-1 text-sm">{(c.collection_items ?? []).map((i: any) => i.locations && <li key={i.id} className="flex justify-between"><Link href={`/location/${i.locations.slug}`} className="hover:underline">{i.locations.name}</Link>
              <button onClick={async () => { await sb!.from('collection_items').delete().eq('id', i.id); refresh(); }} className="text-xs text-zinc-500">remove</button></li>)}</ul>
            {!(c.collection_items ?? []).length && <p className="text-xs text-zinc-500">Add locations from their pages.</p>}
          </div>))}</div>
      </section>
      <section>
        <h2 className="section-title mb-4 flex items-center gap-2"><Route size={20} />Photography itineraries</h2>
        <form className="mb-4 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!itTitle.trim()) return; await sb!.from('itineraries').insert({ user_id: user.id, title: itTitle.trim() }); setItTitle(''); refresh(); }}>
          <input className="input max-w-sm" value={itTitle} onChange={(e) => setItTitle(e.target.value)} placeholder="New itinerary" />
          <button className="btn-primary"><Plus size={15} />Create</button>
        </form>
        <div className="grid gap-3 md:grid-cols-2">{its.map((it) => (
          <div key={it.id} className="card p-4">
            <div className="flex items-center gap-2"><p className="h-display flex-1 text-lg">{it.title}</p>
              <label className="flex items-center gap-1 text-xs text-zinc-400"><input type="checkbox" checked={it.is_public} onChange={async (e) => { await sb!.from('itineraries').update({ is_public: e.target.checked }).eq('id', it.id); refresh(); }} />Share publicly</label></div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{[...(it.itinerary_stops ?? [])].sort((a: any, b: any) => a.position - b.position).map((s: any) => <li key={s.id}><Link className="hover:underline" href={`/location/${s.locations?.slug}`}>{s.locations?.name}</Link>{s.planned_at && <span className="text-zinc-500"> · {new Date(s.planned_at).toLocaleString()}</span>}</li>)}</ol>
            {favs.length > 0 && (
              <select className="input mt-2 py-1 text-xs" defaultValue="" onChange={async (e) => {
                const id = e.target.value; if (!id) return;
                await sb!.from('itinerary_stops').insert({ itinerary_id: it.id, location_id: id, position: (it.itinerary_stops?.length ?? 0) + 1 }); refresh();
              }}><option value="">+ Add a favourite as next stop…</option>{favs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            )}
          </div>))}</div>
      </section>
    </div>
  );
}
