-- Lumen Photo Atlas — core schema
create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ─── Users ──────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text,
  avatar_url text,
  bio text,
  website text,
  home_lat double precision,
  home_lng double precision,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ─── Locations ──────────────────────────────────────────────────────────────
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  geom geography(Point, 4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  country text, region text, nearest_town text, timezone text,
  elevation_m integer,
  description text, description_source_url text,
  wikidata_id text unique, osm_id text unique,
  wikipedia_title text, wikipedia_lang text,
  sitelinks integer,
  categories text[] not null default '{}',
  osm_tags jsonb,
  hero_image jsonb,
  photo_score smallint not null default 0,
  popularity_score smallint not null default 0,
  scenic_score smallint not null default 0,
  score_breakdown jsonb,
  conditions jsonb,                 -- {sunrise,sunset,golden,blue,astro,computedAt}
  best_months jsonb,
  access jsonb,                     -- AccessInfo (each field carries verified/source)
  focal_hints jsonb,
  hidden_gem boolean not null default false,
  confidence real not null default 0.5,
  photo_count integer not null default 0,
  community_rating numeric(3,2),
  rating_count integer not null default 0,
  trending_ratio real,
  status text not null default 'active' check (status in ('active','pending_review','merged','rejected')),
  merged_into uuid references public.locations,
  created_by uuid references auth.users,
  discovered_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  last_weather_at timestamptz,
  last_parking_at timestamptz,
  last_photos_at timestamptz,
  last_webcams_at timestamptz,
  updated_at timestamptz not null default now()
);
create index locations_geom_idx on public.locations using gist (geom);
create index locations_name_trgm on public.locations using gin (name gin_trgm_ops);
create index locations_categories_idx on public.locations using gin (categories);
create index locations_score_idx on public.locations (photo_score desc) where status = 'active';
create index locations_refresh_idx on public.locations (last_refreshed_at nulls first) where status = 'active';

create table public.location_sources (
  id bigserial primary key,
  location_id uuid not null references public.locations on delete cascade,
  provider text not null,
  external_id text not null,
  url text,
  fetched_at timestamptz not null default now(),
  unique (provider, external_id)
);

