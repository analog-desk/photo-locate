import type { SupabaseClient } from '@supabase/supabase-js';
import { wikidataBox, wikidataById } from '../providers/wikidata';
import { osmById } from '../providers/overpass';
import { liveCandidates } from '../repo/live';
import { dedupeCandidates } from '../dedupe';
import { enrichCandidate } from '../enrich';
import { webcamsNearby } from '../providers/webcams';
import { imageAlive } from '../providers/commons';
import { momentum } from '../providers/pageviews';
import { haversineKm, haversineM, isValidCoord } from '../geo';
import { astroNight, moonDay, sunDay, todayIn } from '../astro';
import { dayOutlook } from '../weather/conditions';
import { fetchJson } from '../http';
import { serverConfig } from '../config';
import { rowToCandidate, upsertCandidate } from './persist';
import { communityPhotoRef } from './community';

export interface Job { id: number; cycle_id: number | null; kind: string; payload: any; attempts: number }
type Handler = (sb: SupabaseClient, job: Job) => Promise<Record<string, unknown>>;

async function enqueue(sb: SupabaseClient, cycleId: number | null, kind: string, payload: object, priority = 5) {
  await sb.from('jobs').insert({ cycle_id: cycleId, kind, payload, priority });
}

// ─── 1-2. Discover locations in a grid region (Wikidata, notable sites) ──────
const discoverRegion: Handler = async (sb, job) => {
  const { data: region } = await sb.from('discovery_regions').select('*').eq('id', job.payload.regionId).single();
  if (!region) return { skipped: 'region missing' };
  let cands;
  try {
    cands = await wikidataBox(region.south, region.west, region.north, region.east, 250);
  } catch (e) {
    // Dense regions can time out on the public SPARQL endpoint → split into quadrants and retry later.
    if (region.depth < 3) {
      const mLat = (region.south + region.north) / 2, mLng = (region.west + region.east) / 2;
      const quads = [[region.south, region.west, mLat, mLng], [region.south, mLng, mLat, region.east], [mLat, region.west, region.north, mLng], [mLat, mLng, region.north, region.east]];
      const { data: kids } = await sb.from('discovery_regions').upsert(
        quads.map(([s, w, n, ea]) => ({ south: s, west: w, north: n, east: ea, depth: region.depth + 1, priority: region.priority + 0.5, reason: 'split' })),
        { onConflict: 'south,west,north,east' }).select('id');
      for (const k of kids ?? []) await enqueue(sb, job.cycle_id, 'discover_region', { regionId: k.id }, 3);
      await sb.from('discovery_regions').update({ last_scanned_at: new Date().toISOString(), candidates_found: -1 }).eq('id', region.id);
      return { split: true, children: kids?.length ?? 0 };
    }
    throw e;
  }
  const stats = await persistBatch(sb, dedupeCandidates(cands), job);
  await sb.from('discovery_regions').update({
    last_scanned_at: new Date().toISOString(), candidates_found: cands.length,
    priority: cands.length === 0 ? Math.max(0.1, region.priority * 0.5) : region.priority,
  }).eq('id', region.id);
  return { found: cands.length, ...stats };
};

// ─── 3. Discover around a point (Wikidata + OSM: hidden viewpoints, waterfalls…) ──
const discoverAround: Handler = async (sb, job) => {
  const { lat, lng, radiusKm = 10, reason } = job.payload;
  if (!isValidCoord(lat, lng)) return { skipped: 'bad coords' };
  const cands = await liveCandidates(lat, lng, Math.min(radiusKm, 50));
  const stats = await persistBatch(sb, cands, job);
  if (reason === 'demand') {
    await sb.from('search_demand').update({ last_discovered_at: new Date().toISOString() }).eq('cell', `${Math.floor(lat)}:${Math.floor(lng)}`);
  }
  return { found: cands.length, ...stats };
};

