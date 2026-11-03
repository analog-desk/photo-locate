'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { communityPhotoRef } from '@/lib/repo';
import { PhotoImg } from '@/components/LocationCard';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useAsync } from '@/lib/useAsync';
import { photoHref } from '@/lib/links';

function PublicProfile() {
  const username = (useSearchParams().get('u') ?? '').toLowerCase();
  const { data, loading } = useAsync(async () => {
    const sb = supabaseBrowser();
    if (!sb || !username) return null;
    const { data: p } = await sb.from('profiles').select('*').eq('username', username).maybeSingle();
    if (!p) return null;
    const [photos, followers, following, cols, its] = await Promise.all([
      sb.from('photos_public').select('*').eq('user_id', p.id).eq('moderation_status', 'approved').order('created_at', { ascending: false }).limit(60),
      sb.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', p.id),
      sb.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', p.id),
      sb.from('collections').select('id, title, collection_items(count)').eq('user_id', p.id).eq('is_public', true),
      sb.from('itineraries').select('id, title, itinerary_stops(locations(name, slug))').eq('user_id', p.id).eq('is_public', true),
    ]);
    return { p, photos: photos.data ?? [], followers: followers.count ?? 0, following: following.count ?? 0, cols: cols.data ?? [], its: its.data ?? [] };
  }, [username]);
  if (loading) return <p className="p-10 text-sm text-zinc-400">Loading…</p>;
  if (!data) return <p className="p-10 text-sm text-zinc-400">Photographer not found.</p>;
  const { p } = data;
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
      <header>
        <h1 className="h-display text-4xl">{p.display_name ?? p.username}</h1>
        <p className="text-sm text-zinc-400">@{p.username} · {data.followers} followers · {data.following} following</p>
        {p.bio && <p className="mt-2 max-w-2xl text-zinc-300">{p.bio}</p>}
        {p.website && /^https?:\/\//.test(p.website) && <a href={p.website} target="_blank" rel="noreferrer nofollow" className="text-sm text-gold-300">{p.website}</a>}
      </header>
      <div className="columns-2 gap-3 md:columns-4">{data.photos.map((ph: any) => (
        <Link key={ph.id} href={photoHref(ph.id)} className="mb-3 block overflow-hidden rounded-xl"><PhotoImg src={communityPhotoRef(ph).thumbUrl} alt={ph.title ?? ''} className="w-full" /></Link>))}</div>
      {data.cols.length > 0 && <section><h2 className="section-title mb-2">Collections</h2><ul className="text-sm">{data.cols.map((c: any) => <li key={c.id}>{c.title} <span className="text-zinc-500">({c.collection_items?.[0]?.count ?? 0})</span></li>)}</ul></section>}
      {data.its.length > 0 && <section><h2 className="section-title mb-2">Itineraries</h2>{data.its.map((i: any) => (
        <div key={i.id} className="mb-3"><p className="font-medium">{i.title}</p><p className="text-sm text-zinc-400">{(i.itinerary_stops ?? []).map((s: any) => s.locations?.name).filter(Boolean).join(' → ')}</p></div>))}</section>}
    </div>
  );
}
export default function Page() { return <Suspense><PublicProfile /></Suspense>; }
