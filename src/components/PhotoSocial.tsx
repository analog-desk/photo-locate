'use client';
import { useEffect, useState } from 'react';
import { Bookmark, Flag, Heart, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export function PhotoSocial({ photoId, ownerId }: { photoId: string; ownerId: string }) {
  const { sb, user } = useAuth();
  const [liked, setLiked] = useState(false), [saved, setSaved] = useState(false), [following, setFollowing] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState(''); const [msg, setMsg] = useState<string | null>(null);
  const load = () => sb?.from('photo_comments').select('id, body, created_at, user_id, profiles:user_id(display_name, username)').eq('photo_id', photoId).order('created_at').then(({ data }) => setComments(data ?? []));
  useEffect(() => { load(); }, [sb, photoId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sb || !user) return;
    sb.from('photo_likes').select('photo_id').eq('user_id', user.id).eq('photo_id', photoId).maybeSingle().then(({ data }) => setLiked(!!data));
    sb.from('photo_bookmarks').select('photo_id').eq('user_id', user.id).eq('photo_id', photoId).maybeSingle().then(({ data }) => setSaved(!!data));
    sb.from('follows').select('followee_id').eq('follower_id', user.id).eq('followee_id', ownerId).maybeSingle().then(({ data }) => setFollowing(!!data));
  }, [sb, user, photoId, ownerId]);
  if (!sb) return null;
  const guard = () => { if (!user) { setMsg('Sign in on the Profile page to interact.'); return false; } return true; };
  const toggle = async (table: 'photo_likes' | 'photo_bookmarks', on: boolean, set: (v: boolean) => void) => {
    if (!guard()) return;
    if (on) await sb.from(table).delete().eq('user_id', user!.id).eq('photo_id', photoId); else await sb.from(table).insert({ user_id: user!.id, photo_id: photoId });
    set(!on);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={() => toggle('photo_likes', liked, setLiked)}><Heart size={15} className={liked ? 'fill-rose-400 text-rose-400' : ''} />{liked ? 'Liked' : 'Like'}</button>
        <button className="btn-ghost" onClick={() => toggle('photo_bookmarks', saved, setSaved)}><Bookmark size={15} className={saved ? 'fill-gold-400 text-gold-400' : ''} />{saved ? 'Bookmarked' : 'Bookmark'}</button>
        {user?.id !== ownerId && <button className="btn-ghost" onClick={async () => {
          if (!guard()) return;
          if (following) await sb.from('follows').delete().eq('follower_id', user!.id).eq('followee_id', ownerId); else await sb.from('follows').insert({ follower_id: user!.id, followee_id: ownerId });
          setFollowing(!following);
        }}><UserPlus size={15} />{following ? 'Following' : 'Follow photographer'}</button>}
        <button className="btn-ghost text-zinc-400" onClick={async () => {
          if (!guard()) return;
          const reason = window.prompt('Reason: copyright, trespass, unsafe, inappropriate, spam, other', 'copyright');
          if (!reason) return;
          await sb.from('reports').insert({ reporter_id: user!.id, photo_id: photoId, reason: ['copyright', 'trespass', 'unsafe', 'inappropriate', 'spam'].includes(reason) ? reason : 'other', details: reason });
          setMsg('Thanks, moderators will review this photo.');
        }}><Flag size={15} />Report</button>
      </div>
      {msg && <p className="text-xs text-gold-200">{msg}</p>}
      <div className="space-y-2">
        <p className="label">Comments</p>
        {comments.map((c) => <div key={c.id} className="rounded-xl bg-white/5 px-3 py-2 text-sm"><span className="text-zinc-400">{c.profiles?.display_name ?? 'Member'}</span> {c.body}</div>)}
        <form onSubmit={async (e) => { e.preventDefault(); if (!guard() || !text.trim()) return; const { error } = await sb.from('photo_comments').insert({ photo_id: photoId, user_id: user!.id, body: text.trim() }); if (error) setMsg(error.message); else { setText(''); load(); } }} className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} className="input" placeholder="Add a comment" maxLength={2000} />
          <button className="btn-ghost">Post</button>
        </form>
      </div>
    </div>
  );
}
