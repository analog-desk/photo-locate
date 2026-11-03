'use client';
import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Maximize2, Video, X } from 'lucide-react';
import type { Webcam } from '@/lib/providers/webcams';

export function Webcams({ lat, lng, radius = 30 }: { lat: number; lng: number; radius?: number }) {
  const [data, setData] = useState<{ enabled: boolean; webcams: (Webcam & { distanceKm: number })[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [full, setFull] = useState<Webcam | null>(null);
  useEffect(() => {
    fetch(`/api/webcams?lat=${lat}&lng=${lng}&radius=${radius}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); }).catch((e) => setErr(e.message));
  }, [lat, lng, radius]);
  if (err) return <p className="text-sm text-rose-300">Webcam directory unavailable: {err}</p>;
  if (!data) return <p className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 size={14} className="animate-spin" /> Looking for webcams…</p>;
  if (!data.enabled) return <p className="text-sm text-zinc-400">Live webcams require a Windy Webcams API key (WINDY_WEBCAMS_API_KEY). None are shown rather than unofficial streams.</p>;
  if (!data.webcams.length) return <p className="text-sm text-zinc-400">No public webcams within {radius} km.</p>;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.webcams.map((w) => (
          <div key={w.id} className="card overflow-hidden">
            <div className="relative aspect-video bg-ink-850">
              {w.previewUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={w.previewUrl} alt={w.title} className={`h-full w-full object-cover ${w.stale ? 'opacity-50 grayscale' : ''}`} loading="lazy" />
                : <div className="grid h-full place-items-center text-xs text-zinc-500">No snapshot</div>}
              <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] ${w.stale ? 'bg-rose-500/80 text-white' : 'bg-emerald-500/80 text-ink-950'}`}>{w.stale ? (w.status !== 'active' ? 'Unavailable' : 'Outdated') : 'Live'}</span>
              {(w.playerLiveUrl || w.playerDayUrl) && <button onClick={() => setFull(w)} className="absolute right-2 top-2 rounded-full bg-ink-950/70 p-1.5 text-white" aria-label="Full screen"><Maximize2 size={14} /></button>}
            </div>
            <div className="p-3 text-xs">
              <p className="line-clamp-1 text-sm text-zinc-100">{w.title}</p>
              <p className="text-zinc-500">{w.distanceKm.toFixed(1)} km away · {w.lastUpdatedOn ? `updated ${new Date(w.lastUpdatedOn).toLocaleString()}` : 'update time unknown'}</p>
              <p className="text-zinc-500">Direction: {w.direction != null ? `${Math.round(w.direction)}°` : 'not published by provider'}</p>
              {w.pageUrl && <a href={w.pageUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-gold-300">Windy.com <ExternalLink size={11} /></a>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-zinc-600"><Video size={10} className="inline" /> Webcams provided by Windy.com Webcams API. Streams marked outdated haven’t refreshed in 6 h.</p>
      {full && (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-black p-3" role="dialog" aria-modal>
          <button className="ml-auto text-white" onClick={() => setFull(null)} aria-label="Close"><X /></button>
          <iframe src={full.playerLiveUrl ?? full.playerDayUrl!} title={full.title} className="h-full w-full flex-1" allowFullScreen />
        </div>
      )}
    </>
  );
}