async function persistBatch(sb: SupabaseClient, cands: Awaited<ReturnType<typeof liveCandidates>>, job: Job) {
  let created = 0, merged = 0, skipped = 0;
  const reasons: Record<string, number> = {};
  for (const c of cands) {
    const r = await upsertCandidate(sb, c, job.id);
    if (r.action === 'created') {
      created++;
      await enqueue(sb, job.cycle_id, 'refresh_location', { locationId: r.id }, 4);
    } else if (r.action === 'merged') merged++;
    else { skipped++; reasons[r.reason ?? '?'] = (reasons[r.reason ?? '?'] ?? 0) + 1; }
  }
  return { created, merged, skipped, reasons };
}

// ─── 4-12. Refresh one location end-to-end ─────────────────────────────────
const refreshLocation: Handler = async (sb, job) => {
  const { data: row } = await sb.from('locations').select('*').eq('id', job.payload.locationId).single();
  // User-requested spots arrive as pending_review and are published only after this validation.
  const requested = row?.status === 'pending_review' && row.created_by && !row.last_refreshed_at;
  if (!row || (row.status !== 'active' && !requested)) return { skipped: 'inactive' };
  const changed: string[] = [];
  const diff: Record<string, unknown> = {};

  // 7. Re-validate GPS & identity against the source of truth
  let cand = rowToCandidate(row);
  const fresh = row.wikidata_id ? await wikidataById(row.wikidata_id).catch(() => undefined)
    : row.osm_id ? await osmById(row.osm_id).catch(() => undefined) : undefined;
  if (fresh === undefined && requested) throw new Error('source lookup failed; will retry before publishing a user-requested spot');
  if (fresh === null && requested) {
    await sb.from('locations').update({ status: 'rejected' }).eq('id', row.id);
    return { rejected: 'requested source does not resolve' };
  }
  if (fresh === null) {
    // Source deleted upstream → lower confidence, flag for review rather than silently deleting.
    const conf = Math.max(0, row.confidence - 0.2);
    await sb.from('locations').update({ confidence: conf, status: conf < 0.3 ? 'pending_review' : 'active' }).eq('id', row.id);
    await sb.from('location_updates').insert({ location_id: row.id, job_id: job.id, action: 'flagged', changed_fields: ['confidence'], diff: { reason: 'source no longer resolves' } });
    return { flagged: true };
  }
  if (fresh) {
    const moved = haversineM(row, fresh);
    // Trust the source for user-requested rows; for established rows ignore implausible jumps (likely upstream vandalism).
    const accept = isValidCoord(fresh.lat, fresh.lng) && (requested || moved < 5000);
    if (moved > 5 && accept) { changed.push('lat', 'lng'); diff.moved_m = Math.round(moved); }
    cand = { ...cand, lat: accept ? fresh.lat : cand.lat, lng: accept ? fresh.lng : cand.lng, name: fresh.name || cand.name,
      osmTags: fresh.osmTags ?? cand.osmTags, commonsImage: fresh.commonsImage ?? cand.commonsImage, sitelinks: fresh.sitelinks ?? cand.sitelinks,
      wikipediaTitle: fresh.wikipediaTitle ?? cand.wikipediaTitle, categories: Array.from(new Set([...cand.categories, ...fresh.categories])) };
  }

  const { data: comm } = await sb.from('photos_public').select('*').eq('location_id', row.id).eq('moderation_status', 'approved').limit(40);
  const { detail, forecast, pageviews, flickrRecent } = await enrichCandidate(cand, { communityPhotos: (comm ?? []).map(communityPhotoRef) });
  const now = new Date().toISOString();

  // 8. Parking/access (OSM) — replace OSM-sourced rows wholesale so removed lots disappear
  await sb.from('parking_locations').delete().eq('location_id', row.id);
  if (detail.parking.length) {
    await sb.from('parking_locations').insert(detail.parking.map((p) => ({
      location_id: row.id, osm_id: p.id, name: p.name, lat: p.lat, lng: p.lng, fee: p.fee, capacity: p.capacity, access: p.access,
      surface: p.surface, distance_to_spot_m: p.distanceToSpotM, walking_distance: p.walkingDistanceM, walking_time: p.walkingTimeMin, route: p.route, updated_at: now,
    })));
  }
  await sb.from('viewpoints').delete().eq('location_id', row.id).eq('source_provider', 'osm');
  if (detail.viewpoints.length) {
    await sb.from('viewpoints').upsert(detail.viewpoints.map((v) => ({
      location_id: row.id, name: v.name, lat: v.lat, lng: v.lng, direction: v.direction, elevation_m: v.elevation != null ? Math.round(v.elevation) : null,
      source_provider: 'osm', source_id: v.id, updated_at: now,
    })), { onConflict: 'location_id,source_provider,source_id' });
  }

  // 4. Community / licensed photographs (new ones are a popularity signal)
  const ext = detail.photos.filter((p) => p.provider !== 'community');
  let newPhotos = 0;
  if (ext.length) {
    const { data: existing } = await sb.from('external_photos').select('external_id').eq('location_id', row.id);
    const known = new Set((existing ?? []).map((e: any) => e.external_id));
    newPhotos = ext.filter((p) => !known.has(p.id)).length;
    await sb.from('external_photos').upsert(ext.map((p) => ({
      location_id: row.id, provider: p.provider, external_id: p.id, data: p, taken_at: p.takenAt ?? null,
      light_phase: p.lightPhase ?? null, season: p.season ?? null, alive: true, checked_at: now,
    })), { onConflict: 'location_id,provider,external_id' });
  }

  // 9 & 11. Weather + astronomy for the coming week
  if (forecast) {
    const today = todayIn(forecast.timezone);
    const outlook = dayOutlook(forecast, today, cand.lat, cand.lng, cand.categories);
    await sb.from('weather_observations').insert({
      location_id: row.id, current: forecast.current, daily: forecast.daily, conditions: detail.conditions, insights: outlook.insights,
    });
    const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(today + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10));
    await sb.from('astro_calculations').upsert(days.map((d) => ({
      location_id: row.id, date: d,
      sun: sunDay(d, cand.lat, cand.lng, forecast.timezone, detail.elevation.value ?? 0),
      moon: moonDay(d, cand.lat, cand.lng, forecast.timezone),
      night: astroNight(d, cand.lat, cand.lng, forecast.timezone, 15),
      computed_at: now,
    })), { onConflict: 'location_id,date' });
  }

  // 10. Webcams
  let webcams = 0;
  const cams = await webcamsNearby(cand.lat, cand.lng, 30, 8).catch(() => null);
  if (cams) {
    await sb.from('location_webcams').delete().eq('location_id', row.id);
    for (const w of cams) {
      if (!isValidCoord(w.lat, w.lng)) continue;
      const { data: ws } = await sb.from('webcam_sources').upsert({
        provider: 'windy', external_id: w.id, title: w.title, lat: w.lat, lng: w.lng, status: w.status,
        last_updated_on: w.lastUpdatedOn, stale: w.stale, preview_url: w.previewUrl, thumbnail_url: w.thumbnailUrl,
        player_day_url: w.playerDayUrl, player_live_url: w.playerLiveUrl, page_url: w.pageUrl, categories: w.categories, checked_at: now,
      }, { onConflict: 'provider,external_id' }).select('id').single();
      if (ws) { await sb.from('location_webcams').upsert({ location_id: row.id, webcam_id: ws.id, distance_km: haversineKm(cand, w) }); webcams++; }
    }
  }

  // Popularity history + momentum (identifies spots gaining popularity)
  const mom = momentum(pageviews);
  const avgViews = pageviews.length ? pageviews.slice(-30).reduce((s, x) => s + x.views, 0) / Math.min(30, pageviews.length) : null;
  const photoMomentum = flickrRecent != null && flickrRecent > 0 ? Math.min(2, 1 + flickrRecent / 50) : 1;
  const trending = Math.round(mom.ratio * photoMomentum * (newPhotos > 0 ? 1 + Math.min(newPhotos, 10) / 40 : 1) * 100) / 100;
  await sb.from('popularity_history').upsert({
    location_id: row.id, observed_on: now.slice(0, 10), pageviews_avg: avgViews, photo_count: detail.photos.length,
    flickr_recent: flickrRecent, popularity_score: detail.popularityScore, photo_score: detail.photoScore,
  }, { onConflict: 'location_id,observed_on' });

  const patch: Record<string, unknown> = {
    name: cand.name, lat: cand.lat, lng: cand.lng,
    country: detail.country, region: detail.region, nearest_town: detail.nearestTown, timezone: detail.timezone,
    elevation_m: detail.elevation.value, description: detail.description, description_source_url: detail.wikipediaUrl,
    categories: detail.categories, osm_tags: cand.osmTags ?? null, hero_image: detail.heroImage,
    photo_score: detail.photoScore, popularity_score: detail.popularityScore, scenic_score: detail.scenicScore,
    score_breakdown: detail.scoreBreakdown, conditions: detail.conditions, best_months: detail.bestMonths,
    access: detail.access, focal_hints: detail.focalHints, hidden_gem: detail.hiddenGem, photo_count: detail.photos.length,
    trending_ratio: pageviews.length >= 14 || flickrRecent != null ? trending : null,
    confidence: Math.min(1, Math.max(row.confidence, cand.confidence)),
    last_refreshed_at: now, last_photos_at: now, last_parking_at: now,
    ...(requested ? { status: 'active' } : {}),
    ...(forecast ? { last_weather_at: now } : {}), ...(cams ? { last_webcams_at: now } : {}),
  };
  if (row.name === 'Unnamed viewpoint' && detail.nearestTown) patch.name = `Viewpoint near ${detail.nearestTown}`;
  for (const k of ['photo_score', 'popularity_score', 'elevation_m', 'nearest_town', 'hidden_gem', 'name'] as const) {
    if (row[k] !== patch[k]) { changed.push(k); diff[k] = { from: row[k], to: patch[k] }; }
  }
  const { error } = await sb.from('locations').update(patch).eq('id', row.id);
  if (error) throw new Error(error.message);
  await sb.from('location_updates').insert({ location_id: row.id, job_id: job.id, action: 'refreshed', changed_fields: changed, diff });
  return { photos: detail.photos.length, newPhotos, parking: detail.parking.length, webcams, score: detail.photoScore, changed };
};

