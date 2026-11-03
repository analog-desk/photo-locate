import type { GeoPoint } from './types';

const R = 6371008.8; // mean Earth radius, metres
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function isValidCoord(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    // (0,0) "Null Island" is almost always a geocoding error
    !(Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6)
  );
}

export function haversineM(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export const haversineKm = (a: GeoPoint, b: GeoPoint) => haversineM(a, b) / 1000;

/** Initial bearing from a to b, degrees clockwise from north. */
export function bearing(a: GeoPoint, b: GeoPoint): number {
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat), Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point at distance (m) along bearing (deg) from origin. */
export function destination(o: GeoPoint, distM: number, bearingDeg: number): GeoPoint {
  const δ = distM / R, θ = toRad(bearingDeg), φ1 = toRad(o.lat), λ1 = toRad(o.lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDeg(φ2), lng: ((toDeg(λ2) + 540) % 360) - 180 };
}

export function bboxAround(p: GeoPoint, radiusKm: number): [number, number, number, number] {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.01, Math.cos(toRad(p.lat))));
  return [Math.max(-90, p.lat - dLat), Math.max(-180, p.lng - dLng), Math.min(90, p.lat + dLat), Math.min(180, p.lng + dLng)];
}

/** Minimum distance (m) from point p to a polyline (approximate, equirectangular per segment). */
export function distanceToPolylineM(p: GeoPoint, line: GeoPoint[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return haversineM(p, line[0]);
  let best = Infinity;
  const k = Math.cos(toRad(p.lat));
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const ax = (a.lng - p.lng) * k, ay = a.lat - p.lat;
    const bx = (b.lng - p.lng) * k, by = b.lat - p.lat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const proj = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
    best = Math.min(best, haversineM(p, proj));
  }
  return best;
}

/** Parse "lat, lng" or "47.1N 8.2E" style coordinate strings. */
export function parseCoordinates(input: string): GeoPoint | null {
  const s = input.trim().toUpperCase();
  const dec = s.match(/^(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])?[\s,;]+(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])?$/);
  if (!dec) return null;
  let lat = parseFloat(dec[1]);
  let lng = parseFloat(dec[3]);
  if (dec[2] === 'S') lat = -Math.abs(lat);
  if (dec[4] === 'W') lng = -Math.abs(lng);
  return isValidCoord(lat, lng) ? { lat, lng } : null;
}

export function formatCoord(lat: number, lng: number, digits = 5) {
  return `${Math.abs(lat).toFixed(digits)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(digits)}°${lng >= 0 ? 'E' : 'W'}`;
}

export function compassPoint(deg: number): string {
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return pts[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** Rough walking estimate: path factor 1.3 over straight line, 4.5 km/h, + Naismith 1 min per 10 m ascent. */
export function estimateWalkMinutes(straightM: number, ascentM = 0) {
  return Math.round(((straightM * 1.3) / 4500) * 60 + Math.max(0, ascentM) / 10);
}
