import { authorizedCron, fail, json } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { runWorker } from '@/lib/jobs/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Queue drainer — kicked every 2 minutes by pg_cron (via pg_net) only when jobs are waiting. */
export async function POST(req: Request) {
  if (!authorizedCron(req)) return fail(401, 'unauthorized');
  const sb = supabaseAdmin();
  if (!sb) return fail(503, 'SUPABASE_SERVICE_ROLE_KEY not configured');
  const stats = await runWorker(sb, { budgetMs: (maxDuration - 15) * 1000, workerId: `worker-${Date.now()}` });
  return json(stats);
}
