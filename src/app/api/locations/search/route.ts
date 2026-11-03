import { fail, json, parseCats } from '@/lib/api';
import { search } from '@/lib/repo';
import { geocode } from '@/lib/providers/nominatim';
import { parseCoordinates } from '@/lib/geo';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/types';

export const runtime = 'nodejs';

/** Unified search: coordinates → place; subjects → category; names → indexed spots + geocoder places. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const q = (u.get('q') ?? '').trim().slice(0, 200);
  if (q.length < 2) return fail(400, 'query too short');
  const coords = parseCoordinates(q);
  if (coords) return json({ kind: 'coordinates', point: coords, places: [], spots: [] });
  const lower = q.toLowerCase();
  const subject = CATEGORIES.find((c) => c === lower || CATEGORY_LABELS[c].toLowerCase() === lower || CATEGORY_LABELS[c].toLowerCase().startsWith(lower));
  const [spots, places] = await Promise.all([
    search(q, parseCats(u.get('cats'))).catch(() => ({ data: [], mode: 'live' as const })),
    geocode(q, 6).catch(() => []),
  ]);
  return json({ kind: 'text', subject: subject ?? null, spots: spots.data, places, mode: spots.mode }, { cache: 3600 });
}
