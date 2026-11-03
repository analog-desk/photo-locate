import { authorizedCron, fail, json } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { runWorker, startCycle } from '@/lib/jobs/worker';
import { serverConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * 6-hourly entry point for HTTP schedulers (Vercel Cron `0 *\/6 * * *`, GitHub Actions, any cron service).
 * pg_cron calls `enqueue_refresh_cycle()` directly in the database, so this is a secondary path.
 * Enqueues the cycle (idempotent while one is running) then drains as much of the queue as the budget allows;
 * the remainder is picked up by /api/jobs/worker kicks.
 */
async function handle(req: Request) {
  if (!authorizedCron(req)) return fail(401, 'unauthorized');
  const sb = supabaseAdmin();
  if (!sb) return fail(503, 'SUPABASE_SERVICE_ROLE_KEY not configured');
  const cfg = serverConfig();
  const cycleId = await startCycle(sb, 'http-cron', cfg.regionsPerCycle, cfg.locationsPerCycle);
  const stats = await runWorker(sb, { budgetMs: (maxDuration - 15) * 1000, workerId: `cron-${Date.now()}` });
  return json({ cycleId, stats });
}

export const GET = handle;
export const POST = handle;
