import { fetchJson } from '../http';
import { serverConfig } from '../config';
import type { Category } from '../types';
import type { Candidate } from './candidate';

interface OsmEl {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number; lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

export async function overpass(query: string, timeoutMs = 70000): Promise<OsmEl[]> {
  const { overpassUrl } = serverConfig();
  const r = await fetchJson<{ elements: OsmEl[] }>(overpassUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }).toString(),
    provider: 'overpass',
    revalidate: 1800,
    timeoutMs,
    retries: 2,
  });
  return r.elements;
}

export function categoriesFromTags(t: Record<string, string>): Category[] {
  const c = new Set<Category>();
  if (t.tourism === 'viewpoint') c.add('landscape');
  if (t.natural === 'peak' || t.natural === 'volcano' || t.natural === 'glacier' || t.mountain_pass === 'yes') { c.add('mountains'); c.add('landscape'); }
  if (t.natural === 'waterfall' || t.waterway === 'waterfall') { c.add('waterfalls'); c.add('landscape'); }
  if (t.natural === 'water' || t.water === 'lake') { c.add('lakes'); c.add('landscape'); }
  if (t.natural === 'beach') { c.add('beaches'); c.add('coastlines'); }
  if (t.natural === 'cliff' || t.natural === 'cape' || t.natural === 'arch' || t.natural === 'bay' || t.natural === 'coastline') { c.add('coastlines'); c.add('landscape'); }
  if (t.man_made === 'lighthouse') { c.add('coastlines'); c.add('architecture'); c.add('night'); }
  if (t.natural === 'wood' || t.landuse === 'forest') c.add('forests');
  if (t.historic === 'castle' || t.historic === 'fort' || t.historic === 'monument' || t.building === 'cathedral') c.add('architecture');
  if (t.historic === 'ruins' || t.abandoned === 'yes' || t['abandoned:building'] || t.disused === 'yes') c.add('abandoned');
  if (t.man_made === 'bridge' || t.bridge === 'yes') { c.add('architecture'); c.add('cityscapes'); }
  if (t.leisure === 'nature_reserve' || t.boundary === 'protected_area') c.add('wildlife');
  if (t.man_made === 'tower' && t['tower:type'] === 'observation') { c.add('landscape'); c.add('cityscapes'); }
  if (t.place === 'square' || t.highway === 'pedestrian') c.add('street');
  if (t.natural === 'cave_entrance' || t.natural === 'rock' || t.natural === 'stone' || t.natural === 'valley' || t.natural === 'gorge') c.add('landscape');
  if (t.tourism === 'attraction' && c.size === 0) c.add('landscape');
  return [...c];
}

const POI_FILTERS = [
  'nwr["tourism"="viewpoint"]',
  'nwr["natural"="waterfall"]',
  'nwr["waterway"="waterfall"]',
  'node["natural"="peak"]["name"]',
  'node["natural"="volcano"]["name"]',
  'nwr["natural"="arch"]',
  'nwr["natural"="cliff"]["name"]',
  'nwr["natural"="beach"]["name"]',
  'nwr["natural"="cave_entrance"]["name"]',
  'nwr["man_made"="lighthouse"]',
  'nwr["man_made"="tower"]["tower:type"="observation"]',
  'nwr["historic"~"^(castle|fort|ruins)$"]["name"]',
  'nwr["abandoned:building"]["name"]',
  'nwr["natural"="water"]["water"="lake"]["name"]["wikidata"]',
];

function elToCandidate(el: OsmEl): Candidate | null {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) return null;
  const name = t['name:en'] || t.name || (t.tourism === 'viewpoint' ? 'Unnamed viewpoint' : null);
  if (!name) return null;
  const categories = categoriesFromTags(t);
  if (!categories.length) return null;
  const osmId = `${el.type}/${el.id}`;
  const commons = t.wikimedia_commons?.startsWith('File:') ? t.wikimedia_commons.slice(5) : t.image?.includes('commons.wikimedia.org/wiki/File:') ? decodeURIComponent(t.image.split('File:').pop()!) : undefined;
  const wp = t.wikipedia?.match(/^([a-z-]+):(.+)$/);
  return {
    name,
    lat, lng,
    categories,
    sources: [{ provider: 'osm', id: osmId, url: `https://www.openstreetmap.org/${osmId}` }],
    osmId,
    osmTags: t,
    wikidataId: /^Q\d+$/.test(t.wikidata ?? '') ? t.wikidata : undefined,
    commonsImage: commons,
    wikipediaTitle: wp?.[2],
    wikipediaLang: wp?.[1],
    description: t.description ?? null,
    confidence: name === 'Unnamed viewpoint' ? 0.45 : t.wikidata ? 0.8 : 0.6,
  };
}

