import { fail, json, parseCats } from '@/lib/api';
import { alongRoute, nearby } from '@/lib/repo';
import { drivingRoute } from '@/lib/providers/routing';
import { distanceToPolylineM, haversineKm, isValidCoord } from '@/lib/geo';
import type { LocationSummary } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Photography spots along a planned route. Body: { points: [{lat,lng}...], bufferKm, cats } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const pts = (body?.points ?? []).filter((p: any) => isValidCoord(p?.lat, p?.lng)).slice(0, 10);
  if (pts.length < 2) return fail(400, 'at least two valid points required');
  const bufferKm = Math.min(Math.max(Number(body.bufferKm) || 10, 1), 50);
  const cats = parseCats(body.cats ?? null);
  const routed = await drivingRoute(pts).catch(() => null);
  const line: [number, number][] = routed ?? pts.map((p: any) => [p.lat, p.lng]);
  let spots: LocationSummary[] = await alongRoute(line, bufferKm, cats);
  let mode = 'database';
  if (!spots.length) {
    // No index: sample the route and query live providers around each sample (bounded).
    mode = 'live';
    const totalKm = line.slice(1).reduce((s, p, i) => s + haversineKm({ lat: line[i][0], lng: line[i][1] }, { lat: p[0], lng: p[1] }), 0);
    const n = Math.min(6, Math.max(2, Math.ceil(totalKm / (bufferKm * 4))));
    const samples = Array.from({ length: n }, (_, i) => line[Math.round((i / (n - 1)) * (line.length - 1))]);
    const res = await Promise.allSettled(samples.map(([lat, lng]) => nearby({ lat, lng, radiusKm: Math.min(bufferKm * 2, 50), categories: cats, limit: 25, withConditions: false })));
    const seen = new Set<string>();
    for (const r of res) if (r.status === 'fulfilled') for (const s of r.value.data) if (!seen.has(s.id)) { seen.add(s.id); spots.push(s); }
    const poly = line.map(([lat, lng]) => ({ lat, lng }));
    spots = spots.map((s) => ({ ...s, distanceKm: distanceToPolylineM(s, poly) / 1000 })).filter((s) => s.distanceKm! <= bufferKm).sort((a, b) => b.photoScore - a.photoScore);
  }
  return json({ line, routed: !!routed, spots: spots.slice(0, 120), mode });
}
