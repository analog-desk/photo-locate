import { fail, json, num } from '@/lib/api';
import { geocode, reverseGeocode } from '@/lib/providers/nominatim';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const lat = num(u.get('lat'), -90, 90), lng = num(u.get('lng'), -180, 180);
  try {
    if (lat != null && lng != null) return json(await reverseGeocode(lat, lng), { cache: 86400 });
    const q = (u.get('q') ?? '').trim();
    if (q.length < 2) return fail(400, 'q required');
    return json(await geocode(q.slice(0, 200)), { cache: 86400 });
  } catch (e: any) {
    return fail(502, `Geocoder unavailable: ${e?.message ?? e}`);
  }
}
