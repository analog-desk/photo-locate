import type { SupabaseClient } from '@supabase/supabase-js';
import { HANDLERS, type Job } from './handlers';
import { ProviderError } from '../http';

export interface WorkerStats { processed: number; ok: number; failed: number; byKind: Record<string, number>; stoppedBecause: 'empty' | 'budget' }

async function recordHealth(sb: SupabaseClient, provider: string | undefined, ok: boolean, err?: string) {
  if (!provider) return;
  if (ok) {
    await sb.from('provider_health').upsert({ provider, last_success_at: new Date().toISOString(), consecutive_failures: 0, circuit_open_until: null });
  } else {
    const { data } = await sb.from('provider_health').select('consecutive_failures').eq('provider', provider).maybeSingle();
    const n = (data?.consecutive_failures ?? 0) + 1;
    await sb.from('provider_health').upsert({
      provider, last_error_at: new Date().toISOString(), last_error: err?.slice(0, 500), consecutive_failures: n,
      // Circuit breaker: after 5 consecutive failures back off the provider for 30 minutes
      circuit_open_until: n >= 5 ? new Date(Date.now() + 30 * 60000).toISOString() : null,
    });
  }
}

/** Drain the queue until it's empty or the time budget is spent (serverless-friendly). */
export async function runWorker(sb: SupabaseClient, opts: { budgetMs: number; workerId: string; concurrency?: number }): Promise<WorkerStats> {
  const deadline = Date.now() + opts.budgetMs;
  const stats: WorkerStats = { processed: 0, ok: 0, failed: 0, byKind: {}, stoppedBecause: 'empty' };
  const conc = opts.concurrency ?? 3;
  while (Date.now() < deadline - 20000) {
    const { data: jobs, error } = await sb.rpc('claim_jobs', { p_worker: opts.workerId, p_limit: conc });
    if (error) throw new Error(`claim_jobs: ${error.message}`);
    if (!jobs?.length) return stats;
    await Promise.all((jobs as Job[]).map(async (job) => {
      const handler = HANDLERS[job.kind];
      stats.processed++;
      stats.byKind[job.kind] = (stats.byKind[job.kind] ?? 0) + 1;
      try {
        if (!handler) throw new Error(`unknown job kind ${job.kind}`);
        const result = await handler(sb, job);
        await sb.rpc('finish_job', { p_id: job.id, p_ok: true, p_result: result });
        stats.ok++;
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        await sb.rpc('finish_job', { p_id: job.id, p_ok: false, p_error: msg.slice(0, 1000) });
        if (e instanceof ProviderError) await recordHealth(sb, e.provider, false, msg);
        stats.failed++;
      }
    }));
  }
  stats.stoppedBecause = 'budget';
  return stats;
}

export async function startCycle(sb: SupabaseClient, trigger: string, regions: number, locations: number) {
  const { data, error } = await sb.rpc('enqueue_refresh_cycle', { p_trigger: trigger, p_regions: regions, p_locations: locations });
  if (error) throw new Error(`enqueue_refresh_cycle: ${error.message}`);
  return data as number | null;
}
