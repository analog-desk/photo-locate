import { fail, json, num } from '@/lib/api';
import { webcamsNearby, webcamsEnabled } from '@/lib/providers/webcams';
import { haversineKm } from '@/lib/geo';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const lat = num(u.get('lat'), -90, 90), lng = num(u.get('lng'), -180, 180);
  if (lat == null || lng == null) return fail(400, 'lat/lng required');
  if (!webcamsEnabled()) return json({ enabled: false, webcams: [] });
  try {
    const cams = (await webcamsNearby(lat, lng, num(u.get('radius'), 1, 250) ?? 30, 16)) ?? [];
    return json({ enabled: true, webcams: cams.map((c) => ({ ...c, distanceKm: haversineKm({ lat, lng }, c) })) }, { cache: 300 });
  } catch (e: any) {
    return fail(502, `Webcam provider unavailable: ${e?.message ?? e}`);
  }
}
