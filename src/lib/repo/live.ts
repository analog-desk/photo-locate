/**
 * Live repository — queries real providers on demand. Used when no database is configured,
 * and to top up sparse database coverage (which also enqueues demand-driven discovery).
 */
import { wikidataAround, wikidataById } from '../providers/wikidata';
import { osmById, osmPoisAround } from '../providers/overpass';
import { dedupeCandidates } from '../dedupe';
import { enrichCandidate, nextConditions, parseLiveId, quickSummary } from '../enrich';
import { getForecastMulti } from '../weather/openMeteo';
import { haversineKm } from '../geo';
import { sortSummaries } from './sort';
import type { Category, LocationDetail, LocationSummary, SortKey } from '../types';
import type { Candidate } from '../providers/candidate';

export interface NearbyQuery { lat: number; lng: number; radiusKm: number; categories?: Category[]; sort?: SortKey; limit?: number; withConditions?: boolean }

export async function liveCandidates(lat: number, lng: number, radiusKm: number): Promise<Candidate[]> {
  const [wd, osm] = await Promise.allSettled([
    wikidataAround(lat, lng, radiusKm, 200),
    radiusKm <= 50 ? osmPoisAround(lat, lng, radiusKm, 300) : Promise.resolve([] as Candidate[]),
  ]);
  const all = [...(wd.status === 'fulfilled' ? wd.value : []), ...(osm.status === 'fulfilled' ? osm.value : [])];
  if (wd.status === 'rejected' && osm.status === 'rejected') throw wd.reason;
  return dedupeCandidates(all);
}

export async function liveNearby(q: NearbyQuery): Promise<LocationSummary[]> {
  const cands = await liveCandidates(q.lat, q.lng, q.radiusKm);
  let list: LocationSummary[] = cands.map((c) => ({ ...quickSummary(c), distanceKm: haversineKm(q, c) }))
    .filter((s) => s.distanceKm! <= q.radiusKm);
  if (q.categories?.length) list = list.filter((s) => q.categories!.some((c) => s.categories.includes(c)));
  list = sortSummaries(list, 'score');
  const limit = q.limit ?? 60;
  list = list.slice(0, Math.max(limit, 30));
  if (q.withConditions !== false && list.length) {
    // Conditions for the top results (one batched Open-Meteo call)
    const top = list.slice(0, 30);
    try {
      const fcs = await getForecastMulti(top.map((s) => ({ lat: s.lat, lng: s.lng })), 3);
      const byId = new Map(cands.map((c) => [quickSummary(c).id, c]));
      list = list.map((s, i) => {
        if (i >= top.length || !fcs[i]) return s;
        const cand = byId.get(s.id)!;
        const conditions = nextConditions(fcs[i], s.lat, s.lng, s.categories);
        return { ...quickSummary(cand, { conditions }), distanceKm: s.distanceKm };
      });
    } catch { /* weather unavailable → conditions stay null, scores renormalise */ }
  }
  return sortSummaries(list, q.sort ?? 'score').slice(0, limit);
}

export async function liveCandidateById(id: string): Promise<Candidate | null> {
  const ref = parseLiveId(id);
  if (!ref) return null;
  if (ref.wikidataId) return wikidataById(ref.wikidataId);
  if (ref.osmId) return osmById(ref.osmId);
  return null;
}

export async function liveDetail(id: string): Promise<LocationDetail | null> {
  const c = await liveCandidateById(id);
  if (!c) return null;
  return (await enrichCandidate(c)).detail;
}
