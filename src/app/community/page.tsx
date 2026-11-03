'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Upload } from 'lucide-react';
import { communityFeed, listByOrder } from '@/lib/repo';
import { hasSupabase } from '@/lib/config';
import { Empty, Section } from '@/components/ui';
import { CardGrid, PhotoImg } from '@/components/LocationCard';
import { useAuth } from '@/lib/useAuth';
import { useAsync } from '@/lib/useAsync';
import { photoHref } from '@/lib/links';

function Feed() {
  const feed = useSearchParams().get('feed');
  const { sb, user, ready } = useAuth();
  const { data } = useAsync(async () => {
    if (!sb || !ready) return null;
    let userIds: string[] | undefined;
    if (feed === 'following' && user) {
      const { data } = await sb.from('follows').select('followee_id').eq('follower_id', user.id);
      userIds = (data ?? []).map((f) => f.followee_id);
    }
    const [photos, trending] = await Promise.all([communityFeed(48, { userIds }), listByOrder('trending', 4)]);
    return { photos, trending };
  }, [sb, ready, user?.id, feed]);
  if (!hasSupabase()) return <Section title="Community"><Empty title="Community needs the backend">Uploads, comments, likes, follows and collections are stored in Supabase. Connect it to enable the community.</Empty></Section>;
  return (
    <>
      <Section title="Community feed" kicker="Recently uploaded" action={<Link href="/community/upload" className="btn-primary"><Upload size={15} />Upload</Link>}>
        <div className="mb-4 flex gap-2">
          <Link href="/community" className={`chip ${feed !== 'following' ? 'chip-on' : ''}`}>Everyone</Link>
          <Link href="/community?feed=following" className={`chip ${feed === 'following' ? 'chip-on' : ''}`}>Following</Link>
        </div>
        {!data ? <p className="text-sm text-zinc-400">Loading…</p> : data.photos.length ? (
          <div className="columns-2 gap-3 md:columns-3 xl:columns-4">
            {data.photos.map((p) => (
              <Link key={p.id} href={photoHref(p.id.replace('community:', ''))} className="group mb-3 block break-inside-avoid overflow-hidden rounded-xl bg-ink-900">
                <PhotoImg src={p.thumbUrl} alt={p.title ?? ''} className="w-full transition group-hover:opacity-90" />
                <div className="flex justify-between px-2 py-1.5 text-[11px] text-zinc-400"><span className="truncate">{p.title ?? 'Untitled'} · {p.author}</span><span>♥ {p.likeCount} · 💬 {p.commentCount}</span></div>
              </Link>
            ))}
          </div>
        ) : <Empty title={feed === 'following' ? 'Nothing from people you follow yet' : 'No approved uploads yet'}>Uploads appear here after moderation.</Empty>}
      </Section>
      {data && data.trending.length > 0 && <Section title="Trending locations"><CardGrid items={data.trending} /></Section>}
    </>
  );
}
export default function Community() { return <Suspense><Feed /></Suspense>; }
