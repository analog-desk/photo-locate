'use client';
import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { LocationView } from '@/components/LocationView';
import { getDetail } from '@/lib/data';
import { useAsync } from '@/lib/useAsync';

function Location() {
  const id = useSearchParams().get('id') ?? '';
  const { data, error, loading } = useAsync(() => (id ? getDetail(id) : Promise.resolve(null)), [id]);
  const l = data?.data ?? null;
  useEffect(() => { if (l) document.title = `${l.name} · Lumen`; }, [l]);
  if (loading) return <div className="flex items-center justify-center gap-2 py-32 text-sm text-zinc-400"><Loader2 className="animate-spin" size={16} />Gathering location data, photos, parking and conditions…</div>;
  if (error) return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="h-display text-3xl">Location data is temporarily unavailable</h1>
      <p className="mt-3 text-sm text-zinc-400">One of the open-data providers (Wikidata, OpenStreetMap or Wikimedia Commons) didn’t respond. Nothing is shown rather than incomplete or guessed information.</p>
      <button onClick={() => location.reload()} className="btn-primary mt-6">Try again</button>
    </div>
  );
  if (!l) return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="h-display text-3xl">Location not found</h1>
      <p className="mt-3 text-sm text-zinc-400">It may have been merged into another entry during de-duplication.</p>
      <Link href="/" className="btn-primary mt-6">Back to Discover</Link>
    </div>
  );
  return <LocationView l={l} />;
}
export default function Page() { return <Suspense><Location /></Suspense>; }
