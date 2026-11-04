import type { Candidate } from './providers/candidate';
import type { AccessInfo, ConditionScores, LocationDetail, LocationSummary, Parking, PhotoRef, Sourced, Viewpoint } from './types';
import { siteContext, parseDirection } from './providers/overpass';
import { commonsFiles, commonsNearby } from './providers/commons';
import { flickrNearby } from './providers/flickr';
import { wikipediaSummary } from './providers/wikidata';
import { reverseGeocode } from './providers/nominatim';
import { dailyPageviews } from './providers/pageviews';
import { walkingRoute } from './providers/routing';
import { getElevations, getForecast, type Forecast } from './weather/openMeteo';
import { dayOutlook } from './weather/conditions';
import { haversineM, estimateWalkMinutes } from './geo';
import { sunDay, todayIn } from './astro';
import { bestMonths, seasonalRelevance } from './seasonal';
import { isHiddenGem, photoScore, popularityScore, scenicScore, type ScoreInputs } from './scoring';

const unverified = <T,>(note?: string): Sourced<T> => ({ value: null, verified: false, source: note });
const osmSourced = <T,>(value: T, osmId?: string): Sourced<T> => ({
  value, verified: true, source: 'OpenStreetMap', sourceUrl: osmId ? `https://www.openstreetmap.org/${osmId}` : undefined,
});

export function liveId(c: Pick<Candidate, 'wikidataId' | 'osmId'>): string {
  if (c.wikidataId) return `wd-${c.wikidataId}`;
  if (c.osmId) return `osm-${c.osmId.replace('/', '-')}`;
  throw new Error('candidate without stable external id');
}

export function parseLiveId(id: string): { wikidataId?: string; osmId?: string } | null {
  const wd = id.match(/^wd-(Q\d+)$/);
  if (wd) return { wikidataId: wd[1] };
  const osm = id.match(/^osm-(node|way|relation)-(\d+)$/);
  if (osm) return { osmId: `${osm[1]}/${osm[2]}` };
  return null;
}

/** Conditions for the *next* sunrise & sunset and tonight's darkness. */
export function nextConditions(f: Forecast, lat: number, lng: number, categories: string[] = []): ConditionScores {
  const now = Date.now();
  const today = todayIn(f.timezone);
  const tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  const o1 = dayOutlook(f, today, lat, lng, categories);
  const o2 = dayOutlook(f, tomorrow, lat, lng, categories);
  const pick = (a: { time: string | null; score: number | null }, b: { time: string | null; score: number | null }) =>
    a.time && Date.parse(a.time) > now ? a.score : b.score;
  const sunrise = pick(o1.sunrise, o2.sunrise);
  const sunset = pick(o1.sunset, o2.sunset);
  const golden = sunrise != null || sunset != null ? Math.max(sunrise ?? 0, sunset ?? 0) : null;
  return { sunrise, sunset, golden, blue: o1.blueEvening, astro: o1.astro.score, computedAt: new Date().toISOString() };
}

