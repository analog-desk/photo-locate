import Link from 'next/link';
import { ArrowUpRight, Map, Search } from 'lucide-react';
import { Section, Empty } from '@/components/ui';
import { CardGrid } from '@/components/LocationCard';
import { NearbyDiscovery } from '@/components/NearbyDiscovery';
import { communityFeed, listByOrder, seasonalNow } from '@/lib/repo';
import { hasSupabase } from '@/lib/config';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/types';
import { PhotoImg } from '@/components/LocationCard';

export const revalidate = 900;

export default async function Home() {
  const db = hasSupabase();
  const [trending, top, recent, seasonal, hidden, photos] = db
    ? await Promise.all([listByOrder('trending', 8), listByOrder('top', 8), listByOrder('recent', 8), seasonalNow(8), listByOrder('hidden', 8), communityFeed(12)])
    : [[], [], [], [], [], []];
  const hero = top.find((l) => l.heroImage)?.heroImage ?? trending.find((l) => l.heroImage)?.heroImage ?? null;
  const month = new Date().toLocaleString('en', { month: 'long' });

  return (
    <>
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10">
          {hero ? <PhotoImg src={hero.url} alt="" className="h-full w-full opacity-60" /> : <div className="h-full w-full bg-[radial-gradient(ellipse_at_top,_#3b55b8_0%,_#11141a_45%,_#07080a_80%)]" />}
          <div className="absolute inset-0 bg-gradient-to-b from-ink-950/40 via-ink-950/60 to-ink-950" />
        </div>
        <div className="mx-auto flex min-h-[62vh] max-w-7xl flex-col justify-end px-4 pb-12 pt-24">
          <p className="label text-gold-300">Worldwide photography atlas</p>
          <h1 className="h-display mt-2 max-w-3xl text-4xl leading-[1.05] text-white md:text-6xl">Know where to stand, when to arrive, and what the light will do.</h1>
          <p className="mt-4 max-w-2xl text-zinc-300">Locations from open geographic data, licensed community photography, golden & blue hour, sun and moon positions, live forecasts, parking and access — continuously refreshed every six hours.</p>
          <form action="/search" className="mt-6 flex max-w-2xl gap-2">
            <div className="relative flex-1">
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input name="q" required minLength={2} className="input h-12 rounded-full pl-11 text-base" placeholder="Search a place, country, subject or coordinates…" aria-label="Search" />
            </div>
            <button className="btn-primary h-12 px-6">Search</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {CATEGORIES.slice(0, 10).map((c) => <Link key={c} href={`/near-me?cats=${c}`} className="chip">{CATEGORY_LABELS[c]}</Link>)}
            <Link href="/explore" className="chip"><Map size={12} /> Open map</Link>
          </div>
        </div>
      </section>

      <Section title="Best photography spots near you" kicker="GPS discovery · today’s light">
        <NearbyDiscovery />
      </Section>

      {trending.length > 0 && <Section title="Trending now" kicker="Rising attention from photographers" action={<Link href="/trending" className="btn-ghost">All trending <ArrowUpRight size={14} /></Link>}><CardGrid items={trending} /></Section>}
      {seasonal.length > 0 && <Section title={`In season for ${month}`} kicker="Seasonal destinations"><CardGrid items={seasonal} /></Section>}
      {top.length > 0 && <Section title="Highest photo opportunity" kicker="Scored with current conditions"><CardGrid items={top} highlight="golden" /></Section>}
      {hidden.length > 0 && <Section title="Hidden gems" kicker="Scenic, but rarely photographed"><CardGrid items={hidden} /></Section>}
      {recent.length > 0 && <Section title="Recently discovered" kicker="Added by the 6-hour discovery cycle"><CardGrid items={recent} /></Section>}
      {photos.length > 0 && (
        <Section title="Community highlights" kicker="Fresh uploads" action={<Link href="/community" className="btn-ghost">Community <ArrowUpRight size={14} /></Link>}>
          <div className="columns-2 gap-3 md:columns-4">
            {photos.map((p) => (
              <Link key={p.id} href={p.sourceUrl} className="mb-3 block overflow-hidden rounded-xl">
                <PhotoImg src={p.thumbUrl} alt={p.title ?? 'Community photo'} className="w-full" />
                <p className="mt-1 text-xs text-zinc-400">{p.title} · {p.author}</p>
              </Link>
            ))}
          </div>
        </Section>
      )}
      {!db && (
        <Section title="Global index" kicker="Backend not connected">
          <Empty title="Connect Supabase to enable the global index">
            Nearby discovery above queries Wikidata and OpenStreetMap live. Trending, seasonal, recently-discovered lists, community photos and the
            six-hour refresh need the database — see the README for setup.
          </Empty>
        </Section>
      )}
    </>
  );
}
