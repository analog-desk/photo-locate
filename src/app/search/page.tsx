import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { CardGrid } from '@/components/LocationCard';
import { Empty } from '@/components/ui';
import { search } from '@/lib/repo';
import { geocode } from '@/lib/providers/nominatim';
import { parseCoordinates } from '@/lib/geo';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/types';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Search' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const query = q.trim().slice(0, 200);
  if (!query) return <Empty title="Search the atlas">Try a location name, a country, a city, a subject like “waterfalls”, or coordinates.</Empty>;
  const coords = parseCoordinates(query);
  if (coords) redirect(`/near-me/at?lat=${coords.lat}&lng=${coords.lng}&label=${encodeURIComponent(query)}`);
  const subject = CATEGORIES.find((c) => c === query.toLowerCase() || CATEGORY_LABELS[c].toLowerCase() === query.toLowerCase());
  const [spots, places] = await Promise.all([search(query).catch(() => ({ data: [] })), geocode(query, 8).catch(() => [])]);
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <h1 className="section-title">Results for “{query}”</h1>
      {subject && <Link href={`/near-me?cats=${subject}`} className="btn-primary">Find {CATEGORY_LABELS[subject]} near me</Link>}
      {places.length > 0 && (
        <div>
          <p className="label mb-2">Places — explore photography spots around</p>
          <div className="flex flex-wrap gap-2">
            {places.map((p) => (
              <Link key={`${p.lat},${p.lng}`} href={`/near-me/at?lat=${p.lat}&lng=${p.lng}&label=${encodeURIComponent(p.name)}`} className="chip">
                <MapPin size={12} />{p.displayName.split(',').slice(0, 3).join(',')}
              </Link>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="label mb-2">Indexed photography locations</p>
        {spots.data.length ? <CardGrid items={spots.data} /> : <p className="text-sm text-zinc-400">No indexed location names match. Pick a place above to search around it live.</p>}
      </div>
    </div>
  );
}
