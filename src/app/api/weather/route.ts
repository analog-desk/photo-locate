import { fail, json, num } from '@/lib/api';
import { getForecast, OPEN_METEO_ATTRIBUTION } from '@/lib/weather/openMeteo';
import { dayOutlook } from '@/lib/weather/conditions';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const lat = num(u.get('lat'), -90, 90), lng = num(u.get('lng'), -180, 180);
  if (lat == null || lng == null) return fail(400, 'lat/lng required');
  const cats = (u.get('cats') ?? '').split(',').filter(Boolean);
  try {
    const f = await getForecast(lat, lng, 7);
    const outlooks = f.daily.time.map((d) => dayOutlook(f, d, lat, lng, cats));
    return json({ forecast: f, outlooks, attribution: OPEN_METEO_ATTRIBUTION }, { cache: 1200 });
  } catch (e: any) {
    return fail(502, `Weather provider unavailable: ${e?.message ?? e}`);
  }
}
