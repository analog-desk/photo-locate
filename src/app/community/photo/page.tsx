'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { communityPhotoRef } from '@/lib/repo';
import { PhotoSocial } from '@/components/PhotoSocial';
import { PhotoImg } from '@/components/LocationCard';
import { useAuth } from '@/lib/useAuth';
import { useAsync } from '@/lib/useAsync';
import { locHref, userHref } from '@/lib/links';

function Photo() {
  const id = useSearchParams().get('id') ?? '';
  const { sb, ready } = useAuth();
  const { data, loading } = useAsync(async () => {
    if (!sb || !ready || !/^[0-9a-f-]{36}$/.test(id)) return null;
    const { data: p } = await sb.from('photos_public').select('*').eq('id', id).maybeSingle();
    if (!p) return null;
    const { data: loc } = p.location_id ? await sb.from('locations').select('name, slug').eq('id', p.location_id).maybeSingle() : { data: null };
    return { p, loc };
  }, [sb, ready, id]);
  if (loading || !ready) return <p className="p-10 text-sm text-zinc-400">Loading…</p>;
  if (!data) return <p className="p-10 text-sm text-zinc-400">Photo not found (or not yet approved).</p>;
  const { p, loc } = data;
  const ref = communityPhotoRef(p);
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <PhotoImg src={ref.url} alt={p.title ?? ''} className="max-h-[80vh] w-full rounded-2xl object-contain" />
        {p.moderation_status !== 'approved' && <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Status: {p.moderation_status} — only you can see this until a moderator approves it.</p>}
      </div>
      <aside className="space-y-4">
        <div>
          <h1 className="h-display text-2xl">{p.title ?? 'Untitled'}</h1>
          <p className="text-sm text-zinc-400">by {p.username ? <Link href={userHref(p.username)} className="underline">{p.display_name ?? p.username}</Link> : (p.display_name ?? 'Member')} · {ref.license}</p>
          {loc && <Link href={locHref(loc.slug)} className="chip mt-2">{loc.name}</Link>}
        </div>
        {p.description && <p className="whitespace-pre-line text-sm text-zinc-300">{p.description}</p>}
        <dl className="card grid grid-cols-2 gap-2 p-4 text-xs">
          {[['Camera', p.camera], ['Lens', p.lens], ['Focal', p.focal_length && `${p.focal_length} mm`], ['Aperture', p.aperture && `f/${p.aperture}`], ['Shutter', p.shutter], ['ISO', p.iso],
            ['Taken', p.taken_at && new Date(p.taken_at).toLocaleString()], ['Light', p.light_phase], ['Season', p.season], ['Weather', p.weather_condition],
            ['GPS', p.lat != null ? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : 'private']].map(([k, v]) => (
            <div key={k as string}><dt className="text-zinc-500">{k}</dt><dd className="text-zinc-200">{v ?? '—'}</dd></div>
          ))}
        </dl>
        <PhotoSocial photoId={p.id} ownerId={p.user_id} />
      </aside>
    </div>
  );
}
export default function Page() { return <Suspense><Photo /></Suspense>; }
