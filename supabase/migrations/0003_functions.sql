-- ─── Geographic queries ───────────────────────────────────────────────────
create or replace function public.locations_nearby(
  p_lat double precision, p_lng double precision, p_radius_km double precision default 50,
  p_categories text[] default null, p_sort text default 'score', p_limit integer default 60
) returns table (loc jsonb, distance_km double precision)
language sql stable set search_path = public, extensions as $$
  with c as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography g)
  select to_jsonb(l) - 'geom' - 'osm_tags', st_distance(l.geom, c.g) / 1000.0
  from locations l, c
  where l.status = 'active'
    and st_dwithin(l.geom, c.g, least(p_radius_km, 500) * 1000)
    and (p_categories is null or l.categories && p_categories)
  order by
    case p_sort
      when 'distance' then st_distance(l.geom, c.g) / 1000.0
      when 'popularity' then -l.popularity_score
      when 'sunrise' then -coalesce((l.conditions->>'sunrise')::real, -1)
      when 'sunset' then -coalesce((l.conditions->>'sunset')::real, -1)
      when 'golden' then -coalesce((l.conditions->>'golden')::real, -1)
      when 'blue' then -coalesce((l.conditions->>'blue')::real, -1)
      when 'astro' then -coalesce((l.conditions->>'astro')::real, -1)
      when 'new' then -extract(epoch from l.discovered_at)
      when 'hidden' then -(case when l.hidden_gem then 1000 else 0 end + l.scenic_score)
      else -l.photo_score
    end
  limit least(p_limit, 300)
$$;

create or replace function public.locations_along_route(
  p_line_wkt text, p_buffer_km double precision default 10, p_categories text[] default null, p_limit integer default 80
) returns table (loc jsonb, distance_km double precision, route_fraction double precision)
language sql stable set search_path = public, extensions as $$
  with r as (select st_geogfromtext(p_line_wkt) g)
  select to_jsonb(l) - 'geom' - 'osm_tags',
         st_distance(l.geom, r.g) / 1000.0,
         st_linelocatepoint(r.g::geometry, l.geom::geometry)
  from locations l, r
  where l.status = 'active' and st_dwithin(l.geom, r.g, least(p_buffer_km, 50) * 1000)
    and (p_categories is null or l.categories && p_categories)
  order by l.photo_score desc
  limit least(p_limit, 300)
$$;

create or replace function public.search_locations(p_q text, p_categories text[] default null, p_limit integer default 40)
returns table (loc jsonb, rank real)
language sql stable set search_path = public, extensions as $$
  select to_jsonb(l) - 'geom' - 'osm_tags',
         greatest(similarity(unaccent(lower(l.name)), unaccent(lower(p_q))),
                  similarity(unaccent(lower(coalesce(l.country,'') || ' ' || coalesce(l.region,'') || ' ' || coalesce(l.nearest_town,''))), unaccent(lower(p_q))) * 0.8)
           + l.photo_score / 500.0 as rank
  from locations l
  where l.status = 'active'
    and (p_categories is null or l.categories && p_categories)
    and (unaccent(lower(l.name)) % unaccent(lower(p_q))
         or unaccent(lower(l.name)) ilike '%' || unaccent(lower(p_q)) || '%'
         or unaccent(lower(coalesce(l.country,''))) = unaccent(lower(p_q))
         or unaccent(lower(coalesce(l.region,''))) ilike unaccent(lower(p_q))
         or unaccent(lower(coalesce(l.nearest_town,''))) ilike unaccent(lower(p_q))
         or p_q = any(l.categories))
  order by rank desc
  limit least(p_limit, 200)
$$;

-- Candidate duplicates for the application-side matcher (which applies the final rules).
create or replace function public.find_duplicate_candidates(
  p_lat double precision, p_lng double precision, p_name text, p_wikidata text default null, p_osm text default null
) returns table (id uuid, name text, lat double precision, lng double precision, wikidata_id text, osm_id text, categories text[], distance_m double precision, name_sim real)
language sql stable set search_path = public, extensions as $$
  select l.id, l.name, l.lat, l.lng, l.wikidata_id, l.osm_id, l.categories,
         st_distance(l.geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography),
         similarity(l.name, p_name)
  from locations l
  where l.status <> 'merged' and (
    (p_wikidata is not null and l.wikidata_id = p_wikidata) or
    (p_osm is not null and l.osm_id = p_osm) or
    st_dwithin(l.geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, 600))
  limit 25
$$;

-- ─── Queue ────────────────────────────────────────────────────────────────
create or replace function public.claim_jobs(p_worker text, p_limit integer default 10)
returns setof public.jobs language plpgsql security definer set search_path = public as $$
begin
  -- Recover jobs whose worker died mid-flight
  update jobs set status = 'queued', locked_at = null, locked_by = null
   where status = 'running' and locked_at < now() - interval '15 minutes';
  return query
  update jobs j set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
  where j.id in (
    select id from jobs where status = 'queued' and run_after <= now()
    order by priority, run_after limit p_limit for update skip locked)
  returning j.*;
end $$;

