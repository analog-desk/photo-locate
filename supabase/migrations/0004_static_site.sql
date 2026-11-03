-- Functions the static (GitHub Pages) front end calls with the anon key, plus housekeeping run by the
-- six-hour GitHub Actions job. No server or worker URL is needed: Actions enqueues and drains the queue.

-- Signed-in users can ask for a live spot (from Wikidata/OSM) to be indexed when they save, rate, plan or upload.
-- The row starts as pending_review and only goes public after the next refresh re-validates it against its source.
create or replace function public.request_index(
  p_name text, p_lat double precision, p_lng double precision, p_categories text[],
  p_wikidata text default null, p_osm text default null, p_country text default null, p_image text default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  lid uuid;
  ok_cats text[] := array['landscape','mountains','waterfalls','lakes','beaches','coastlines','forests','wildlife','architecture','cityscapes','street','abandoned','night','astro','drone'];
  suffix text;
begin
  if uid is null then raise exception 'sign in required'; end if;
  if p_wikidata is null and p_osm is null then raise exception 'a Wikidata or OpenStreetMap id is required'; end if;
  if p_wikidata is not null and p_wikidata !~ '^Q[0-9]+$' then raise exception 'invalid Wikidata id'; end if;
  if p_osm is not null and p_osm !~ '^(node|way|relation)/[0-9]+$' then raise exception 'invalid OSM id'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or (abs(p_lat) < 1e-6 and abs(p_lng) < 1e-6) then raise exception 'invalid coordinates'; end if;
  if p_name is null or char_length(p_name) not between 2 and 160 then raise exception 'invalid name'; end if;

  select id into lid from locations
   where (p_wikidata is not null and wikidata_id = p_wikidata) or (p_osm is not null and osm_id = p_osm) limit 1;
  if lid is not null then return lid; end if;

  if (select count(*) from locations where created_by = uid and discovered_at > now() - interval '1 day') >= 30 then
    raise exception 'daily indexing limit reached';
  end if;

  suffix := lower(regexp_replace(coalesce(p_wikidata, p_osm), '[^a-zA-Z0-9]', '', 'g'));
  insert into locations (slug, name, lat, lng, categories, wikidata_id, osm_id, country, confidence, status, created_by)
  values (
    trim(both '-' from left(regexp_replace(lower(unaccent(p_name)), '[^a-z0-9]+', '-', 'g'), 60)) || '-' || suffix,
    p_name, p_lat, p_lng,
    coalesce((select array_agg(distinct c) from unnest(p_categories) c where c = any(ok_cats)), '{landscape}'),
    p_wikidata, p_osm, p_country, 0.5, 'pending_review', uid)
  on conflict do nothing
  returning id into lid;
  if lid is null then  -- lost a race with another insert
    select id into lid from locations where (p_wikidata is not null and wikidata_id = p_wikidata) or (p_osm is not null and osm_id = p_osm) limit 1;
    return lid;
  end if;

  insert into location_sources (location_id, provider, external_id, url)
  select lid, 'wikidata', p_wikidata, 'https://www.wikidata.org/wiki/' || p_wikidata where p_wikidata is not null
  union all
  select lid, 'osm', p_osm, 'https://www.openstreetmap.org/' || p_osm where p_osm is not null
  on conflict do nothing;
  insert into jobs (kind, payload, priority) values ('refresh_location', jsonb_build_object('locationId', lid), 1);
  insert into location_updates (location_id, action, changed_fields, diff) values (lid, 'created', '{*}', jsonb_build_object('requested_by', uid));
  return lid;
end $$;
revoke execute on function public.request_index from anon;
grant execute on function public.request_index to authenticated;

-- Public pipeline counters for the status panel (jobs table itself stays private).
create or replace function public.pipeline_counts()
returns table (locations bigint, queued_jobs bigint, pending_review bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from locations where status = 'active'),
         (select count(*) from jobs where status = 'queued'),
         (select count(*) from locations where status = 'pending_review')
$$;
grant execute on function public.pipeline_counts to anon, authenticated;

-- Search demand is logged from the browser (a harmless counter per 1° cell).
grant execute on function public.record_search_demand to anon, authenticated;

create or replace function public.housekeeping() returns void language sql security definer set search_path = public as $$
  delete from jobs where status in ('done','dead') and finished_at < now() - interval '14 days';
  delete from weather_observations where fetched_at < now() - interval '30 days';
  delete from astro_calculations where date < current_date - 2;
$$;
revoke execute on function public.housekeeping from anon, authenticated;