// ─── Webcam expiry detection ──────────────────────────────────────────────
const checkWebcams: Handler = async (sb) => {
  const key = serverConfig().windyKey;
  if (!key) return { skipped: 'no windy key' };
  const { data: cams } = await sb.from('webcam_sources').select('id, external_id').lt('checked_at', new Date(Date.now() - 12 * 3600_000).toISOString()).limit(100);
  let stale = 0, removed = 0;
  for (const c of cams ?? []) {
    try {
      const w = await fetchJson<any>(`https://api.windy.com/webcams/api/v3/webcams/${c.external_id}?include=images,player`, { headers: { 'x-windy-api-key': key }, provider: 'windy', retries: 1 });
      const last = w.lastUpdatedOn ?? null;
      const isStale = !last || Date.now() - Date.parse(last) > 6 * 3600_000 || w.status !== 'active';
      if (isStale) stale++;
      await sb.from('webcam_sources').update({ status: w.status, last_updated_on: last, stale: isStale, preview_url: w.images?.current?.preview ?? null, checked_at: new Date().toISOString() }).eq('id', c.id);
    } catch (e: any) {
      if (e?.status === 404) { removed++; await sb.from('webcam_sources').update({ status: 'removed', stale: true, checked_at: new Date().toISOString() }).eq('id', c.id); }
    }
  }
  return { checked: cams?.length ?? 0, stale, removed };
};