create or replace function public.finish_job(p_id bigint, p_ok boolean, p_error text default null, p_result jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_id;
  if p_ok then
    update jobs set status = 'done', finished_at = now(), result = p_result, last_error = null where id = p_id;
  elsif j.attempts >= j.max_attempts then
    update jobs set status = 'dead', finished_at = now(), last_error = p_error where id = p_id;
  else
    -- exponential backoff: 2, 8, 32 … minutes
    update jobs set status = 'queued', locked_at = null, locked_by = null, last_error = p_error,
      run_after = now() + make_interval(mins => 2 * power(4, greatest(j.attempts - 1, 0))::int) where id = p_id;
  end if;
  -- close the cycle when its last job finishes
  if j.cycle_id is not null and not exists (select 1 from jobs where cycle_id = j.cycle_id and status in ('queued','running')) then
    update refresh_cycles set finished_at = now(),
      status = case when exists (select 1 from jobs where cycle_id = j.cycle_id and status = 'dead') then 'partial' else 'done' end,
      stats = stats || jsonb_build_object(
        'done', (select count(*) from jobs where cycle_id = j.cycle_id and status = 'done'),
        'dead', (select count(*) from jobs where cycle_id = j.cycle_id and status = 'dead'))
    where id = j.cycle_id and finished_at is null;
  end if;
end $$;

-- Seed a global discovery grid (5° tiles, polar caps excluded).
create or replace function public.seed_discovery_grid(p_step double precision default 5)
returns integer language plpgsql security definer set search_path = public as $$
declare la double precision; lo double precision; n integer := 0;
begin
  la := -56;
  while la < 72 loop
    lo := -180;
    while lo < 180 loop
      insert into discovery_regions (south, west, north, east) values (la, lo, la + p_step, lo + p_step) on conflict do nothing;
      n := n + 1; lo := lo + p_step;
    end loop;
    la := la + p_step;
  end loop;
  return n;
end $$;

/**
 * The 6-hourly cycle. Called by the GitHub Actions refresh job (independent of any user session).
 * Enqueues every stage of the refresh; workers drain the queue.
 */
create or replace function public.enqueue_refresh_cycle(
  p_trigger text default 'cron', p_regions integer default 6, p_locations integer default 150
) returns bigint language plpgsql security definer set search_path = public as $$
declare cid bigint;
begin
  if exists (select 1 from refresh_cycles where status = 'running' and started_at > now() - interval '5 hours') then
    raise notice 'previous cycle still running; skipping'; return null;
  end if;
  update refresh_cycles set status = 'partial', finished_at = now() where status = 'running';
  insert into refresh_cycles (trigger) values (p_trigger) returning id into cid;

  -- 1-2. Discover new locations: least-recently scanned grid tiles, productive tiles more often.
  insert into jobs (cycle_id, kind, payload, priority)
  select cid, 'discover_region', jsonb_build_object('regionId', id), 3 from (
    select id from discovery_regions
    where last_scanned_at is null
       or (coalesce(candidates_found, 0) > 0 and last_scanned_at < now() - interval '30 days')
       or last_scanned_at < now() - interval '180 days'
    order by priority desc, last_scanned_at nulls first, random()
    limit p_regions) r;

  -- Demand-driven discovery where users search but coverage is thin.
  insert into jobs (cycle_id, kind, payload, priority)
  select cid, 'discover_around', jsonb_build_object('lat', lat, 'lng', lng, 'radiusKm', 25, 'reason', 'demand'), 2
  from search_demand where last_discovered_at is null or last_discovered_at < now() - interval '14 days'
  order by hits desc limit 10;

  -- 3. Hidden gems near top spots (OSM viewpoints etc.).
  insert into jobs (cycle_id, kind, payload, priority)
  select cid, 'discover_around', jsonb_build_object('lat', lat, 'lng', lng, 'radiusKm', 8, 'reason', 'near_top'), 4
  from locations where status = 'active' order by trending_ratio desc nulls last, photo_score desc limit 4;

  -- 4-12. Refresh existing locations: stale first, then the most photographable.
  insert into jobs (cycle_id, kind, payload, priority)
  select cid, 'refresh_location', jsonb_build_object('locationId', id), 5 from (
    select id from locations where status = 'active'
    order by (last_refreshed_at is null) desc, last_refreshed_at < now() - interval '3 days' desc, photo_score desc, last_refreshed_at
    limit p_locations) l;

  insert into jobs (cycle_id, kind, payload, priority) values
    (cid, 'check_webcams', '{}', 7),
    (cid, 'check_images', '{}', 8),
    (cid, 'compute_trending', '{}', 9),
    (cid, 'evaluate_alerts', '{}', 9);
  return cid;
end $$;

create or replace function public.record_search_demand(p_lat double precision, p_lng double precision)
returns void language sql security definer set search_path = public as $$
  insert into search_demand (cell, lat, lng) values (floor(p_lat)::int || ':' || floor(p_lng)::int, p_lat, p_lng)
  on conflict (cell) do update set hits = search_demand.hits + 1, last_hit_at = now()
$$;

create or replace view public.trending_locations as
  select l.*, ph.popularity_score as prev_popularity
  from locations l
  left join lateral (select popularity_score from popularity_history h where h.location_id = l.id and h.observed_on <= current_date - 7 order by observed_on desc limit 1) ph on true
  where l.status = 'active' and l.trending_ratio is not null
  order by l.trending_ratio desc;

grant execute on function public.locations_nearby, public.locations_along_route, public.search_locations to anon, authenticated;
revoke execute on function public.claim_jobs, public.finish_job, public.enqueue_refresh_cycle, public.seed_discovery_grid, public.find_duplicate_candidates from anon, authenticated;
revoke execute on function public.record_search_demand from anon, authenticated;

select public.seed_discovery_grid(5);
