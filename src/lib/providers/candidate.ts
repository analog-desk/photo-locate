import type { Category, SourceRef } from '../types';

/** Normalised output of every discovery provider, before dedupe/persistence. */
export interface Candidate {
  name: string;
  lat: number;
  lng: number;
  categories: Category[];
  sources: SourceRef[];
  wikidataId?: string;
  osmId?: string; // e.g. "node/123"
  osmTags?: Record<string, string>;
  commonsImage?: string; // File name without "File:" prefix
  sitelinks?: number;
  wikipediaTitle?: string; // enwiki title
  wikipediaLang?: string;
  country?: string | null;
  description?: string | null;
  classes?: string[];
  confidence: number; // 0-1
}

export function mergeCandidates(a: Candidate, b: Candidate): Candidate {
  const sources = [...a.sources];
  for (const s of b.sources) if (!sources.some((x) => x.provider === s.provider && x.id === s.id)) sources.push(s);
  // Prefer Wikidata coordinates for notable sites, OSM for precise viewpoints.
  const preferB = !!b.osmTags?.tourism && b.osmTags.tourism === 'viewpoint' && !a.osmTags;
  return {
    ...a,
    name: a.wikidataId ? a.name : b.name || a.name,
    lat: preferB ? b.lat : a.lat,
    lng: preferB ? b.lng : a.lng,
    categories: Array.from(new Set([...a.categories, ...b.categories])),
    sources,
    wikidataId: a.wikidataId ?? b.wikidataId,
    osmId: a.osmId ?? b.osmId,
    osmTags: { ...(b.osmTags ?? {}), ...(a.osmTags ?? {}) },
    commonsImage: a.commonsImage ?? b.commonsImage,
    sitelinks: Math.max(a.sitelinks ?? 0, b.sitelinks ?? 0) || undefined,
    wikipediaTitle: a.wikipediaTitle ?? b.wikipediaTitle,
    wikipediaLang: a.wikipediaLang ?? b.wikipediaLang,
    country: a.country ?? b.country,
    description: a.description ?? b.description,
    classes: Array.from(new Set([...(a.classes ?? []), ...(b.classes ?? [])])),
    confidence: Math.min(1, Math.max(a.confidence, b.confidence) + 0.1),
  };
}
