import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { communityPhotoRef } from '@/lib/repo';
import { PhotoImg } from '@/components/LocationCard';

export const dynamic = 'force-dynamic';

export default async function PublicProfile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const sb = await supabaseServer();
  if (!sb) notFound();
  const { data: p } = await sb.from('profiles').select('*').eq('username', username.toLowerCase()).maybeSingle();
  if (!p) notFound();
  const [photos, followers, following, cols, its] = await Promise.all([
    sb.from('photos_public').select('*').eq('user_id', p.id).eq('moderation_status', 'approved').order('created_at', { ascending: false }).limit(60),
    sb.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', p.id),
    sb.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', p.id),
    sb.from('collections').select('id, title, collection_items(count)').eq('user_id', p.id).eq('is_public', true),
    sb.from('itineraries').select('id, title, itinerary_stops(locations(name, slug))').eq('user_id', p.id).eq('is_public', true),
  ]);
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
      <header>
        <h1 className="h-display text-4xl">{p.display_name ?? p.username}</h1>
        <p className="text-sm text-zinc-400">@{p.username} · {followers.count ?? 0} followers · {following.count ?? 0} following</p>
        {p.bio && <p className="mt-2 max-w-2xl text-zinc-300">{p.bio}</p>}
        {p.website && <a href={p.website} target="_blank" rel="noreferrer nofollow" className="text-sm text-gold-300">{p.website}</a>}
      </header>
      <div className="columns-2 gap-3 md:columns-4">{(photos.data ?? []).map((ph: any) => (
        <Link key={ph.id} href={`/community/photo/${ph.id}`} className="mb-3 block overflow-hidden rounded-xl"><PhotoImg src={communityPhotoRef(ph).thumbUrl} alt={ph.title ?? ''} className="w-full" /></Link>))}</div>
      {(cols.data?.length ?? 0) > 0 && <section><h2 className="section-title mb-2">Collections</h2><ul className="text-sm">{cols.data!.map((c: any) => <li key={c.id}>{c.title} <span className="text-zinc-500">({c.collection_items?.[0]?.count ?? 0})</span></li>)}</ul></section>}
      {(its.data?.length ?? 0) > 0 && <section><h2 className="section-title mb-2">Itineraries</h2>{its.data!.map((i: any) => (
        <div key={i.id} className="mb-3"><p className="font-medium">{i.title}</p><p className="text-sm text-zinc-400">{(i.itinerary_stops ?? []).map((s: any) => s.locations?.name).filter(Boolean).join(' → ')}</p></div>))}</section>}
    </div>
  );
}
