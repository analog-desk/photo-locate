/**
 * Standalone 6-hour refresh runner — for GitHub Actions, a VM crontab, Fly/Railway schedulers, etc.
 * Enqueues a cycle and drains the queue completely (no serverless time limit).
 *   npx tsx scripts/run-refresh.ts            # enqueue + drain
 *   npx tsx scripts/run-refresh.ts --drain    # drain only
 */
import { supabaseAdmin } from '../src/lib/supabase/admin';
import { runWorker, startCycle } from '../src/lib/jobs/worker';
import { serverConfig } from '../src/lib/config';

async function main() {
  const sb = supabaseAdmin();
  if (!sb) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const cfg = serverConfig();
  if (!process.argv.includes('--drain')) {
    const id = await startCycle(sb, 'script', cfg.regionsPerCycle, cfg.locationsPerCycle);
    console.log(id ? `cycle ${id} enqueued` : 'a cycle is already running — draining its queue');
  }
  const stats = await runWorker(sb, { budgetMs: Number(process.env.WORKER_BUDGET_MS ?? 5.5 * 3600_000), workerId: `script-${process.pid}`, concurrency: 3 });
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