// ─── Broken image detection ───────────────────────────────────────────────
const checkImages: Handler = async (sb) => {
  const { data: photos } = await sb.from('external_photos').select('id, data').eq('alive', true).order('checked_at').limit(150);
  let broken = 0;
  for (const p of photos ?? []) {
    const ok = await imageAlive((p.data as any).thumbUrl);
    if (!ok) broken++;
    await sb.from('external_photos').update({ alive: ok, checked_at: new Date().toISOString() }).eq('id', p.id);
  }
  // Clear hero images that died
  const { data: locs } = await sb.from('locations').select('id, hero_image').not('hero_image', 'is', null).order('last_refreshed_at', { ascending: true, nullsFirst: true }).limit(50);
  let heroes = 0;
  for (const l of locs ?? []) {
    if (!(await imageAlive((l.hero_image as any).thumbUrl))) { heroes++; await sb.from('locations').update({ hero_image: null }).eq('id', l.id); }
  }
  return { checked: photos?.length ?? 0, broken, heroesCleared: heroes };
};

// ─── Trending: combine provider momentum with in-app engagement ───────────
const computeTrending: Handler = async (sb) => {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [{ data: ph }, { data: rt }, { data: fav }] = await Promise.all([
    sb.from('photos').select('location_id').eq('moderation_status', 'approved').gte('created_at', since).not('location_id', 'is', null),
    sb.from('ratings').select('location_id').gte('created_at', since),
    sb.from('location_favorites').select('location_id').gte('created_at', since),
  ]);
  const counts = new Map<string, number>();
  for (const r of [...(ph ?? []), ...(rt ?? []), ...(fav ?? [])]) counts.set(r.location_id, (counts.get(r.location_id) ?? 0) + 1);
  for (const [id, n] of counts) {
    const { data: l } = await sb.from('locations').select('trending_ratio').eq('id', id).single();
    await sb.from('locations').update({ trending_ratio: Math.round(((l?.trending_ratio ?? 1) + Math.min(1, n / 10)) * 100) / 100 }).eq('id', id);
    await sb.from('popularity_history').upsert({ location_id: id, observed_on: new Date().toISOString().slice(0, 10), community_events: n }, { onConflict: 'location_id,observed_on' });
  }
  return { engagedLocations: counts.size };
};

