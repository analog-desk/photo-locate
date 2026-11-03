import 'server-only';
import { supabaseAdmin } from '../supabase/admin';
import { supabaseServer } from '../supabase/server';
import { liveDetail, liveNearby, type NearbyQuery } from './live';
import { rowToSummary } from './mappers';
import { sortSummaries } from './sort';
import { isDuplicate } from '../dedupe';
import { communityPhotoRef } from '../jobs/community';
import { parseLiveId } from '../enrich';
import { haversineKm } from '../geo';
import type { Category, LocationDetail, LocationSummary, Parking, PhotoRef, SortKey, Viewpoint } from '../types';

export type { NearbyQuery };

export interface RepoResult<T> { data: T; mode: 'database' | 'live' | 'hybrid'; note?: string }

async function db() {
  return (await supabaseServer()) ?? null;
}

export async function nearby(q: NearbyQuery): Promise<RepoResult<LocationSummary[]>> {
  const sb = await db();
  if (!sb) return { data: await liveNearby(q), mode: 'live' };
  const { data, error } = await sb.rpc('locations_nearby', {
    p_lat: q.lat, p_lng: q.lng, p_radius_km: q.radiusKm, p_categories: q.categories?.length ? q.categories : null,
    p_sort: q.sort ?? 'score', p_limit: q.limit ?? 60,
  });
  if (error) return { data: await liveNearby(q), mode: 'live', note: `database error: ${error.message}` };
  const fromDb = (data as any[]).map((r) => rowToSummary(r.loc, r.distance_km));
  // Record demand so the next cycle discovers this area properly.
  supabaseAdmin()?.rpc('record_search_demand', { p_lat: q.lat, p_lng: q.lng }).then(() => {}, () => {});
  if (fromDb.length >= Math.min(12, q.limit ?? 60)) return { data: fromDb, mode: 'database' };
  // Sparse coverage → top up with live results that aren't already stored.
  try {
    const live = await liveNearby(q);
    const extra = live.filter((l) => !fromDb.some((d) => isDuplicate(
      { name: d.name, lat: d.lat, lng: d.lng, wikidataId: d.sources.find((s) => s.provider === 'wikidata')?.id },
      { name: l.name, lat: l.lat, lng: l.lng, wikidataId: l.sources.find((s) => s.provider === 'wikidata')?.id })));
    return { data: sortSummaries([...fromDb, ...extra], q.sort ?? 'score').slice(0, q.limit ?? 60), mode: 'hybrid', note: 'Area not fully indexed yet — scheduled for the next discovery cycle.' };
  } catch {
    return { data: fromDb, mode: 'database' };
  }
}

export async function search(qs: string, categories?: Category[], near?: { lat: number; lng: number }): Promise<RepoResult<LocationSummary[]>> {
  const sb = await db();
  if (!sb) return { data: [], mode: 'live' };
  const { data, error } = await sb.rpc('search_locations', { p_q: qs, p_categories: categories?.length ? categories : null, p_limit: 60 });
  if (error) return { data: [], mode: 'database', note: error.message };
  return { data: (data as any[]).map((r) => rowToSummary(r.loc, near ? haversineKm(near, r.loc) : undefined)), mode: 'database' };
}

export async function listByOrder(order: 'trending' | 'recent' | 'top' | 'hidden', limit = 24, categories?: Category[]): Promise<LocationSummary[]> {
  const sb = await db();
  if (!sb) return [];
  let q = sb.from(order === 'trending' ? 'trending_locations' : 'locations').select('*').eq('status', 'active').limit(limit);
  if (categories?.length) q = q.overlaps('categories', categories);
  if (order === 'recent') q = q.order('discovered_at', { ascending: false });
  if (order === 'top') q = q.order('photo_score', { ascending: false });
  if (order === 'hidden') q = q.eq('hidden_gem', true).order('scenic_score', { ascending: false });
  if (order === 'trending') q = q.gt('trending_ratio', 1.15);
  const { data } = await q;
  return (data ?? []).map((r) => rowToSummary(r));
}

export async function alongRoute(line: [number, number][], bufferKm: number, categories?: Category[]): Promise<LocationSummary[]> {
  const sb = await db();
  if (!sb) return [];
  const wkt = `LINESTRING(${line.map(([lat, lng]) => `${lng} ${lat}`).join(',')})`;
  const { data } = await sb.rpc('locations_along_route', { p_line_wkt: wkt, p_buffer_km: bufferKm, p_categories: categories?.length ? categories : null, p_limit: 120 });
  return ((data ?? []) as any[]).map((r) => ({ ...rowToSummary(r.loc, r.distance_km), routeFraction: r.route_fraction }));
}

