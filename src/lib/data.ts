/** Browser-side replacements for the former /api/* routes. Every call goes to a real provider or the database. */
import { nearby, alongRoute, detail, search } from './repo';
import { geocode, reverseGeocode } from './providers/nominatim';
import { getElevations, getForecast, OPEN_METEO_ATTRIBUTION } from './weather/openMeteo';
import { dayOutlook } from './weather/conditions';
import { distanceToPolylineM, haversineKm, isValidCoord, parseCoordinates } from './geo';
import { CATEGORIES, CATEGORY_LABELS, type Category, type LocationSummary, type SortKey } from './types';

export { geocode, reverseGeocode, detail as getDetail };

export function getNearby(o: { lat: number; lng: number; radius?: number; cats?: Category[]; sort?: SortKey; limit?: number }) {
  return nearby({ lat: o.lat, lng: o.lng, radiusKm: Math.min(Math.max(o.radius ?? 25, 1), 250), categories: o.cats, sort: o.sort, limit: o.limit ?? 60 });
}

export async function getWeather(lat: number, lng: number, cats: string[] = []) {
  const forecast = await getForecast(lat, lng, 7);
  return { forecast, outlooks: forecast.daily.time.map((d) => dayOutlook(forecast, d, lat, lng, cats)), attribution: OPEN_METEO_ATTRIBUTION };
}

export async function getElevation(lat: number, lng: number) {
  const [e] = await getElevations([{ lat, lng }]);
  return e;
}

/** Spots along a route. Without a routing key (never exposed in the browser) the corridor follows straight segments. */
export async function findAlongRoute(points: { lat: number; lng: number }[], bufferKm: number, cats: Category[]) {
  const pts = points.filter((p) => isValidCoord(p.lat, p.lng));
  const line: [number, number][] = pts.map((p) => [p.lat, p.lng]);
  let spots: LocationSummary[] = await alongRoute(line, bufferKm, cats).catch(() => []);
  let mode = 'database';
  if (!spots.length) {
    mode = 'live';
    const totalKm = line.slice(1).reduce((s, p, i) => s + haversineKm({ lat: line[i][0], lng: line[i][1] }, { lat: p[0], lng: p[1] }), 0);
    const n = Math.min(6, Math.max(2, Math.ceil(totalKm / (bufferKm * 4))));
    // Interpolate samples evenly along the (straight) line
    const samples: [number, number][] = Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1), a = line[0], b = line[line.length - 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    });
    const res = await Promise.allSettled(samples.map(([lat, lng]) => nearby({ lat, lng, radiusKm: Math.min(bufferKm * 2, 50), categories: cats, limit: 25, withConditions: false })));
    const seen = new Set<string>();
    for (const r of res) if (r.status === 'fulfilled') for (const s of r.value.data) if (!seen.has(s.id)) { seen.add(s.id); spots.push(s); }
    const poly = line.map(([lat, lng]) => ({ lat, lng }));
    spots = spots.map((s) => ({ ...s, distanceKm: distanceToPolylineM(s, poly) / 1000 })).filter((s) => s.distanceKm! <= bufferKm).sort((a, b) => b.photoScore - a.photoScore);
  }
  return { line, routed: false, spots: spots.slice(0, 120), mode };
}

export async function unifiedSearch(q: string) {
  const query = q.trim().slice(0, 200);
  const coords = parseCoordinates(query);
  if (coords) return { coords, subject: null, spots: [] as LocationSummary[], places: [] as Awaited<ReturnType<typeof geocode>> };
  const lower = query.toLowerCase();
  const subject = CATEGORIES.find((c) => c === lower || CATEGORY_LABELS[c].toLowerCase() === lower) ?? null;
  const [spots, places] = await Promise.all([search(query).catch(() => ({ data: [] as LocationSummary[] })), geocode(query, 8).catch(() => [])]);
  return { coords: null, subject, spots: spots.data, places };
}