/** Photographic POIs around a point (radius ≤ 50 km to stay polite to the public instance). */
export async function osmPoisAround(lat: number, lng: number, radiusKm: number, limit = 300): Promise<Candidate[]> {
  const r = Math.round(Math.min(radiusKm, 50) * 1000);
  const q = `[out:json][timeout:60];(${POI_FILTERS.map((f) => `${f}(around:${r},${lat},${lng});`).join('')});out center tags qt ${limit};`;
  return (await overpass(q)).map(elToCandidate).filter((c): c is Candidate => !!c);
}

export async function osmPoisInBox(s: number, w: number, n: number, e: number, limit = 400): Promise<Candidate[]> {
  const q = `[out:json][timeout:90][bbox:${s},${w},${n},${e}];(${POI_FILTERS.map((f) => `${f};`).join('')});out center tags qt ${limit};`;
  return (await overpass(q, 100000)).map(elToCandidate).filter((c): c is Candidate => !!c);
}

export async function osmById(osmId: string): Promise<Candidate | null> {
  const m = osmId.match(/^(node|way|relation)\/(\d+)$/);
  if (!m) return null;
  const els = await overpass(`[out:json][timeout:25];${m[1]}(${m[2]});out center tags;`);
  const el = els[0];
  if (!el) return null;
  const c = elToCandidate(el);
  if (c) return c;
  const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null || !el.tags?.name) return null;
  return { name: el.tags.name, lat, lng, categories: ['landscape'], sources: [{ provider: 'osm', id: osmId, url: `https://www.openstreetmap.org/${osmId}` }], osmId, osmTags: el.tags, confidence: 0.5 };
}

export interface OsmParking {
  osmId: string; name: string | null; lat: number; lng: number; tags: Record<string, string>;
}

export interface SiteContext {
  parking: OsmParking[];
  viewpoints: { osmId: string; name: string | null; lat: number; lng: number; direction: number | null }[];
  protectedAreas: { name: string; protectClass?: string; tags: Record<string, string> }[];
  hazards: string[];
}

function parseDirection(v?: string): number | null {
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n)) return ((n % 360) + 360) % 360;
  const map: Record<string, number> = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
  const range = v.match(/^(\d+)-(\d+)$/);
  if (range) { const a = +range[1], b = +range[2]; return (((a + ((b - a + 360) % 360) / 2) % 360) + 360) % 360; }
  return map[v.toUpperCase()] ?? null;
}

/** Parking, nearby viewpoints, enclosing protected areas & hazard tags — all from OSM, nothing invented. */
export async function siteContext(lat: number, lng: number, parkingRadiusM = 1500): Promise<SiteContext> {
  const q = `[out:json][timeout:40];
(
  nwr["amenity"="parking"](around:${parkingRadiusM},${lat},${lng});
  nwr["amenity"="motorcycle_parking"](around:${Math.min(parkingRadiusM, 800)},${lat},${lng});
)->.p;
.p out center tags;
nwr["tourism"="viewpoint"](around:1500,${lat},${lng});
out center tags;
is_in(${lat},${lng})->.a;
(area.a["boundary"="protected_area"]; area.a["boundary"="national_park"]; area.a["leisure"="nature_reserve"];);
out tags;
nwr["hazard"](around:800,${lat},${lng});
out tags qt 20;`;
  const els = await overpass(q, 45000);
  const ctx: SiteContext = { parking: [], viewpoints: [], protectedAreas: [], hazards: [] };
  for (const el of els) {
    const t = el.tags ?? {};
    const elat = el.lat ?? el.center?.lat, elng = el.lon ?? el.center?.lon;
    if ((t.amenity === 'parking' || t.amenity === 'motorcycle_parking') && elat != null && elng != null) {
      // Skip clearly private / customer-only lots
      ctx.parking.push({ osmId: `${el.type}/${el.id}`, name: t.name ?? null, lat: elat, lng: elng, tags: t });
    } else if (t.tourism === 'viewpoint' && elat != null && elng != null) {
      ctx.viewpoints.push({ osmId: `${el.type}/${el.id}`, name: t.name ?? null, lat: elat, lng: elng, direction: parseDirection(t.direction) });
    } else if ((el.type as string) === 'area' && (t.boundary || t.leisure) && t.name) {
      ctx.protectedAreas.push({ name: t.name, protectClass: t.protect_class, tags: t });
    } else if (t.hazard) {
      ctx.hazards.push(t.hazard.replace(/_/g, ' '));
    }
  }
  ctx.hazards = Array.from(new Set(ctx.hazards));
  return ctx;
}

export { parseDirection };
