'use client';
import { useMemo, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import type { LightPhase, PhotoRef, Season } from '@/lib/types';
import { PhotoImg } from './LocationCard';

const PHASES: { k: LightPhase | 'sunrise' | 'sunset'; label: string }[] = [
  { k: 'golden', label: 'Golden hour' }, { k: 'blue', label: 'Blue hour' }, { k: 'day', label: 'Daytime' }, { k: 'night', label: 'Night' },
  { k: 'sunrise', label: 'Sunrise' }, { k: 'sunset', label: 'Sunset' },
];
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function PhotoGallery({ photos }: { photos: PhotoRef[] }) {
  const [phase, setPhase] = useState<string | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [open, setOpen] = useState<PhotoRef | null>(null);
  const list = useMemo(() => photos.filter((p) => {
    if (season && p.season !== season) return false;
    if (month != null && (!p.takenAt || new Date(p.takenAt).getUTCMonth() !== month)) return false;
    if (phase) {
      if (phase === 'sunrise' || phase === 'sunset') {
        if (!p.takenAt || !(p.lightPhase === 'golden' || p.lightPhase === 'blue')) return false;
        const h = new Date(p.takenAt).getUTCHours() + (p.lng ?? 0) / 15; // approx. local solar hour
        const am = ((h % 24) + 24) % 24 < 12;
        if ((phase === 'sunrise') !== am) return false;
      } else if (phase === 'night') { if (!['night', 'astronomical', 'nautical'].includes(p.lightPhase ?? '')) return false; }
      else if (p.lightPhase !== phase) return false;
    }
    return true;
  }), [photos, phase, season, month]);
  const classified = photos.filter((p) => p.lightPhase).length;

  if (!photos.length) return <p className="text-sm text-zinc-400">No freely-licensed photographs are available for this spot yet.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {PHASES.map((p) => <button key={p.k} onClick={() => setPhase(phase === p.k ? null : p.k)} className={`chip ${phase === p.k ? 'chip-on' : ''}`}>{p.label}</button>)}
        <span className="mx-1 w-px bg-white/10" />
        {SEASONS.map((s) => <button key={s} onClick={() => setSeason(season === s ? null : s)} className={`chip capitalize ${season === s ? 'chip-on' : ''}`}>{s}</button>)}
        <select value={month ?? ''} onChange={(e) => setMonth(e.target.value === '' ? null : +e.target.value)} className="input w-auto py-1 text-xs" aria-label="Month">
          <option value="">Any month</option>{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
      </div>
      <p className="text-[11px] text-zinc-500">{list.length} of {photos.length} photos · light phase is computed from capture time + position for {classified} photos; others can’t be time-filtered.</p>
      <div className="columns-2 gap-3 md:columns-3 xl:columns-4">
        {list.map((p) => (
          <figure key={p.id} className="group relative mb-3 break-inside-avoid overflow-hidden rounded-xl bg-ink-850">
            <button onClick={() => setOpen(p)} className="block w-full" aria-label={`Open ${p.title ?? 'photo'}`}><PhotoImg src={p.thumbUrl} alt={p.title ?? ''} className="w-full" /></button>
            <figcaption className="px-2 py-1.5 text-[10px] leading-snug text-zinc-400">
              <a href={p.authorUrl ?? p.sourceUrl} target="_blank" rel="noreferrer" className="text-zinc-300 hover:underline">{p.author}</a> ·{' '}
              <a href={p.licenseUrl ?? p.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">{p.license}</a> · <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">{p.provider}</a>
              {(p.focalLength || p.aperture || p.shutter || p.iso) && <span className="block font-mono text-zinc-500">{[p.focalLength && `${Math.round(p.focalLength)}mm`, p.aperture && `f/${p.aperture}`, p.shutter, p.iso && `ISO ${p.iso}`].filter(Boolean).join(' · ')}</span>}
            </figcaption>
            <Maximize2 size={14} className="absolute right-2 top-2 text-white opacity-0 drop-shadow group-hover:opacity-100" />
          </figure>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-black/95 p-4" role="dialog" aria-modal onClick={() => setOpen(null)}>
          <button className="ml-auto text-white" aria-label="Close"><X /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open.url} alt={open.title ?? ''} referrerPolicy="no-referrer" className="m-auto max-h-[85vh] max-w-full object-contain" />
          <p className="mt-2 text-center text-xs text-zinc-300">{open.title} — {open.author} · {open.license} · <a href={open.sourceUrl} target="_blank" rel="noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>source</a>
            {open.camera && ` · ${open.camera}`}{open.lens && ` · ${open.lens}`}{open.takenAt && ` · ${new Date(open.takenAt).toLocaleDateString()}`}</p>
        </div>
      )}
    </div>
  );
}
