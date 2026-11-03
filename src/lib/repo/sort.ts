import type { LocationSummary, SortKey } from '../types';

export function sortSummaries(list: LocationSummary[], sort: SortKey): LocationSummary[] {
  const c = (l: LocationSummary, k: 'sunrise' | 'sunset' | 'golden' | 'blue' | 'astro') => l.conditions?.[k] ?? -1;
  const by: Record<SortKey, (a: LocationSummary, b: LocationSummary) => number> = {
    score: (a, b) => b.photoScore - a.photoScore,
    popularity: (a, b) => b.popularityScore - a.popularityScore,
    distance: (a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0),
    sunrise: (a, b) => c(b, 'sunrise') - c(a, 'sunrise') || b.photoScore - a.photoScore,
    sunset: (a, b) => c(b, 'sunset') - c(a, 'sunset') || b.photoScore - a.photoScore,
    golden: (a, b) => c(b, 'golden') - c(a, 'golden') || b.photoScore - a.photoScore,
    blue: (a, b) => c(b, 'blue') - c(a, 'blue') || b.photoScore - a.photoScore,
    astro: (a, b) => c(b, 'astro') - c(a, 'astro') || b.photoScore - a.photoScore,
    new: (a, b) => Date.parse(b.discoveredAt ?? '0') - Date.parse(a.discoveredAt ?? '0'),
    hidden: (a, b) => Number(b.hiddenGem) - Number(a.hiddenGem) || b.scenicScore - a.scenicScore,
  };
  return [...list].sort(by[sort]);
}
