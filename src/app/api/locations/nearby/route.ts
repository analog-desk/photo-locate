import { fail, json, num, parseCats, parseSort } from '@/lib/api';
import { nearby } from '@/lib/repo';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const lat = num(u.get('lat'), -90, 90), lng = num(u.get('lng'), -180, 180);
  if (lat == null || lng == null) return fail(400, 'lat/lng required');
  const radiusKm = num(u.get('radius'), 1, 250) ?? 25;
  try {
    const r = await nearby({ lat, lng, radiusKm, categories: parseCats(u.get('cats')), sort: parseSort(u.get('sort')), limit: num(u.get('limit'), 1, 200) ?? 60 });
    return json(r, { cache: 600 });
  } catch (e: any) {
    return fail(502, `Location providers unavailable: ${e?.message ?? e}`);
  }
}
