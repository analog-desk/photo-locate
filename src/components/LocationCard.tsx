'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Gem, MapPin } from 'lucide-react';
import { CATEGORY_LABELS, type LocationSummary } from '@/lib/types';
import { formatCoord } from '@/lib/geo';
import { locHref } from '@/lib/links';

export function PhotoImg({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return <div className={`bg-gradient-to-br from-ink-700 via-ink-800 to-dusk-600/30 ${className}`} aria-label="No licensed image available" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={`object-cover ${className}`} />;
}

export function LocationCard({ l, highlight }: { l: LocationSummary; highlight?: 'sunrise' | 'sunset' | 'golden' | 'blue' | 'astro' }) {
  const hl = highlight ? l.conditions?.[highlight] : null;
  return (
    <Link href={locHref(l.slug)} className="group card block overflow-hidden animate-fade-up">
      <div className="relative aspect-[4/3] overflow-hidden">
        <PhotoImg src={l.heroImage?.thumbUrl} alt={l.name} className="h-full w-full transition duration-700 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/10 to-transparent" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {l.hiddenGem && <span className="chip border-emerald-400/40 bg-emerald-400/15 text-emerald-300"><Gem size={11} /> Hidden gem</span>}
          {hl != null && <span className="chip border-gold-400/40 bg-ink-950/60 text-gold-300 capitalize">{highlight} {hl}</span>}
        </div>
        <div className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border border-gold-400/50 bg-ink-950/70 text-sm font-semibold text-gold-300" title="Photography opportunity score (0–100)">
          {l.photoScore}
        </div>
        <div className="absolute inset-x-3 bottom-3">
          <h3 className="h-display line-clamp-2 text-lg leading-snug text-white">{l.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-300">
            <MapPin size={12} />
            {[l.nearestTown, l.region, l.country].filter(Boolean).slice(0, 2).join(', ') || formatCoord(l.lat, l.lng, 3)}
            {l.distanceKm != null && <span className="ml-auto text-zinc-200">{l.distanceKm < 10 ? l.distanceKm.toFixed(1) : Math.round(l.distanceKm)} km</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap gap-1">
          {l.categories.filter((c) => c !== 'hidden-gem').slice(0, 3).map((c) => <span key={c} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">{CATEGORY_LABELS[c]}</span>)}
        </div>
        <div className="shrink-0 text-right text-[10px] leading-tight text-zinc-500">
          <div>Popularity <span className="text-zinc-300">{l.popularityScore}</span></div>
          <div className="font-mono">{l.lat.toFixed(4)}, {l.lng.toFixed(4)}</div>
        </div>
      </div>
    </Link>
  );
}

export function CardGrid({ items, highlight }: { items: LocationSummary[]; highlight?: Parameters<typeof LocationCard>[0]['highlight'] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((l) => <LocationCard key={l.id} l={l} highlight={highlight} />)}
    </div>
  );
}
