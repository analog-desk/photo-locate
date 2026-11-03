'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Bell, CheckCircle2, Database, Loader2, LogOut, Shield, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { communityPhotoRef } from '@/lib/jobs/community';
import { PhotoImg } from './LocationCard';
import { Freshness } from './ui';

export function Profile() {
  const { sb, user, ready, enabled } = useAuth();
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!sb || !user) return;
    sb.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => setProfile(data));
    sb.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30).then(({ data }) => setNotes(data ?? []));
    sb.from('photos_public').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30).then(({ data }) => setMine(data ?? []));
  }, [sb, user, tick]);
  useEffect(() => {
    if (!sb || !profile?.is_admin) return;
    sb.from('photos_public').select('*').eq('moderation_status', 'pending').order('created_at').limit(40).then(({ data }) => setQueue(data ?? []));
    sb.from('reports').select('*').eq('resolved', false).order('created_at').limit(40).then(({ data }) => setReports(data ?? []));
  }, [sb, profile, tick]);

  if (!enabled) return <div className="space-y-6"><p className="text-sm text-zinc-400">Accounts need the Supabase backend (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).</p><SystemStatus /></div>;
  if (!ready) return <Loader2 className="animate-spin" />;
  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <div className="card space-y-3 p-6">
          <h1 className="h-display text-2xl">Sign in to Lumen</h1>
          <p className="text-sm text-zinc-400">We’ll email you a secure sign-in link. No password needed.</p>
          {sent ? <p className="text-sm text-emerald-300">Check {email} for your link.</p> : (
            <form className="space-y-2" onSubmit={async (e) => {
              e.preventDefault(); setErr(null);
              const { error } = await sb!.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/profile` } });
              if (error) setErr(error.message); else setSent(true);
            }}>
              <input type="email" required className="input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn-primary w-full">Email me a link</button>
              {err && <p className="text-xs text-rose-300">{err}</p>}
            </form>
          )}
        </div>
        <SystemStatus />
      </div>
    );
  }
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { error } = await sb!.from('profiles').update({ username: String(fd.get('username') || '').toLowerCase() || null, display_name: fd.get('display_name'), bio: fd.get('bio'), website: fd.get('website') }).eq('id', user.id);
    setErr(error ? error.message : 'Saved.'); setTick((t) => t + 1);
  };
  const moderate = async (id: string, status: 'approved' | 'rejected') => { await sb!.from('photos').update({ moderation_status: status }).eq('id', id); setTick((t) => t + 1); };

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="section-title flex-1">{profile?.display_name ?? 'Your profile'}</h1>
        {profile?.username && <Link href={`/profile/${profile.username}`} className="btn-ghost">Public page</Link>}
        <button className="btn-ghost" onClick={() => sb!.auth.signOut()}><LogOut size={15} />Sign out</button>
      </div>
      {profile && (
        <form onSubmit={save} className="card grid gap-2 p-4 md:grid-cols-2">
          <input name="username" defaultValue={profile.username ?? ''} className="input" placeholder="username (a-z, 0-9, _)" pattern="[a-z0-9_]{3,30}" />
          <input name="display_name" defaultValue={profile.display_name ?? ''} className="input" placeholder="Display name" />
          <input name="website" defaultValue={profile.website ?? ''} className="input" placeholder="Website / portfolio" />
          <input name="bio" defaultValue={profile.bio ?? ''} className="input" placeholder="Short bio" />
          <button className="btn-primary md:col-span-2">Save profile</button>
          {err && <p className="text-xs text-zinc-300 md:col-span-2">{err}</p>}
        </form>
      )}
      <section>
        <h2 className="section-title mb-3 flex items-center gap-2"><Bell size={20} />Notifications</h2>
        {notes.length ? <ul className="divide-y divide-white/5 card">{notes.map((n) => (
          <li key={n.id} className={`flex items-start gap-3 p-3 text-sm ${n.read_at ? 'opacity-60' : ''}`}>
            <div className="flex-1"><Link href={n.data?.slug ? `/location/${n.data.slug}` : '#'} className="hover:underline">{n.title}</Link><p className="text-xs text-zinc-500">{n.body} · {new Date(n.created_at).toLocaleString()}</p></div>
            {!n.read_at && <button className="chip" onClick={async () => { await sb!.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id); setTick((t) => t + 1); }}>Mark read</button>}
          </li>))}</ul> : <p className="text-sm text-zinc-400">No notifications yet. Turn on sunrise/sunset/astro alerts from any location page.</p>}
      </section>
      <section>
        <h2 className="section-title mb-3">My uploads</h2>
        {mine.length ? <div className="grid grid-cols-3 gap-2 md:grid-cols-6">{mine.map((p) => (
          <Link key={p.id} href={`/community/photo/${p.id}`} className="relative overflow-hidden rounded-lg"><PhotoImg src={communityPhotoRef(p).thumbUrl} alt="" className="aspect-square w-full" />
            {p.moderation_status !== 'approved' && <span className="absolute left-1 top-1 rounded bg-ink-950/80 px-1.5 text-[10px] capitalize text-amber-300">{p.moderation_status}</span>}</Link>))}</div>
          : <p className="text-sm text-zinc-400"><Link className="underline" href="/community/upload">Upload</Link> your first photo.</p>}
      </section>
      {profile?.is_admin && (
        <section>
          <h2 className="section-title mb-3 flex items-center gap-2"><Shield size={20} />Moderation queue</h2>
          <div className="grid gap-3 md:grid-cols-3">{queue.map((p) => (
            <div key={p.id} className="card overflow-hidden"><PhotoImg src={communityPhotoRef(p).thumbUrl} alt="" className="aspect-video w-full" />
              <div className="flex items-center gap-2 p-2 text-xs"><span className="flex-1 truncate">{p.title ?? 'Untitled'} · {p.display_name}</span>
                <button onClick={() => moderate(p.id, 'approved')} aria-label="Approve"><CheckCircle2 size={18} className="text-emerald-400" /></button>
                <button onClick={() => moderate(p.id, 'rejected')} aria-label="Reject"><XCircle size={18} className="text-rose-400" /></button></div></div>))}</div>
          {!queue.length && <p className="text-sm text-zinc-400">Nothing waiting.</p>}
          {reports.length > 0 && <ul className="card mt-4 divide-y divide-white/5 text-sm">{reports.map((r) => (
            <li key={r.id} className="flex items-center gap-2 p-3"><span className="flex-1">{r.reason}: {r.details} <span className="text-zinc-500">{r.photo_id ? `photo ${r.photo_id}` : r.location_id ? `location ${r.location_id}` : `comment ${r.comment_id}`}</span></span>
              <button className="chip" onClick={async () => { await sb!.from('reports').update({ resolved: true }).eq('id', r.id); setTick((t) => t + 1); }}>Resolve</button></li>))}</ul>}
        </section>
      )}
      <SystemStatus />
    </div>
  );
}

function SystemStatus() {
  const [s, setS] = useState<any>(null);
  useEffect(() => { fetch('/api/status').then((r) => r.json()).then(setS).catch(() => {}); }, []);
  if (!s) return null;
  return (
    <section className="card space-y-3 p-4 text-sm">
      <p className="label flex items-center gap-1"><Activity size={12} />Data pipeline status</p>
      <div className="flex flex-wrap gap-2 text-xs">{Object.entries(s.integrations).map(([k, v]) => <span key={k} className={`chip ${v ? 'border-emerald-400/40 text-emerald-300' : 'text-zinc-500'}`}>{k}: {v ? 'on' : 'off'}</span>)}</div>
      {s.counts && <p className="flex items-center gap-1 text-zinc-300"><Database size={13} />{s.counts.locations ?? 0} indexed locations · {s.counts.queuedJobs ?? 0} queued jobs</p>}
      {s.cycles?.length > 0 ? (
        <ul className="space-y-1 text-xs">{s.cycles.map((c: any) => (
          <li key={c.id} className="flex flex-wrap gap-2"><span className="font-mono text-zinc-400">#{c.id}</span><span className="capitalize">{c.status}</span><Freshness iso={c.started_at} label="started" />
            <span className="text-zinc-500">{c.trigger}{c.stats?.done != null && ` · ${c.stats.done} jobs ok, ${c.stats.dead ?? 0} failed`}</span></li>))}</ul>
      ) : <p className="text-xs text-zinc-500">No refresh cycles have run yet.</p>}
      {s.providers?.length > 0 && <ul className="text-xs text-zinc-500">{s.providers.map((p: any) => <li key={p.provider}>{p.provider}: {p.consecutive_failures ? `${p.consecutive_failures} recent failures (${p.last_error})` : 'healthy'}</li>)}</ul>}
    </section>
  );
}
