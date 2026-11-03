import { json } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hasSupabase, serverConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const cfg = serverConfig();
  const integrations = {
    database: hasSupabase() && !!cfg.serviceRoleKey,
    webcams: !!cfg.windyKey, flickr: !!cfg.flickrKey, routing: !!cfg.orsKey, cronSecret: !!cfg.cronSecret,
  };
  const sb = supabaseAdmin();
  if (!sb) return json({ integrations, cycles: [], providers: [], counts: null });
  const [cycles, providers, locs, queued] = await Promise.all([
    sb.from('refresh_cycles').select('*').order('started_at', { ascending: false }).limit(8),
    sb.from('provider_health').select('*'),
    sb.from('locations').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    sb.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
  ]);
  return json({ integrations, cycles: cycles.data ?? [], providers: providers.data ?? [], counts: { locations: locs.count, queuedJobs: queued.count } });
}
