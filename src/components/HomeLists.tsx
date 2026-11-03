'use client';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Section, Empty } from './ui';
import { CardGrid, PhotoImg } from './LocationCard';
import { communityFeed, listByOrder, seasonalNow } from '@/lib/repo';
import { hasSupabase } from '@/lib/config';
import { useAsync } from '@/lib/useAsync';
import { photoHref } from '@/lib/links';

export function HomeLists() {
  const db = hasSupabase();
  const { data } = useAsync(async () => {
    if (!db) return null;
    const [trending, top, recent, seasonal, hidden, photos] = await Promise.all([listByOrder('trending', 8), listByOrder('top', 8), listByOrder('recent', 8), seasonalNow(8), listByOrder('hidden', 8), communityFeed(12)]);
    return { trending, top, recent, seasonal, hidden, photos };
  }, [db]);
  const month = new Date().toLocaleString('en', { month: 'long' });
  if (!db) return (
    <Section title="Global index" kicker="Database not connected">
      <Empty title="Connect Supabase to enable the global index">
        Nearby discovery above queries Wikidata and OpenStreetMap live. Trending, seasonal and recently-discovered lists, community photos and the
        six-hour refresh need the database — see the README.
      </Empty>
    </Section>
  );
  if (!data) return null;
  return (
    <>
      {data.trending.length > 0 && <Section title="Trending now" kicker="Rising attention from photographers" action={<Link href="/trending" className="btn-ghost">All trending <ArrowUpRight size={14} /></Link>}><CardGrid items={data.trending} /></Section>}
      {data.seasonal.length > 0 && <Section title={`In season for ${month}`} kicker="Seasonal destinations"><CardGrid items={data.seasonal} /></Section>}
      {data.top.length > 0 && <Section title="Highest photo opportunity" kicker="Scored with current conditions"><CardGrid items={data.top} highlight="golden" /></Section>}
      {data.hidden.length > 0 && <Section title="Hidden gems" kicker="Scenic, but rarely photographed"><CardGrid items={data.hidden} /></Section>}
      {data.recent.length > 0 && <Section title="Recently discovered" kicker="Added by the six-hour discovery cycle"><CardGrid items={data.recent} /></Section>}
      {data.photos.length > 0 && (
        <Section title="Community highlights" kicker="Fresh uploads" action={<Link href="/community" className="btn-ghost">Community <ArrowUpRight size={14} /></Link>}>
          <div className="columns-2 gap-3 md:columns-4">
            {data.photos.map((p) => (
              <Link key={p.id} href={photoHref(p.id.replace('community:', ''))} className="mb-3 block overflow-hidden rounded-xl">
                <PhotoImg src={p.thumbUrl} alt={p.title ?? 'Community photo'} className="w-full" />
                <p className="mt-1 text-xs text-zinc-400">{p.title} · {p.author}</p>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
