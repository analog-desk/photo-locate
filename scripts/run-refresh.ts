/**
 * The six-hour refresh, run by .github/workflows/refresh.yml (or any crontab).
 * Enqueues a discovery + refresh cycle and drains the whole queue — no server or serverless time limit needed.
 *   npm run refresh            # enqueue + drain
 *   npm run refresh -- --drain # drain only
 */
import { supabaseAdmin } from '../src/lib/supabase/admin';
import { runWorker, startCycle } from '../src/lib/jobs/worker';
import { serverConfig } from '../src/lib/config';

async function main() {
  const sb = supabaseAdmin();
  if (!sb) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const cfg = serverConfig();
  if (!process.argv.includes('--drain')) {
    const id = await startCycle(sb, 'github-actions', cfg.regionsPerCycle, cfg.locationsPerCycle);
    console.log(id ? `cycle ${id} enqueued` : 'a cycle is already running — draining its queue');
  }
  const stats = await runWorker(sb, { budgetMs: Number(process.env.WORKER_BUDGET_MS ?? 5.5 * 3600_000), workerId: `actions-${process.pid}`, concurrency: 3 });
  await sb.rpc('housekeeping');
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