// ─── Notifications for upcoming ideal conditions ──────────────────────────
const evaluateAlerts: Handler = async (sb) => {
  const { data: rules } = await sb.from('alert_rules').select('id, user_id, kind, min_score, location_id, locations(name, conditions, slug)').eq('active', true).limit(5000);
  let sent = 0;
  for (const r of (rules ?? []) as any[]) {
    const c = r.locations?.conditions;
    if (!c) continue;
    const key = r.kind === 'fog' ? null : r.kind;
    const score = key ? c[key] : null;
    if (score == null || score < r.min_score) continue;
    const day = (c.computedAt ?? new Date().toISOString()).slice(0, 10);
    const { error } = await sb.from('notifications').insert({
      user_id: r.user_id, kind: `conditions.${r.kind}`, location_id: r.location_id,
      title: `${r.kind[0].toUpperCase() + r.kind.slice(1)} potential ${score}/100 at ${r.locations.name}`,
      body: 'Forecast-based indicator, not a guarantee. Check the latest forecast before you go.',
      data: { slug: r.locations.slug, score }, dedupe_key: `${r.id}:${day}`,
    });
    if (!error) sent++;
  }
  return { rules: rules?.length ?? 0, sent };
};

export const HANDLERS: Record<string, Handler> = {
  discover_region: discoverRegion,
  discover_around: discoverAround,
  refresh_location: refreshLocation,
  check_webcams: checkWebcams,
  check_images: checkImages,
  compute_trending: computeTrending,
  evaluate_alerts: evaluateAlerts,
};
