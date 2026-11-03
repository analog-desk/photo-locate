import type { Category, LocationSummary, SourceRef } from '../types';

export function slugify(name: string, suffix: string) {
  const base = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `${base || 'spot'}-${suffix.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

export function rowToSummary(r: any, distanceKm?: number): LocationSummary {
  const sources: SourceRef[] = [];
  if (r.wikidata_id) sources.push({ provider: 'wikidata', id: r.wikidata_id, url: `https://www.wikidata.org/wiki/${r.wikidata_id}` });
  if (r.osm_id) sources.push({ provider: 'osm', id: r.osm_id, url: `https://www.openstreetmap.org/${r.osm_id}` });
  if (r.created_by) sources.push({ provider: 'community', id: r.id });
  return {
    id: r.id, slug: r.slug, name: r.name, lat: r.lat, lng: r.lng,
    country: r.country, region: r.region, nearestTown: r.nearest_town,
    categories: (r.categories ?? []) as Category[],
    heroImage: r.hero_image ?? null,
    photoScore: r.photo_score, popularityScore: r.popularity_score, scenicScore: r.scenic_score,
    conditions: r.conditions ?? null, hiddenGem: r.hidden_gem,
    communityRating: r.community_rating != null ? Number(r.community_rating) : null, ratingCount: r.rating_count ?? 0,
    discoveredAt: r.discovered_at, updatedAt: r.last_refreshed_at ?? r.updated_at,
    confidence: r.confidence, sources,
    distanceKm,
  };
}