export function quickSummary(c: Candidate, extra: Partial<ScoreInputs> & { conditions?: ConditionScores | null } = {}): LocationSummary {
  const inputs: ScoreInputs = {
    categories: c.categories, sitelinks: c.sitelinks, hasImage: !!c.commonsImage, photoCount: c.commonsImage ? 1 : 0,
    distinctPhotographers: 0, isViewpoint: c.osmTags?.tourism === 'viewpoint', viewpointCount: 0, nearestParkingM: null,
    difficulty: c.osmTags?.sac_scale ?? null, conditions: extra.conditions ?? null,
    seasonal: seasonalRelevance(bestMonths(c.categories, c.lat, c.lng)),
    viewDirection: parseDirection(c.osmTags?.direction), ...extra,
  };
  const { score } = photoScore(inputs);
  const scenic = scenicScore(inputs), pop = popularityScore(inputs);
  const hidden = isHiddenGem(scenic, pop);
  const id = liveId(c);
  return {
    id, slug: id, name: c.name, lat: c.lat, lng: c.lng,
    country: c.country ?? null, region: null, nearestTown: null,
    categories: hidden ? Array.from(new Set([...c.categories, 'hidden-gem' as const])) : c.categories,
    heroImage: c.commonsImage ? {
      id: `commons:File:${c.commonsImage}`,
      url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(c.commonsImage)}?width=1200`,
      thumbUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(c.commonsImage)}?width=640`,
      author: 'See Wikimedia Commons', license: 'See source', provider: 'commons',
      sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(c.commonsImage)}`,
    } : null,
    photoScore: score, popularityScore: pop, scenicScore: scenic,
    conditions: extra.conditions ?? null, hiddenGem: hidden,
    communityRating: null, ratingCount: 0, discoveredAt: null, updatedAt: new Date().toISOString(),
    confidence: c.confidence, sources: c.sources,
  };
}

function settle<T>(p: Promise<T>): Promise<T | null> { return p.catch(() => null); }

function accessFromTags(t: Record<string, string>, osmId: string | undefined, protectedAreas: { name: string; protectClass?: string }[], hazards: string[], cats: string[]): AccessInfo {
  const val = (k: string) => (t[k] ? osmSourced(t[k], osmId) : unverified<string>());
  const privateProperty = ['private', 'no'].includes(t.access ?? '') || t['access:conditional'] != null && /private/.test(t['access:conditional']);
  const safety: string[] = [];
  if (privateProperty) safety.push('OpenStreetMap marks this site as private / no public access. Do not enter without permission.');
  if (t.sac_scale) safety.push(`Trail difficulty (SAC scale): ${t.sac_scale.replace(/_/g, ' ')}. Assess your experience and equipment.`);
  if (cats.includes('coastlines') || cats.includes('beaches')) safety.push('Check tide times and swell; never turn your back on the sea near cliffs or rocks.');
  if (cats.includes('waterfalls')) safety.push('Rocks near waterfalls are often slippery; stay on marked paths.');
  if (cats.includes('mountains')) safety.push('Mountain weather changes quickly. Carry layers, light and navigation for pre-dawn or post-dusk shoots.');
  if (cats.includes('abandoned')) safety.push('Abandoned structures may be unsafe or legally off-limits. Only photograph from public land unless you have permission.');
  for (const h of hazards) safety.push(`OSM hazard noted nearby: ${h}.`);
  const pa = protectedAreas[0];
  return {
    openingHours: val('opening_hours'),
    fee: val('fee'),
    access: val('access'),
    wheelchair: val('wheelchair'),
    hikingDifficulty: t.sac_scale ? osmSourced(t.sac_scale, osmId) : unverified(),
    privateProperty,
    protectedArea: pa ? { value: pa.name + (pa.protectClass ? ` (IUCN/protect class ${pa.protectClass})` : ''), verified: true, source: 'OpenStreetMap' } : unverified(),
    droneRestriction: pa
      ? { value: 'Inside a protected area — drone flights are frequently prohibited. Verify with the park authority and your national aviation authority.', verified: false, source: 'Inferred from protected-area boundary' }
      : unverified('Check your national aviation authority’s airspace map before flying.'),
    safetyNotes: safety,
  };
}

function focalHints(photos: PhotoRef[]) {
  const buckets: Record<string, number> = {};
  for (const p of photos) {
    const f = p.focalLength;
    if (!f) continue;
    const label = f < 20 ? 'Ultra-wide (<20mm)' : f < 35 ? 'Wide (20–35mm)' : f < 85 ? 'Standard (35–85mm)' : f < 200 ? 'Telephoto (85–200mm)' : 'Super-tele (200mm+)';
    buckets[label] = (buckets[label] ?? 0) + 1;
  }
  return Object.entries(buckets).map(([focal, count]) => ({ focal, count })).sort((a, b) => b.count - a.count);
}

export interface EnrichResult {
  detail: LocationDetail;
  forecast: Forecast | null;
  pageviews: { date: string; views: number }[];
  flickrRecent: number | null;
}

/** Full enrichment from real sources. Missing data stays null/unverified — never invented. */
export async function enrichCandidate(c: Candidate, opts: { communityPhotos?: PhotoRef[] } = {}): Promise<EnrichResult> {
  const [ctx, elev, forecast, nearby, hero, flickr, wiki, place, views] = await Promise.all([
    settle(siteContext(c.lat, c.lng)),
    settle(getElevations([{ lat: c.lat, lng: c.lng }])),
    settle(getForecast(c.lat, c.lng)),
    settle(commonsNearby(c.lat, c.lng, 600, 40)),
    c.commonsImage ? settle(commonsFiles([c.commonsImage])) : Promise.resolve(null),
    settle(flickrNearby(c.lat, c.lng, 0.8)),
    c.wikipediaTitle ? settle(wikipediaSummary(c.wikipediaTitle, c.wikipediaLang ?? 'en')) : Promise.resolve(null),
    settle(reverseGeocode(c.lat, c.lng)),
    c.wikipediaTitle && (c.wikipediaLang ?? 'en') === 'en' ? settle(dailyPageviews(c.wikipediaTitle)) : Promise.resolve([]),
  ]);

  const photos: PhotoRef[] = [];
  const seen = new Set<string>();
  for (const p of [...(opts.communityPhotos ?? []), ...(hero ?? []), ...(nearby ?? []), ...(flickr?.photos ?? [])]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id); photos.push(p);
  }

  const tz = forecast?.timezone ?? null;
  const sd = sunDay(todayIn(tz), c.lat, c.lng, tz);

  // Parking: real OSM lots only. Walking figures are ORS-routed when configured, otherwise labelled estimates.
  const lots = (ctx?.parking ?? [])
    .filter((p) => !['private', 'customers', 'no'].includes(p.tags.access ?? ''))
    .map((p) => ({ ...p, d: haversineM(c, p) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  const routes = await Promise.all(lots.slice(0, 3).map((p) => walkingRoute(p, c)));
  const parking: Parking[] = lots.map((p, i) => {
    const r = routes[i] ?? null;
    const t = p.tags;
    return {
      id: p.osmId, name: p.name, lat: p.lat, lng: p.lng,
      fee: t.fee ? osmSourced(t.fee + (t.charge ? ` (${t.charge})` : ''), p.osmId) : unverified('Fee not recorded in OpenStreetMap'),
      capacity: t.capacity && !isNaN(+t.capacity) ? osmSourced(+t.capacity, p.osmId) : unverified(),
      access: t.access ? osmSourced(t.access, p.osmId) : unverified(),
      surface: t.surface ?? null,
      distanceToSpotM: Math.round(p.d),
      walkingDistanceM: r ? { value: Math.round(r.distanceM), verified: true, source: 'OpenRouteService (foot-hiking)' } : { value: Math.round(p.d * 1.3), verified: false, source: 'Estimate: straight line × 1.3' },
      walkingTimeMin: r ? { value: r.durationMin, verified: true, source: 'OpenRouteService (foot-hiking)' } : { value: estimateWalkMinutes(p.d), verified: false, source: 'Estimate at 2.8 mph' },
      route: r?.coords ?? null,
      source: { provider: 'osm', id: p.osmId, url: `https://www.openstreetmap.org/${p.osmId}` },
    };
  });

  const vpEl = ctx?.viewpoints.length ? await settle(getElevations(ctx.viewpoints.slice(0, 10))) : null;
  const viewpoints: Viewpoint[] = (ctx?.viewpoints ?? []).slice(0, 10).map((v, i) => ({
    id: v.osmId, name: v.name, lat: v.lat, lng: v.lng, direction: v.direction, elevation: vpEl?.[i] ?? null,
    source: { provider: 'osm', id: v.osmId, url: `https://www.openstreetmap.org/${v.osmId}` },
  }));

  const conditions = forecast ? nextConditions(forecast, c.lat, c.lng, c.categories) : null;
  const best = bestMonths(c.categories, c.lat, c.lng);
  const avgViews = views && views.length ? views.slice(-30).reduce((s, x) => s + x.views, 0) / Math.min(30, views.length) : null;
  const authors = new Set(photos.map((p) => p.author));
  const inputs: ScoreInputs = {
    categories: c.categories, sitelinks: c.sitelinks, hasImage: photos.length > 0,
    photoCount: (nearby?.length ?? 0) + (flickr?.total ?? 0) + (opts.communityPhotos?.length ?? 0),
    distinctPhotographers: authors.size, avgDailyViews: avgViews,
    isViewpoint: c.osmTags?.tourism === 'viewpoint', viewpointCount: viewpoints.length,
    nearestParkingM: parking[0]?.distanceToSpotM ?? null, difficulty: c.osmTags?.sac_scale ?? null,
    conditions, seasonal: seasonalRelevance(best),
    viewDirection: parseDirection(c.osmTags?.direction) ?? viewpoints.find((v) => v.direction != null)?.direction ?? null,
    sunriseAzimuth: sd.sunriseAzimuth, sunsetAzimuth: sd.sunsetAzimuth,
  };
  const { score, breakdown } = photoScore(inputs);
  const scenic = scenicScore(inputs), pop = popularityScore(inputs);
  const hidden = isHiddenGem(scenic, pop);
  const id = liveId(c);
  const desc = wiki?.text ?? c.description ?? null;

  const detail: LocationDetail = {
    id, slug: id, name: c.name, lat: c.lat, lng: c.lng,
    country: place?.country ?? c.country ?? null, region: place?.region ?? null, nearestTown: place?.town ?? null,
    categories: hidden ? Array.from(new Set([...c.categories, 'hidden-gem' as const])) : c.categories,
    heroImage: photos[0] ?? null,
    photoScore: score, popularityScore: pop, scenicScore: scenic, conditions, hiddenGem: hidden,
    communityRating: null, ratingCount: 0, discoveredAt: null, updatedAt: new Date().toISOString(),
    confidence: c.confidence, sources: c.sources,
    description: desc,
    descriptionSource: wiki ? { provider: 'wikidata', id: c.wikipediaTitle!, url: wiki.url } : undefined,
    elevation: elev?.[0] != null ? { value: Math.round(elev[0]), verified: true, source: 'Copernicus DEM via Open-Meteo' } : unverified(),
    timezone: tz,
    wikipediaUrl: wiki?.url ?? null,
    bestMonths: best,
    viewpoints, parking,
    access: accessFromTags(c.osmTags ?? {}, c.osmId, ctx?.protectedAreas ?? [], ctx?.hazards ?? [], c.categories),
    photos,
    scoreBreakdown: breakdown,
    focalHints: focalHints(photos),
    osmTags: c.osmTags,
  };
  return { detail, forecast, pageviews: views ?? [], flickrRecent: flickr?.recentTotal ?? null };
}
