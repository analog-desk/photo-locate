import { fetchJson } from '../http';

/** Nominatim (OSM) geocoding — max 1 req/s, no autocomplete, results cached. ODbL attribution in UI. */
export interface GeocodeResult {
  name: string; displayName: string; lat: number; lng: number; type: string;
  country: string | null; region: string | null; town: string | null;
  bbox?: [number, number, number, number];
}

const BASE = 'https://nominatim.openstreetmap.org';

function addrParts(a: any = {}) {
  return {
    country: a.country ?? null,
    region: a.state ?? a.region ?? a.county ?? null,
    town: a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ?? null,
  };
}

export async function geocode(q: string, limit = 6): Promise<GeocodeResult[]> {
  const p = new URLSearchParams({ q, format: 'jsonv2', addressdetails: '1', limit: String(limit) });
  const r = await fetchJson<any[]>(`${BASE}/search?${p}`, { provider: 'nominatim', revalidate: 86400 * 7 });
  return r.map((x) => ({
    name: x.name || x.display_name.split(',')[0],
    displayName: x.display_name,
    lat: Number(x.lat), lng: Number(x.lon), type: x.type,
    ...addrParts(x.address),
    bbox: x.boundingbox ? [Number(x.boundingbox[0]), Number(x.boundingbox[2]), Number(x.boundingbox[1]), Number(x.boundingbox[3])] : undefined,
  }));
}

export async function reverseGeocode(lat: number, lng: number) {
  const p = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2', addressdetails: '1', zoom: '12' });
  const r = await fetchJson<any>(`${BASE}/reverse?${p}`, { provider: 'nominatim', revalidate: 86400 * 30 });
  return { displayName: r.display_name as string, ...addrParts(r.address) };
}
