'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

/** Sets the shared place from a link (search results, coordinates) and forwards to Near Me. */
function Forward() {
  const sp = useSearchParams(); const router = useRouter();
  useEffect(() => {
    const lat = Number(sp.get('lat')), lng = Number(sp.get('lng'));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      try { localStorage.setItem('varoseye.place', JSON.stringify({ lat, lng, label: sp.get('label') ?? 'Search result', source: 'link' })); } catch { /* ignore */ }
    }
    router.replace('/near-me');
  }, [sp, router]);
  return <p className="p-8 text-sm text-zinc-400">Opening…</p>;
}
export default function Page() { return <Suspense><Forward /></Suspense>; }
