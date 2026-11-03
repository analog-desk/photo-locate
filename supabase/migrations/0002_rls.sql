-- Row level security. The service-role key (server/background jobs only) bypasses RLS.
alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.location_sources enable row level security;
alter table public.viewpoints enable row level security;
alter table public.parking_locations enable row level security;
alter table public.external_photos enable row level security;
alter table public.photos enable row level security;
alter table public.photo_likes enable row level security;
alter table public.photo_bookmarks enable row level security;
alter table public.photo_comments enable row level security;
alter table public.follows enable row level security;
alter table public.location_favorites enable row level security;
alter table public.ratings enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.itineraries enable row level security;
alter table public.itinerary_stops enable row level security;
alter table public.shoot_plans enable row level security;
alter table public.alert_rules enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.weather_observations enable row level security;
alter table public.astro_calculations enable row level security;
alter table public.webcam_sources enable row level security;
alter table public.location_webcams enable row level security;
alter table public.popularity_history enable row level security;
alter table public.location_updates enable row level security;
alter table public.discovery_regions enable row level security;
alter table public.search_demand enable row level security;
alter table public.refresh_cycles enable row level security;
alter table public.jobs enable row level security;
alter table public.provider_health enable row level security;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

-- Public reference data (read-only for clients)
create policy "read profiles" on public.profiles for select using (true);
create policy "update own profile" on public.profiles for update using (id = auth.uid());
create policy "read active locations" on public.locations for select using (status = 'active' or public.is_admin());
create policy "read sources" on public.location_sources for select using (true);
create policy "read viewpoints" on public.viewpoints for select using (true);
create policy "suggest viewpoint" on public.viewpoints for insert with check (created_by = auth.uid() and source_provider = 'community');
create policy "read parking" on public.parking_locations for select using (true);
create policy "read ext photos" on public.external_photos for select using (alive);
create policy "read weather" on public.weather_observations for select using (true);
create policy "read astro" on public.astro_calculations for select using (true);
create policy "read webcams" on public.webcam_sources for select using (true);
create policy "read loc webcams" on public.location_webcams for select using (true);
create policy "read popularity" on public.popularity_history for select using (true);
create policy "read updates" on public.location_updates for select using (true);
create policy "read cycles" on public.refresh_cycles for select using (true);
create policy "read provider health" on public.provider_health for select using (true);
-- jobs / discovery_regions / search_demand: no client policies → service role only.

-- Community photos
create policy "read approved or own photos" on public.photos for select
  using (moderation_status = 'approved' or user_id = auth.uid() or public.is_admin());
create policy "insert own photos" on public.photos for insert with check (user_id = auth.uid());
create policy "update own photos" on public.photos for update using (user_id = auth.uid() or public.is_admin());
create policy "delete own photos" on public.photos for delete using (user_id = auth.uid() or public.is_admin());

create policy "read likes" on public.photo_likes for select using (true);
create policy "like" on public.photo_likes for insert with check (user_id = auth.uid());
create policy "unlike" on public.photo_likes for delete using (user_id = auth.uid());
create policy "own bookmarks" on public.photo_bookmarks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read comments" on public.photo_comments for select using (not hidden or user_id = auth.uid() or public.is_admin());
create policy "comment" on public.photo_comments for insert with check (user_id = auth.uid());
create policy "delete own comment" on public.photo_comments for delete using (user_id = auth.uid() or public.is_admin());
create policy "read follows" on public.follows for select using (true);
create policy "follow" on public.follows for insert with check (follower_id = auth.uid());
create policy "unfollow" on public.follows for delete using (follower_id = auth.uid());
create policy "own favorites" on public.location_favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read ratings" on public.ratings for select using (true);
create policy "own ratings" on public.ratings for insert with check (user_id = auth.uid());
create policy "update own ratings" on public.ratings for update using (user_id = auth.uid());
create policy "delete own ratings" on public.ratings for delete using (user_id = auth.uid());

create policy "read collections" on public.collections for select using (is_public or user_id = auth.uid());
create policy "own collections" on public.collections for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read collection items" on public.collection_items for select
  using (exists (select 1 from collections c where c.id = collection_id and (c.is_public or c.user_id = auth.uid())));
create policy "own collection items" on public.collection_items for all
  using (exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid()))
  with check (exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid()));
create policy "read itineraries" on public.itineraries for select using (is_public or user_id = auth.uid());
create policy "own itineraries" on public.itineraries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read stops" on public.itinerary_stops for select
  using (exists (select 1 from itineraries i where i.id = itinerary_id and (i.is_public or i.user_id = auth.uid())));
create policy "own stops" on public.itinerary_stops for all
  using (exists (select 1 from itineraries i where i.id = itinerary_id and i.user_id = auth.uid()))
  with check (exists (select 1 from itineraries i where i.id = itinerary_id and i.user_id = auth.uid()));
create policy "own plans" on public.shoot_plans for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own alerts" on public.alert_rules for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "mark read" on public.notifications for update using (user_id = auth.uid());
create policy "report" on public.reports for insert with check (reporter_id = auth.uid());
create policy "admin reports" on public.reports for select using (public.is_admin());
create policy "admin resolve" on public.reports for update using (public.is_admin());

-- ─── Storage: user photo uploads ──────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 26214400, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do nothing;

create policy "upload into own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own objects" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
