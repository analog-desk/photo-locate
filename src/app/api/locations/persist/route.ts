import { fail, json } from '@/lib/api';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';
import { liveCandidateById } from '@/lib/repo/live';
import { upsertCandidate } from '@/lib/jobs/persist';

export const runtime = 'nodejs';

/** Index a live (not-yet-stored) spot when a signed-in user engages with it (favorite, rate, upload, plan). */
export async function POST(req: Request) {
  const sb = await supabaseServer(), admin = supabaseAdmin();
  if (!sb || !admin) return fail(503, 'backend not configured');
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fail(401, 'sign in required');
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== 'string') return fail(400, 'id required');
  if (/^[0-9a-f-]{36}$/.test(id)) return json({ locationId: id });
  const cand = await liveCandidateById(id);
  if (!cand) return fail(404, 'unknown location');
  const r = await upsertCandidate(admin, cand);
  if (!r.id) {
    // already present (race) → look it up by external id
    const col = cand.wikidataId ? 'wikidata_id' : 'osm_id';
    const { data } = await admin.from('locations').select('id').eq(col, cand.wikidataId ?? cand.osmId).maybeSingle();
    if (!data) return fail(422, `not indexable: ${r.reason}`);
    return json({ locationId: data.id });
  }
  if (r.action === 'created') await admin.from('jobs').insert({ kind: 'refresh_location', payload: { locationId: r.id }, priority: 1 });
  return json({ locationId: r.id, created: r.action === 'created' });
}
