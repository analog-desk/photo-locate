import { fetchJson } from '../http';
import { lightPhaseAt, seasonOf } from '../astro';
import type { PhotoRef } from '../types';

const API = 'https://commons.wikimedia.org/w/api.php';

const strip = (html?: string) => (html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

interface ImgInfo {
  url: string; thumburl?: string; thumbwidth?: number; thumbheight?: number; width: number; height: number;
  descriptionurl: string; timestamp?: string;
  extmetadata?: Record<string, { value: string }>;
  commonmetadata?: { name: string; value: unknown }[];
}

/** Only these license families are displayed (all permit reuse with attribution). */
const OK_LICENSE = /^(CC0|CC BY|CC-BY|Public domain|PD|Attribution|GFDL|FAL)/i;

function exifNum(cm: ImgInfo['commonmetadata'], key: string): number | null {
  const v = cm?.find((x) => x.name === key)?.value;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const f = v.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (f) return Number(f[1]) / Number(f[2]);
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toPhoto(title: string, ii: ImgInfo, coord?: { lat: number; lon: number }): PhotoRef | null {
  const md = ii.extmetadata ?? {};
  const license = strip(md.LicenseShortName?.value);
  if (!license || !OK_LICENSE.test(license)) return null;
  const mime = md.MimeType?.value ?? '';
  if (mime && !/image\/(jpeg|png|webp)/.test(mime)) return null;
  const dto = md.DateTimeOriginal?.value ? strip(md.DateTimeOriginal.value) : null;
  // Commons dates are free-form; only accept ISO-ish values that include a time
  const takenAt = dto && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(dto) ? new Date(dto.replace(' ', 'T') + (/[zZ+]/.test(dto) ? '' : 'Z')).toISOString() : null;
  const lat = coord?.lat ?? null, lng = coord?.lon ?? null;
  const shutter = exifNum(ii.commonmetadata, 'ExposureTime');
  const model = ii.commonmetadata?.find((x) => x.name === 'Model')?.value;
  const lensModel = ii.commonmetadata?.find((x) => x.name === 'UndefinedTag:0xA434' || x.name === 'LensModel')?.value;
  return {
    id: `commons:${title}`,
    url: ii.thumburl && (ii.thumbwidth ?? 0) >= 1200 ? ii.thumburl : ii.url,
    thumbUrl: ii.thumburl ?? ii.url,
    width: ii.width, height: ii.height,
    title: strip(md.ObjectName?.value) || title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
    author: strip(md.Artist?.value) || 'Unknown author',
    license,
    licenseUrl: md.LicenseUrl?.value,
    sourceUrl: ii.descriptionurl,
    provider: 'commons',
    takenAt,
    lat, lng,
    // Light phase is only derivable with a trustworthy capture time AND position.
    lightPhase: takenAt && lat != null && lng != null ? lightPhaseAt(new Date(takenAt), lat, lng) : null,
    season: takenAt && lat != null ? seasonOf(new Date(takenAt), lat) : null,
    camera: typeof model === 'string' ? model : null,
    lens: typeof lensModel === 'string' ? lensModel : null,
    focalLength: exifNum(ii.commonmetadata, 'FocalLength'),
    aperture: exifNum(ii.commonmetadata, 'FNumber'),
    shutter: shutter ? (shutter >= 1 ? `${shutter}s` : `1/${Math.round(1 / shutter)}s`) : null,
    iso: exifNum(ii.commonmetadata, 'ISOSpeedRatings'),
  };
}

const IIPROPS = {
  prop: 'imageinfo|coordinates',
  iiprop: 'url|size|extmetadata|commonmetadata|timestamp',
  iiurlwidth: '1600',
  iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|DateTimeOriginal|ObjectName|MimeType',
};

/** Geotagged, freely licensed photographs within `radiusM` (≤ 10 km) of a point. */
export async function commonsNearby(lat: number, lng: number, radiusM = 800, limit = 40): Promise<PhotoRef[]> {
  const p = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    generator: 'geosearch', ggscoord: `${lat}|${lng}`, ggsradius: String(Math.min(radiusM, 10000)),
    ggslimit: String(Math.min(limit, 50)), ggsnamespace: '6', ...IIPROPS,
  });
  const r = await fetchJson<any>(`${API}?${p}`, { provider: 'commons', revalidate: 21600 });
  const pages: any[] = r.query?.pages ?? [];
  return pages
    .map((pg) => (pg.imageinfo?.[0] ? toPhoto(pg.title, pg.imageinfo[0], pg.coordinates?.[0]) : null))
    .filter((x): x is PhotoRef => !!x);
}

export async function commonsFiles(fileNames: string[]): Promise<PhotoRef[]> {
  if (!fileNames.length) return [];
  const out: PhotoRef[] = [];
  for (let i = 0; i < fileNames.length; i += 40) {
    const titles = fileNames.slice(i, i + 40).map((f) => (f.startsWith('File:') ? f : `File:${f}`)).join('|');
    const p = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', titles, ...IIPROPS, iiurlwidth: '1200' });
    const r = await fetchJson<any>(`${API}?${p}`, { provider: 'commons', revalidate: 86400 });
    for (const pg of r.query?.pages ?? []) {
      if (pg.imageinfo?.[0]) {
        const ph = toPhoto(pg.title, pg.imageinfo[0], pg.coordinates?.[0]);
        if (ph) out.push(ph);
      }
    }
  }
  return out;
}

/** HEAD-check that an image URL is still reachable (broken image detection). */
export async function imageAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'LumenPhotoAtlas/0.1 link-check' } });
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    return false;
  }
}
