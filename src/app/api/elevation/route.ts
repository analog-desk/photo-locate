import { fail, json, num } from '@/lib/api';
import { getElevations } from '@/lib/weather/openMeteo';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const lat = num(u.get('lat'), -90, 90), lng = num(u.get('lng'), -180, 180);
  if (lat == null || lng == null) return fail(400, 'lat/lng required');
  try {
    const [e] = await getElevations([{ lat, lng }]);
    return json({ elevation: e, source: 'Copernicus DEM GLO-90 via Open-Meteo' }, { cache: 86400 * 30 });
  } catch (e: any) {
    return fail(502, e?.message ?? 'elevation unavailable');
  }
}
