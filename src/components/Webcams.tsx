'use client';
import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Maximize2, Video, X } from 'lucide-react';
import { storedWebcams } from '@/lib/repo';
import { hasSupabase } from '@/lib/config';

interface Cam {
  id: string; title: string; status: string; last_updated_on: string | null; stale: boolean; checked_at: string;
  preview_url: string | null; player_day_url: string | null; player_live_url: string | null; page_url: string | null;
  direction: number | null; distanceKm: number;
}

/**
 * Webcams are fetched by the six-hour refresh job (Windy key kept in GitHub Actions secrets) and stored in the
 * database, so the public site never exposes an API key. Staleness is re-evaluated client-side.
 */
export function Webcams({ locationId }: { locationId: string }) {
  const [cams, setCams] = useState<Cam[] | null | undefined>(undefined);
  const [full, setFull] = useState<Cam | null>(null);
  useEffect(() => { storedWebcams(locationId).then((c) => setCams(c as Cam[] | null)).catch(() => setCams(null)); }, [locationId]);
  if (!hasSupabase()) return <p className="text-sm text-zinc-400">Live webcams are collected by the background refresh and need the database to be connected.</p>;
  if (cams === undefined) return <p className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 size={14} className="animate-spin" /> Looking for webcams…</p>;
  if (cams === null) return <p className="text-sm text-zinc-400">Webcams appear once this spot has been indexed by the six-hour refresh.</p>;
  if (!cams.length) return <p className="text-sm text-zinc-400">No public webcams recorded within 30 km (requires the Windy key in the refresh job).</p>;
  const isStale = (c: Cam) => c.stale || !c.last_updated_on || Date.now() - Date.parse(c.last_updated_on) > 6 * 3600_000;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cams.map((w) => (
          <div key={w.id} className="card overflow-hidden">
            <div className="relative aspect-video bg-ink-850">
              {w.preview_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={w.preview_url} alt={w.title} className={`h-full w-full object-cover ${isStale(w) ? 'opacity-50 grayscale' : ''}`} loading="lazy" />
                : <div className="grid h-full place-items-center text-xs text-zinc-500">No snapshot</div>}
              <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] ${isStale(w) ? 'bg-rose-500/80 text-white' : 'bg-emerald-500/80 text-ink-950'}`}>{isStale(w) ? (w.status !== 'active' ? 'Unavailable' : 'Outdated') : 'Live'}</span>
              {(w.player_live_url || w.player_day_url) && <button onClick={() => setFull(w)} className="absolute right-2 top-2 rounded-full bg-ink-950/70 p-1.5 text-white" aria-label="Full screen"><Maximize2 size={14} /></button>}
            </div>
            <div className="p-3 text-xs">
              <p className="line-clamp-1 text-sm text-zinc-100">{w.title}</p>
              <p className="text-zinc-500">{w.distanceKm.toFixed(1)} km away · {w.last_updated_on ? `updated ${new Date(w.last_updated_on).toLocaleString()}` : 'update time unknown'}</p>
              <p className="text-zinc-500">Direction: {w.direction != null ? `${Math.round(w.direction)}°` : 'not published by provider'}</p>
              {w.page_url && <a href={w.page_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-gold-300">Windy.com <ExternalLink size={11} /></a>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-zinc-600"><Video size={10} className="inline" /> Webcams provided by Windy.com. Snapshot links are refreshed every six hours; streams with no update for 6 h are marked outdated.</p>
      {full && (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-black p-3" role="dialog" aria-modal>
          <button className="ml-auto text-white" onClick={() => setFull(null)} aria-label="Close"><X /></button>
          <iframe src={full.player_live_url ?? full.player_day_url!} title={full.title} className="h-full w-full flex-1" allowFullScreen />
        </div>
      )}
    </>
  );
}
