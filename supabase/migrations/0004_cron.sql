-- ─── Scheduling (runs inside Postgres, independent of whether anyone has the app open) ───
-- Prerequisites (Supabase dashboard → Database → Extensions): pg_cron, pg_net.
-- Store the worker URL + secret in Vault:
--   select vault.create_secret('https://YOUR-DOMAIN/api/jobs/worker', 'lumen_worker_url');
--   select vault.create_secret('<same value as CRON_SECRET>', 'lumen_cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.kick_worker() returns void language plpgsql security definer set search_path = public, extensions as $$
declare url text; secret text;
begin
  if not exists (select 1 from jobs where status = 'queued' and run_after <= now()) then return; end if;
  select decrypted_secret into url from vault.decrypted_secrets where name = 'lumen_worker_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'lumen_cron_secret';
  if url is null or secret is null then raise warning 'lumen worker secrets missing in vault'; return; end if;
  perform net.http_post(url := url, headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
                        body := '{}'::jsonb, timeout_milliseconds := 5000);
end $$;
revoke execute on function public.kick_worker from anon, authenticated;

-- Every 6 hours at :00 UTC — enqueue a full discovery + refresh cycle.
select cron.schedule('lumen-refresh-cycle', '0 */6 * * *', $$select public.enqueue_refresh_cycle('cron')$$);
-- Every 2 minutes — wake a serverless worker if the queue has ready jobs (no-op otherwise).
select cron.schedule('lumen-worker-kick', '*/2 * * * *', $$select public.kick_worker()$$);
-- Housekeeping
select cron.schedule('lumen-housekeeping', '30 3 * * *', $$
  delete from jobs where status in ('done','dead') and finished_at < now() - interval '14 days';
  delete from weather_observations where fetched_at < now() - interval '30 days';
  delete from astro_calculations where date < current_date - 2;
$$);