create table public.viewpoints (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations on delete cascade,
  name text,
  lat double precision not null, lng double precision not null,
  geom geography(Point, 4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  direction real, elevation_m integer,
  focal_length text, notes text,
  source_provider text not null default 'osm', source_id text,
  created_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  unique (location_id, source_provider, source_id)
);

create table public.parking_locations (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations on delete cascade,
  osm_id text not null,
  name text,
  lat double precision not null, lng double precision not null,
  geom geography(Point, 4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  fee jsonb, capacity jsonb, access jsonb, surface text,
  distance_to_spot_m integer,
  walking_distance jsonb, walking_time jsonb,  -- {value, verified, source}
  route jsonb,
  updated_at timestamptz not null default now(),
  unique (location_id, osm_id)
);

-- Licensed photographs from external authorised APIs (Commons / Flickr CC)
create table public.external_photos (
  id bigserial primary key,
  location_id uuid not null references public.locations on delete cascade,
  provider text not null,
  external_id text not null,
  data jsonb not null,               -- PhotoRef incl. author/license/sourceUrl
  taken_at timestamptz, light_phase text, season text,
  alive boolean not null default true,
  checked_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  unique (location_id, provider, external_id)
);
create index external_photos_loc_idx on public.external_photos (location_id) where alive;

-- ─── Community ──────────────────────────────────────────────────────────────
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  location_id uuid references public.locations on delete set null,
  storage_path text not null,
  width integer, height integer,
  title text check (char_length(title) <= 140),
  description text check (char_length(description) <= 4000),
  lat double precision, lng double precision,
  gps_public boolean not null default false,
  taken_at timestamptz,
  light_phase text check (light_phase in ('night','astronomical','nautical','blue','golden','day')),
  season text check (season in ('spring','summer','autumn','winter')),
  genres text[] not null default '{}',
  weather_condition text,
  camera text, lens text, focal_length real, aperture real, shutter text, iso integer,
  exif jsonb,
  license text not null default 'all-rights-reserved'
    check (license in ('all-rights-reserved','cc-by','cc-by-sa','cc-by-nc','cc-by-nc-sa','cc-by-nd','cc-by-nc-nd','cc0')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
  moderation_note text,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index photos_location_idx on public.photos (location_id, created_at desc) where moderation_status = 'approved';
create index photos_feed_idx on public.photos (created_at desc) where moderation_status = 'approved';

-- Public projection: hides coordinates unless the owner made them public.
create view public.photos_public with (security_invoker = true) as
  select p.id, p.user_id, p.location_id, p.storage_path, p.width, p.height, p.title, p.description,
    case when p.gps_public or p.user_id = auth.uid() then p.lat end as lat,
    case when p.gps_public or p.user_id = auth.uid() then p.lng end as lng,
    p.gps_public, p.taken_at, p.light_phase, p.season, p.genres, p.weather_condition,
    p.camera, p.lens, p.focal_length, p.aperture, p.shutter, p.iso, p.license,
    p.moderation_status, p.like_count, p.comment_count, p.created_at,
    pr.username, pr.display_name, pr.avatar_url
  from public.photos p left join public.profiles pr on pr.id = p.user_id;

create table public.photo_likes (user_id uuid references auth.users on delete cascade, photo_id uuid references public.photos on delete cascade, created_at timestamptz default now(), primary key (user_id, photo_id));
create table public.photo_bookmarks (user_id uuid references auth.users on delete cascade, photo_id uuid references public.photos on delete cascade, created_at timestamptz default now(), primary key (user_id, photo_id));
create table public.photo_comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.follows (follower_id uuid references auth.users on delete cascade, followee_id uuid references auth.users on delete cascade, created_at timestamptz default now(), primary key (follower_id, followee_id), check (follower_id <> followee_id));
create table public.location_favorites (user_id uuid references auth.users on delete cascade, location_id uuid references public.locations on delete cascade, created_at timestamptz default now(), primary key (user_id, location_id));

create table public.ratings (
  user_id uuid references auth.users on delete cascade,
  location_id uuid references public.locations on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  review text check (char_length(review) <= 2000),
  visited_on date,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null, description text,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.collection_items (
  id bigserial primary key,
  collection_id uuid not null references public.collections on delete cascade,
  location_id uuid references public.locations on delete cascade,
  photo_id uuid references public.photos on delete cascade,
  added_at timestamptz not null default now(),
  check ((location_id is null) <> (photo_id is null))
);

create table public.itineraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null, description text, start_date date,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.itinerary_stops (
  id bigserial primary key,
  itinerary_id uuid not null references public.itineraries on delete cascade,
  position integer not null,
  location_id uuid not null references public.locations on delete cascade,
  planned_at timestamptz, notes text
);

create table public.shoot_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  location_id uuid references public.locations on delete set null,
  location_ref text not null,     -- slug or live id, so plans work for not-yet-persisted spots
  location_name text not null,
  lat double precision not null, lng double precision not null,
  plan_date date not null,
  target text not null,           -- sunrise | sunset | golden_am | golden_pm | blue_am | blue_pm | astro
  arrival_at timestamptz,
  plan jsonb not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  location_id uuid not null references public.locations on delete cascade,
  kind text not null check (kind in ('sunrise','sunset','astro','fog','golden')),
  min_score smallint not null default 70,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, location_id, kind)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null, title text not null, body text,
  location_id uuid references public.locations on delete cascade,
  data jsonb,
  dedupe_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users on delete cascade,
  photo_id uuid references public.photos on delete cascade,
  comment_id uuid references public.photo_comments on delete cascade,
  location_id uuid references public.locations on delete cascade,
  reason text not null check (reason in ('copyright','trespass','unsafe','inappropriate','spam','inaccurate','other')),
  details text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─── Conditions, webcams, history ──────────────────────────────────────────
create table public.weather_observations (
  id bigserial primary key,
  location_id uuid not null references public.locations on delete cascade,
  fetched_at timestamptz not null default now(),
  provider text not null default 'open-meteo',
  current jsonb, daily jsonb, conditions jsonb, insights jsonb
);
create index weather_obs_loc_idx on public.weather_observations (location_id, fetched_at desc);

create table public.astro_calculations (
  location_id uuid references public.locations on delete cascade,
  date date not null,
  sun jsonb not null, moon jsonb not null, night jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (location_id, date)
);

create table public.webcam_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  title text,
  lat double precision, lng double precision,
  geom geography(Point, 4326) generated always as (case when lat is not null then st_setsrid(st_makepoint(lng, lat), 4326)::geography end) stored,
  status text, last_updated_on timestamptz, stale boolean not null default false,
  preview_url text, thumbnail_url text, player_day_url text, player_live_url text, page_url text,
  categories text[], direction real,
  checked_at timestamptz not null default now(),
  unique (provider, external_id)
);
create table public.location_webcams (
  location_id uuid references public.locations on delete cascade,
  webcam_id uuid references public.webcam_sources on delete cascade,
  distance_km real,
  primary key (location_id, webcam_id)
);

create table public.popularity_history (
  location_id uuid references public.locations on delete cascade,
  observed_on date not null default current_date,
  pageviews_avg real, photo_count integer, flickr_recent integer, community_events integer,
  popularity_score smallint, photo_score smallint,
  primary key (location_id, observed_on)
);

create table public.location_updates (
  id bigserial primary key,
  location_id uuid not null references public.locations on delete cascade,
  job_id bigint,
  action text not null,           -- created | refreshed | merged | flagged
  changed_fields text[],
  diff jsonb,
  created_at timestamptz not null default now()
);
create index location_updates_loc_idx on public.location_updates (location_id, created_at desc);

-- ─── Background processing ─────────────────────────────────────────────────
create table public.discovery_regions (
  id serial primary key,
  south double precision not null, west double precision not null,
  north double precision not null, east double precision not null,
  depth smallint not null default 0,
  priority real not null default 1,
  last_scanned_at timestamptz,
  candidates_found integer,
  reason text not null default 'grid',
  unique (south, west, north, east)
);

create table public.search_demand (
  cell text primary key,          -- 1° cell "lat:lng"
  lat double precision not null, lng double precision not null,
  hits integer not null default 1,
  last_hit_at timestamptz not null default now(),
  last_discovered_at timestamptz
);

create table public.refresh_cycles (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','done','partial','failed')),
  trigger text not null default 'cron',
  stats jsonb not null default '{}'
);

create table public.jobs (
  id bigserial primary key,
  cycle_id bigint references public.refresh_cycles on delete set null,
  kind text not null,
  payload jsonb not null default '{}',
  priority smallint not null default 5,
  status text not null default 'queued' check (status in ('queued','running','done','failed','dead')),
  attempts smallint not null default 0,
  max_attempts smallint not null default 4,
  run_after timestamptz not null default now(),
  locked_at timestamptz, locked_by text,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index jobs_ready_idx on public.jobs (priority, run_after) where status = 'queued';

create table public.provider_health (
  provider text primary key,
  last_success_at timestamptz, last_error_at timestamptz, last_error text,
  consecutive_failures integer not null default 0,
  circuit_open_until timestamptz
);

-- ─── Triggers ──────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger locations_touch before update on public.locations for each row execute function public.touch_updated_at();

create or replace function public.recalc_rating() returns trigger language plpgsql security definer set search_path = public as $$
declare lid uuid := coalesce(new.location_id, old.location_id);
begin
  update locations set community_rating = (select avg(rating) from ratings where location_id = lid),
                       rating_count = (select count(*) from ratings where location_id = lid) where id = lid;
  return null;
end $$;
create trigger ratings_recalc after insert or update or delete on public.ratings for each row execute function public.recalc_rating();

create or replace function public.recalc_photo_counts() returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.photo_id, old.photo_id);
begin
  if tg_table_name = 'photo_likes' then
    update photos set like_count = (select count(*) from photo_likes where photo_id = pid) where id = pid;
  else
    update photos set comment_count = (select count(*) from photo_comments where photo_id = pid and not hidden) where id = pid;
  end if;
  return null;
end $$;
create trigger likes_count after insert or delete on public.photo_likes for each row execute function public.recalc_photo_counts();
create trigger comments_count after insert or update or delete on public.photo_comments for each row execute function public.recalc_photo_counts();

-- Auto-hide content after 3 distinct open reports, pending admin review.
create or replace function public.auto_moderate() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.photo_id is not null and (select count(distinct reporter_id) from reports where photo_id = new.photo_id and not resolved) >= 3 then
    update photos set moderation_status = 'pending', moderation_note = 'Auto-hidden after multiple reports' where id = new.photo_id;
  end if;
  if new.comment_id is not null and (select count(distinct reporter_id) from reports where comment_id = new.comment_id and not resolved) >= 3 then
    update photo_comments set hidden = true where id = new.comment_id;
  end if;
  return new;
end $$;
create trigger reports_moderate after insert on public.reports for each row execute function public.auto_moderate();

-- Users cannot self-approve photos or alter counters.
create or replace function public.guard_photo_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    new.moderation_status := case when tg_op = 'INSERT' then 'pending' else old.moderation_status end;
    if tg_op = 'UPDATE' then new.like_count := old.like_count; new.comment_count := old.comment_count; new.user_id := old.user_id; end if;
  end if;
  return new;
end $$;
create trigger photos_guard before insert or update on public.photos for each row execute function public.guard_photo_update();

create or replace function public.guard_profile_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    new.is_admin := old.is_admin;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_update();
