'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CalendarClock, Flag, FolderHeart, Heart, Navigation, Share2, Star } from 'lucide-react';
import { useAuth, ensureLocationId } from '@/lib/useAuth';
import type { LocationDetail } from '@/lib/types';

export function LocationActions({ l }: { l: LocationDetail }) {
  const { sb, user, enabled } = useAuth();
  const [fav, setFav] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [cols, setCols] = useState<{ id: string; title: string }[]>([]);
  const isUuid = /^[0-9a-f-]{36}$/.test(l.id);

  useEffect(() => {
    if (!sb || !user || !isUuid) return;
    sb.from('location_favorites').select('location_id').eq('user_id', user.id).eq('location_id', l.id).maybeSingle().then(({ data }: any) => setFav(!!data));
    sb.from('ratings').select('rating').eq('user_id', user.id).eq('location_id', l.id).maybeSingle().then(({ data }: any) => setRating(data?.rating ?? 0));
  }, [sb, user, l.id, isUuid]);
  useEffect(() => { if (sb && user) sb.from('collections').select('id,title').eq('user_id', user.id).then(({ data }: any) => setCols(data ?? [])); }, [sb, user]);

  const needAuth = () => { setMsg(enabled ? 'Sign in on the Profile page to save, rate and get alerts.' : 'Accounts need the Supabase backend to be configured.'); return !user; };
  async function withId<T>(fn: (id: string) => Promise<T>) {
    if (needAuth()) return;
    try { await fn(await ensureLocationId(l.id)); } catch (e: any) { setMsg(e.message); }
  }
  const toggleFav = () => withId(async (id) => {
    if (fav) await sb!.from('location_favorites').delete().eq('user_id', user!.id).eq('location_id', id);
    else await sb!.from('location_favorites').insert({ user_id: user!.id, location_id: id });
    setFav(!fav);
  });
  const rate = (n: number) => withId(async (id) => {
    const { error } = await sb!.from('ratings').upsert({ user_id: user!.id, location_id: id, rating: n });
    if (error) throw error; setRating(n); setMsg('Thanks — rating saved.');
  });
  const addTo = (cid: string) => withId(async (id) => {
    const { error } = await sb!.from('collection_items').insert({ collection_id: cid, location_id: id });
    if (error) throw error; setMsg('Added to collection.');
  });
  const alert = (kind: string) => withId(async (id) => {
    const { error } = await sb!.from('alert_rules').upsert({ user_id: user!.id, location_id: id, kind, min_score: 70 }, { onConflict: 'user_id,location_id,kind' });
    if (error) throw error; setMsg(`You’ll be notified when ${kind} potential reaches 70+ (checked every 6 h).`);
  });
  const report = () => withId(async (id) => {
    const reason = window.prompt('What’s wrong? (trespass, unsafe, inaccurate, other)', 'inaccurate');
    if (!reason) return;
    const r = ['trespass', 'unsafe', 'inaccurate', 'copyright', 'spam', 'inappropriate'].includes(reason) ? reason : 'other';
    await sb!.from('reports').insert({ reporter_id: user!.id, location_id: id, reason: r, details: reason });
    setMsg('Report sent to moderators.');
  });
  const share = async () => {
    const url = window.location.href;
    try { if (navigator.share) await navigator.share({ title: l.name, url }); else { await navigator.clipboard.writeText(url); setMsg('Link copied.'); } } catch { /* cancelled */ }
  };

  const g = `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`;
  const a = `https://maps.apple.com/?daddr=${l.lat},${l.lng}&q=${encodeURIComponent(l.name)}`;
  const p0 = l.parking[0];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <a href={p0 ? `https://www.google.com/maps/dir/?api=1&destination=${p0.lat},${p0.lng}` : g} target="_blank" rel="noreferrer" className="btn-primary"><Navigation size={15} />{p0 ? 'Navigate to parking' : 'Google Maps'}</a>
        <a href={p0 ? `https://maps.apple.com/?daddr=${p0.lat},${p0.lng}` : a} target="_blank" rel="noreferrer" className="btn-ghost">Apple Maps</a>
        <Link href={`/planner?loc=${encodeURIComponent(l.slug)}`} className="btn-ghost"><CalendarClock size={15} />Plan a shoot</Link>
        <button onClick={toggleFav} className="btn-ghost" aria-pressed={fav}><Heart size={15} className={fav ? 'fill-rose-400 text-rose-400' : ''} />{fav ? 'Saved' : 'Save'}</button>
        <button onClick={share} className="btn-ghost"><Share2 size={15} />Share</button>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-0.5" aria-label="Rate this location">
          {[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => rate(n)} aria-label={`${n} stars`}><Star size={18} className={n <= rating ? 'fill-gold-400 text-gold-400' : 'text-zinc-600'} /></button>)}
        </span>
        {cols.length > 0 && (
          <select onChange={(e) => e.target.value && addTo(e.target.value)} className="input w-auto py-1 text-xs" defaultValue="" aria-label="Add to collection">
            <option value="">+ Collection…</option>{cols.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        )}
        {!cols.length && <Link href="/collections" className="chip"><FolderHeart size={12} />Collections</Link>}
        <button onClick={() => alert('sunset')} className="chip"><Bell size={12} />Sunset alerts</button>
        <button onClick={() => alert('sunrise')} className="chip"><Bell size={12} />Sunrise alerts</button>
        <button onClick={() => alert('astro')} className="chip"><Bell size={12} />Astro alerts</button>
        <button onClick={report} className="chip text-zinc-500"><Flag size={12} />Report</button>
      </div>
      {msg && <p className="text-xs text-gold-200">{msg}</p>}
    </div>
  );
}
