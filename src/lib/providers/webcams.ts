import { fetchJson } from '../http';
import { serverConfig } from '../config';

/** Windy Webcams API v3 — authorised public webcam directory. Requires WINDY_WEBCAMS_API_KEY. */
export interface Webcam {
  id: string;
  title: string;
  lat: number; lng: number;
  distanceKm: number | null;
  status: string;
  lastUpdatedOn: string | null;
  stale: boolean;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  playerDayUrl: string | null;
  playerLiveUrl: string | null;
  pageUrl: string | null;
  categories: string[];
  direction: number | null; // Windy doesn't publish view direction; kept for other providers
  provider: 'windy';
}

export const webcamsEnabled = () => Boolean(serverConfig().windyKey);

const STALE_MS = 6 * 3600_000;

export async function webcamsNearby(lat: number, lng: number, radiusKm = 25, limit = 12): Promise<Webcam[] | null> {
  const key = serverConfig().windyKey;
  if (!key) return null;
  const p = new URLSearchParams({
    nearby: `${lat},${lng},${Math.min(radiusKm, 250)}`,
    include: 'images,location,player,urls,categories',
    limit: String(Math.min(limit, 50)),
  });
  const r = await fetchJson<any>(`https://api.windy.com/webcams/api/v3/webcams?${p}`, {
    headers: { 'x-windy-api-key': key }, provider: 'windy', revalidate: 600,
  });
  const PRIORITY = ['mountain', 'beach', 'coast', 'lake', 'landscape', 'city', 'island', 'meteo', 'water'];
  return (r.webcams ?? []).map((w: any): Webcam => {
    const last = w.lastUpdatedOn ?? null;
    return {
      id: String(w.webcamId),
      title: w.title,
      lat: w.location?.latitude, lng: w.location?.longitude,
      distanceKm: null,
      status: w.status,
      lastUpdatedOn: last,
      stale: !last || Date.now() - Date.parse(last) > STALE_MS || w.status !== 'active',
      previewUrl: w.images?.current?.preview ?? null,
      thumbnailUrl: w.images?.current?.thumbnail ?? null,
      playerDayUrl: w.player?.day ?? null,
      playerLiveUrl: w.player?.live ?? null,
      pageUrl: w.urls?.detail ?? null,
      categories: (w.categories ?? []).map((c: any) => c.id ?? c.name),
      direction: null,
      provider: 'windy',
    };
  }).sort((a: Webcam, b: Webcam) => {
    const pa = Math.min(...a.categories.map((c) => { const i = PRIORITY.indexOf(c); return i < 0 ? 99 : i; }), 99);
    const pb = Math.min(...b.categories.map((c) => { const i = PRIORITY.indexOf(c); return i < 0 ? 99 : i; }), 99);
    return Number(a.stale) - Number(b.stale) || pa - pb;
  });
}
