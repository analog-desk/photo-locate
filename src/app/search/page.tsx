'use client';
import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, MapPin } from 'lucide-react';
import { CardGrid } from '@/components/LocationCard';
import { Empty } from '@/components/ui';
import { unifiedSearch } from '@/lib/data';
import { CATEGORY_LABELS } from '@/lib/types';
import { useAsync } from '@/lib/useAsync';

function Results() {
  const q = (useSearchParams().get('q') ?? '').trim();
  const router = useRouter();
  const { data, error, loading } = useAsync(async () => (q ? unifiedSearch(q) : null), [q]);
  useEffect(() => {
    if (data?.coords) router.replace(`/near-me/at?lat=${data.coords.lat}&lng=${data.coords.lng}&label=${encodeURIComponent(q)}`);
  }, [data, q, router]);
  if (!q) return <Empty title="Search the atlas">Try a location name, a country, a city, a subject like “waterfalls”, or coordinates.</Empty>;
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <h1 className="section-title">Results for “{q}”</h1>
      {loading && <p className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 size={14} className="animate-spin" />Searching…</p>}
      {error && <p className="text-sm text-rose-300">Search is unavailable right now: {error}</p>}
      {data?.subject && <Link href={`/near-me?cats=${data.subject}`} className="btn-primary">Find {CATEGORY_LABELS[data.subject]} near me</Link>}
      {data && data.places.length > 0 && (
        <div>
          <p className="label mb-2">Places — explore photography spots around</p>
          <div className="flex flex-wrap gap-2">
            {data.places.map((p) => (
              <Link key={`${p.lat},${p.lng}`} href={`/near-me/at?lat=${p.lat}&lng=${p.lng}&label=${encodeURIComponent(p.name)}`} className="chip">
                <MapPin size={12} />{p.displayName.split(',').slice(0, 3).join(',')}
              </Link>
            ))}
          </div>
        </div>
      )}
      {data && !data.coords && (
        <div>
          <p className="label mb-2">Indexed photography locations</p>
          {data.spots.length ? <CardGrid items={data.spots} /> : <p className="text-sm text-zinc-400">No indexed location names match. Pick a place above to search around it live.</p>}
        </div>
      )}
    </div>
  );
}
export default function SearchPage() { return <Suspense><Results /></Suspense>; }
