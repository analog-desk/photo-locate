import Link from 'next/link';
import { Map, Search } from 'lucide-react';
import { Section } from '@/components/ui';
import { NearbyDiscovery } from '@/components/NearbyDiscovery';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/types';
import { withBase } from '@/lib/links';

export default function Home() {
  return (
    <>
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="h-full w-full bg-[radial-gradient(ellipse_at_top,_#3b55b8_0%,_#11141a_45%,_#07080a_80%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-ink-950/40 via-ink-950/60 to-ink-950" />
        </div>
        <div className="mx-auto flex min-h-[62vh] max-w-7xl flex-col justify-end px-4 pb-12 pt-24">
          <p className="label text-gold-300">Worldwide photography atlas</p>
          <h1 className="h-display mt-2 max-w-3xl text-4xl leading-[1.05] text-white md:text-6xl">Know where to stand, when to arrive, and what the light will do.</h1>
          <p className="mt-4 max-w-2xl text-zinc-300">Locations from open geographic data, freely-licensed photography, golden & blue hour, sun and moon positions, live forecasts, parking and access.</p>
          <form action={withBase('/search/')} className="mt-6 flex max-w-2xl gap-2">
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

    </>
  );
}
