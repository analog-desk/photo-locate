'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Download, FolderHeart, Heart, Plus, Route, Trash2, Upload } from 'lucide-react';
import { CardGrid } from './LocationCard';
import { exportAll, importAll, KEYS, newId, useLocal, type Collection, type Itinerary, type SavedPlan, type SavedSpot } from '@/lib/localStore';
import { locHref } from '@/lib/links';
import { TARGETS, type Target } from '@/lib/plan';

export function Collections() {
  const [favs, setFavs] = useLocal<SavedSpot[]>(KEYS.favorites, []);
  const [cols, setCols] = useLocal<Collection[]>(KEYS.collections, []);
  const [its, setIts] = useLocal<Itinerary[]>(KEYS.itineraries, []);
  const [plans, setPlans] = useLocal<SavedPlan[]>(KEYS.plans, []);
  const [title, setTitle] = useState(''); const [itTitle, setItTitle] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportAll()], { type: 'application/json' }));
    a.download = `varos-eye-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  }

  return (
    <div className="space-y-10">
      <div className="card flex flex-wrap items-center gap-3 p-4 text-sm">
        <p className="flex-1 text-zinc-400">Everything here is saved on this device only. Use a backup file to move it to another phone or computer.</p>
        <button className="btn-ghost" onClick={download}><Download size={15} />Export backup</button>
        <button className="btn-ghost" onClick={() => file.current?.click()}><Upload size={15} />Import backup</button>
        <input ref={file} type="file" accept="application/json" className="sr-only" onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          try { importAll(await f.text()); setMsg('Backup imported.'); } catch { setMsg('That file isn’t a valid Varo’s Eye backup.'); }
          e.target.value = '';
        }} />
        {msg && <p className="w-full text-xs text-gold-200">{msg}</p>}
      </div>

      <section>
        <h2 className="section-title mb-4 flex items-center gap-2"><Heart size={20} />Favourite locations</h2>
        {favs.length ? <CardGrid items={favs} /> : <p className="text-sm text-zinc-400">Tap “Save” on any location page.</p>}
      </section>

      <section>
        <h2 className="section-title mb-4 flex items-center gap-2"><CalendarClock size={20} />Planned shoots</h2>
        {plans.length ? (
          <ul className="card divide-y divide-white/5">{[...plans].sort((a, b) => a.date.localeCompare(b.date)).map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="w-28 font-mono text-zinc-300">{p.date}</span>
              <Link href={locHref(p.ref)} className="flex-1 hover:underline">{TARGETS[p.target as Target] ?? p.target} · {p.name}</Link>
              {p.arrivalAt && <span className="text-xs text-zinc-500">arrive {new Date(p.arrivalAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
              <button onClick={() => setPlans((all) => all.filter((x) => x.id !== p.id))} aria-label="Delete plan"><Trash2 size={14} className="text-zinc-500" /></button>
            </li>))}</ul>
        ) : <p className="text-sm text-zinc-400">Plans you save in the <Link href="/planner" className="underline">Planner</Link> appear here.</p>}
      </section>

      <section>
        <h2 className="section-title mb-4 flex items-center gap-2"><FolderHeart size={20} />Collections</h2>
        <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; setCols((c) => [{ id: newId(), title: title.trim(), createdAt: new Date().toISOString(), items: [] }, ...c]); setTitle(''); }}>
          <input className="input max-w-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New collection, e.g. “Iceland ring road”" />
          <button className="btn-primary"><Plus size={15} />Create</button>
        </form>
        <div className="grid gap-3 md:grid-cols-2">{cols.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex items-center gap-2">
              <p className="h-display flex-1 text-lg">{c.title}</p>
              <button onClick={() => { if (confirm(`Delete “${c.title}”?`)) setCols((all) => all.filter((x) => x.id !== c.id)); }} aria-label="Delete collection"><Trash2 size={14} className="text-zinc-500" /></button>
            </div>
            <ul className="mt-2 space-y-1 text-sm">{c.items.map((i) => (
              <li key={i.id} className="flex justify-between"><Link href={locHref(i.slug)} className="hover:underline">{i.name}</Link>
                <button onClick={() => setCols((all) => all.map((x) => x.id === c.id ? { ...x, items: x.items.filter((y) => y.id !== i.id) } : x))} className="text-xs text-zinc-500">remove</button></li>))}</ul>
            {!c.items.length && <p className="text-xs text-zinc-500">Add locations from their pages.</p>}
          </div>))}</div>
      </section>

      <section>
        <h2 className="section-title mb-4 flex items-center gap-2"><Route size={20} />Photography itineraries</h2>
        <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!itTitle.trim()) return; setIts((c) => [{ id: newId(), title: itTitle.trim(), createdAt: new Date().toISOString(), stops: [] }, ...c]); setItTitle(''); }}>
          <input className="input max-w-sm" value={itTitle} onChange={(e) => setItTitle(e.target.value)} placeholder="New itinerary" />
          <button className="btn-primary"><Plus size={15} />Create</button>
        </form>
        <div className="grid gap-3 md:grid-cols-2">{its.map((it) => (
          <div key={it.id} className="card p-4">
            <div className="flex items-center gap-2"><p className="h-display flex-1 text-lg">{it.title}</p>
              <button onClick={() => { if (confirm(`Delete “${it.title}”?`)) setIts((all) => all.filter((x) => x.id !== it.id)); }} aria-label="Delete itinerary"><Trash2 size={14} className="text-zinc-500" /></button></div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{it.stops.map((s, i) => (
              <li key={`${s.spot.id}-${i}`}><Link className="hover:underline" href={locHref(s.spot.slug)}>{s.spot.name}</Link>
                <button className="ml-2 text-xs text-zinc-500" onClick={() => setIts((all) => all.map((x) => x.id === it.id ? { ...x, stops: x.stops.filter((_, j) => j !== i) } : x))}>remove</button></li>))}</ol>
            {favs.length > 0 ? (
              <select className="input mt-2 py-1 text-xs" value="" onChange={(e) => {
                const spot = favs.find((f) => f.id === e.target.value); if (!spot) return;
                setIts((all) => all.map((x) => x.id === it.id ? { ...x, stops: [...x.stops, { spot }] } : x));
              }}><option value="">+ Add a favourite as next stop…</option>{favs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            ) : <p className="mt-2 text-xs text-zinc-500">Save favourites first, then add them here as stops.</p>}
          </div>))}</div>
      </section>
    </div>
  );
}