export async function communityPhotosFor(locationId: string, limit = 60): Promise<PhotoRef[]> {
  const sb = await db();
  if (!sb) return [];
  const { data } = await sb.from('photos_public').select('*').eq('location_id', locationId).eq('moderation_status', 'approved').order('created_at', { ascending: false }).limit(limit);
  return (data ?? []).map((p: any) => communityPhotoRef(p));
}

export { communityPhotoRef } from '../jobs/community';

export async function detail(idOrSlug: string): Promise<RepoResult<LocationDetail | null>> {
  const sb = await db();
  const live = parseLiveId(idOrSlug);
  if (sb) {
    let q = sb.from('locations').select('*').eq('status', 'active');
    if (live?.wikidataId) q = q.eq('wikidata_id', live.wikidataId);
    else if (live?.osmId) q = q.eq('osm_id', live.osmId);
    else if (/^[0-9a-f-]{36}$/.test(idOrSlug)) q = q.eq('id', idOrSlug);
    else q = q.eq('slug', idOrSlug);
    const { data: row } = await q.maybeSingle();
    if (row) {
      const [vp, pk, ext, comm] = await Promise.all([
        sb.from('viewpoints').select('*').eq('location_id', row.id),
        sb.from('parking_locations').select('*').eq('location_id', row.id).order('distance_to_spot_m'),
        sb.from('external_photos').select('data').eq('location_id', row.id).eq('alive', true).limit(80),
        communityPhotosFor(row.id),
      ]);
      const viewpoints: Viewpoint[] = (vp.data ?? []).map((v: any) => ({ id: v.id, name: v.name, lat: v.lat, lng: v.lng, direction: v.direction, elevation: v.elevation_m, source: { provider: v.source_provider, id: v.source_id ?? v.id, url: v.source_provider === 'osm' ? `https://www.openstreetmap.org/${v.source_id}` : undefined } }));
      const parking: Parking[] = (pk.data ?? []).map((p: any) => ({
        id: p.osm_id, name: p.name, lat: p.lat, lng: p.lng, fee: p.fee, capacity: p.capacity, access: p.access, surface: p.surface,
        distanceToSpotM: p.distance_to_spot_m, walkingDistanceM: p.walking_distance, walkingTimeMin: p.walking_time, route: p.route,
        source: { provider: 'osm', id: p.osm_id, url: `https://www.openstreetmap.org/${p.osm_id}` },
      }));
      const s = rowToSummary(row);
      const d: LocationDetail = {
        ...s,
        description: row.description,
        descriptionSource: row.description_source_url ? { provider: 'wikidata', id: row.wikipedia_title, url: row.description_source_url } : undefined,
        elevation: row.elevation_m != null ? { value: row.elevation_m, verified: true, source: 'Copernicus DEM via Open-Meteo' } : { value: null, verified: false },
        timezone: row.timezone,
        wikipediaUrl: row.description_source_url,
        bestMonths: row.best_months,
        viewpoints, parking,
        access: row.access ?? emptyAccess(),
        photos: [...comm, ...(ext.data ?? []).map((e: any) => e.data as PhotoRef)],
        scoreBreakdown: row.score_breakdown,
        focalHints: row.focal_hints ?? [],
        osmTags: row.osm_tags ?? undefined,
      };
      return { data: d, mode: 'database' };
    }
  }
  if (!live) return { data: null, mode: sb ? 'database' : 'live' };
  return { data: await liveDetail(idOrSlug), mode: 'live' };
}

function emptyAccess() {
  const u = { value: null, verified: false };
  return { openingHours: u, fee: u, access: u, wheelchair: u, hikingDifficulty: u, privateProperty: false, protectedArea: u, droneRestriction: u, safetyNotes: [] };
}

export type { SortKey };

export async function seasonalNow(limit = 12): Promise<LocationSummary[]> {
  const sb = await db();
  if (!sb) return [];
  const m = new Date().getUTCMonth() + 1;
  const { data } = await sb.from('locations').select('*').eq('status', 'active').contains('best_months', { months: [m] }).order('photo_score', { ascending: false }).limit(limit);
  return (data ?? []).map((r) => rowToSummary(r));
}

export async function communityFeed(limit = 24, opts: { userIds?: string[] } = {}): Promise<(PhotoRef & { locationId: string | null; likeCount: number; commentCount: number; createdAt: string })[]> {
  const sb = await db();
  if (!sb) return [];
  let q = sb.from('photos_public').select('*').eq('moderation_status', 'approved').order('created_at', { ascending: false }).limit(limit);
  if (opts.userIds) q = q.in('user_id', opts.userIds);
  const { data } = await q;
  return (data ?? []).map((p: any) => ({ ...communityPhotoRef(p), locationId: p.location_id, likeCount: p.like_count, commentCount: p.comment_count, createdAt: p.created_at }));
}
