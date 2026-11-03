import { fetchJson } from '../http';
import { serverConfig } from '../config';
import { lightPhaseAt, seasonOf } from '../astro';
import type { PhotoRef } from '../types';

/**
 * Flickr API (requires FLICKR_API_KEY). Only Creative Commons / public-domain licensed
 * photos are requested, and each is displayed with author + license + link back (Flickr ToS).
 */
const LICENSES: Record<string, { name: string; url: string }> = {
  '1': { name: 'CC BY-NC-SA 2.0', url: 'https://creativecommons.org/licenses/by-nc-sa/2.0/' },
  '2': { name: 'CC BY-NC 2.0', url: 'https://creativecommons.org/licenses/by-nc/2.0/' },
  '3': { name: 'CC BY-NC-ND 2.0', url: 'https://creativecommons.org/licenses/by-nc-nd/2.0/' },
  '4': { name: 'CC BY 2.0', url: 'https://creativecommons.org/licenses/by/2.0/' },
  '5': { name: 'CC BY-SA 2.0', url: 'https://creativecommons.org/licenses/by-sa/2.0/' },
  '6': { name: 'CC BY-ND 2.0', url: 'https://creativecommons.org/licenses/by-nd/2.0/' },
  '9': { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  '10': { name: 'Public Domain Mark', url: 'https://creativecommons.org/publicdomain/mark/1.0/' },
};

export const flickrEnabled = () => Boolean(serverConfig().flickrKey);

export interface FlickrResult { photos: PhotoRef[]; total: number; recentTotal: number }

export async function flickrNearby(lat: number, lng: number, radiusKm = 1, perPage = 30, sinceDays = 30): Promise<FlickrResult | null> {
  const key = serverConfig().flickrKey;
  if (!key) return null;
  const base = {
    method: 'flickr.photos.search', api_key: key, format: 'json', nojsoncallback: '1',
    lat: String(lat), lon: String(lng), radius: String(Math.min(radiusKm, 32)), radius_units: 'km',
    license: Object.keys(LICENSES).join(','), content_types: '0', safe_search: '1', media: 'photos',
    extras: 'url_l,url_m,owner_name,license,date_taken,geo,path_alias', sort: 'interestingness-desc', per_page: String(perPage),
  };
  const r = await fetchJson<any>(`https://api.flickr.com/services/rest/?${new URLSearchParams(base)}`, { provider: 'flickr', revalidate: 21600 });
  const since = Math.floor(Date.now() / 1000) - sinceDays * 86400;
  const recent = await fetchJson<any>(`https://api.flickr.com/services/rest/?${new URLSearchParams({ ...base, per_page: '1', min_upload_date: String(since) })}`, { provider: 'flickr', revalidate: 21600 });
  const photos: PhotoRef[] = (r.photos?.photo ?? []).filter((p: any) => p.url_m).map((p: any) => {
    const lic = LICENSES[p.license];
    const plat = p.latitude ? Number(p.latitude) : null, plng = p.longitude ? Number(p.longitude) : null;
    // Flickr's date_taken is camera-local wall clock without a zone; treat as approximate.
    const takenAt = p.date_taken && p.datetakenunknown !== '1' ? new Date(p.date_taken.replace(' ', 'T') + 'Z').toISOString() : null;
    return {
      id: `flickr:${p.id}`,
      url: p.url_l ?? p.url_m, thumbUrl: p.url_m,
      title: p.title,
      author: p.ownername,
      authorUrl: `https://www.flickr.com/people/${p.path_alias || p.owner}/`,
      license: lic?.name ?? 'See source', licenseUrl: lic?.url,
      sourceUrl: `https://www.flickr.com/photos/${p.path_alias || p.owner}/${p.id}`,
      provider: 'flickr',
      takenAt, lat: plat, lng: plng,
      lightPhase: null, // wall-clock time without timezone → phase would be unreliable
      season: takenAt && plat != null ? seasonOf(new Date(takenAt), plat) : null,
    } satisfies PhotoRef;
  });
  return { photos, total: Number(r.photos?.total ?? 0), recentTotal: Number(recent.photos?.total ?? 0) };
}

export { lightPhaseAt };
