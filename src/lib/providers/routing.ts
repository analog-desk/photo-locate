import { fetchJson } from '../http';
import { serverConfig } from '../config';

/** OpenRouteService foot-hiking routing (optional). Without a key, callers must fall back to *estimates*. */
export interface WalkRoute { distanceM: number; durationMin: number; ascentM: number | null; coords: [number, number][] }

export async function walkingRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<WalkRoute | null> {
  const key = serverConfig().orsKey;
  if (!key) return null;
  try {
    const r = await fetchJson<any>('https://api.openrouteservice.org/v2/directions/foot-hiking/geojson', {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [[from.lng, from.lat], [to.lng, to.lat]], elevation: true }),
      provider: 'openrouteservice', revalidate: 86400 * 7, retries: 1,
    });
    const f = r.features?.[0];
    if (!f) return null;
    return {
      distanceM: f.properties.summary.distance,
      durationMin: Math.round(f.properties.summary.duration / 60),
      ascentM: f.properties.ascent ?? null,
      coords: f.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]),
    };
  } catch {
    return null;
  }
}

/** Driving route geometry for "spots along my route" (ORS driving-car). */
export async function drivingRoute(points: { lat: number; lng: number }[]): Promise<[number, number][] | null> {
  const key = serverConfig().orsKey;
  if (!key || points.length < 2) return null;
  const r = await fetchJson<any>('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates: points.map((p) => [p.lng, p.lat]) }),
    provider: 'openrouteservice', retries: 1,
  });
  return r.features?.[0]?.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]) ?? null;
}
