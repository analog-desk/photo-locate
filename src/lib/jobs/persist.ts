import type { SupabaseClient } from '@supabase/supabase-js';
import type { Candidate } from '../providers/candidate';
import { isDuplicate } from '../dedupe';
import { isValidCoord } from '../geo';
import { quickSummary } from '../enrich';
import { bestMonths } from '../seasonal';
import { slugify } from '../repo/mappers';

export interface UpsertOutcome { id: string | null; action: 'created' | 'merged' | 'skipped'; reason?: string }

/** Quality gate applied to every discovered candidate before it can touch the database. */
export function validateCandidate(c: Candidate): string | null {
  if (!isValidCoord(c.lat, c.lng)) return 'invalid coordinates';
  if (!c.name || c.name.length < 2 || c.name.length > 160) return 'invalid name';
  if (/^\d+$/.test(c.name.trim())) return 'numeric name';
  if (!c.categories.length) return 'no photographic category';
  if (c.confidence < 0.45) return 'low confidence';
  if (!c.wikidataId && !c.osmId) return 'no stable source id';
  if (c.osmTags && ['private', 'no'].includes(c.osmTags.access ?? '') && !c.wikidataId) return 'private access (not listed)';
  return null;
}

export async function upsertCandidate(sb: SupabaseClient, c: Candidate, jobId?: number): Promise<UpsertOutcome> {
  const invalid = validateCandidate(c);
  if (invalid) return { id: null, action: 'skipped', reason: invalid };

  const { data: near, error } = await sb.rpc('find_duplicate_candidates', {
    p_lat: c.lat, p_lng: c.lng, p_name: c.name, p_wikidata: c.wikidataId ?? null, p_osm: c.osmId ?? null,
  });
  if (error) throw new Error(`dedupe lookup failed: ${error.message}`);
  const match = (near as any[]).find((d) => isDuplicate(
    { name: d.name, lat: d.lat, lng: d.lng, wikidataId: d.wikidata_id, osmId: d.osm_id, categories: d.categories },
    { name: c.name, lat: c.lat, lng: c.lng, wikidataId: c.wikidataId, osmId: c.osmId, categories: c.categories },
  ));

  if (match) {
    const patch: Record<string, unknown> = { categories: Array.from(new Set([...(match.categories ?? []), ...c.categories])) };
    const changed: string[] = [];
    if (!match.wikidata_id && c.wikidataId) { patch.wikidata_id = c.wikidataId; changed.push('wikidata_id'); }
    if (!match.osm_id && c.osmId) { patch.osm_id = c.osmId; patch.osm_tags = c.osmTags; changed.push('osm_id'); }
    if (c.sitelinks) patch.sitelinks = c.sitelinks;
    if (c.wikipediaTitle) { patch.wikipedia_title = c.wikipediaTitle; patch.wikipedia_lang = c.wikipediaLang ?? 'en'; }
    if ((patch.categories as string[]).length !== (match.categories ?? []).length) changed.push('categories');
    const { error: uerr } = await sb.from('locations').update(patch).eq('id', match.id);
    if (uerr && !/duplicate key/.test(uerr.message)) throw new Error(uerr.message);
    await insertSources(sb, match.id, c);
    if (changed.length) await sb.from('location_updates').insert({ location_id: match.id, job_id: jobId, action: 'merged', changed_fields: changed, diff: { from: c.sources } });
    return { id: match.id, action: 'merged' };
  }

  const s = quickSummary(c);
  const suffix = c.wikidataId ?? c.osmId!.replace('/', '');
  const { data: ins, error: ierr } = await sb.from('locations').insert({
    slug: slugify(c.name, suffix),
    name: c.name, lat: c.lat, lng: c.lng, country: c.country ?? null,
    description: c.description ?? null,
    wikidata_id: c.wikidataId ?? null, osm_id: c.osmId ?? null,
    wikipedia_title: c.wikipediaTitle ?? null, wikipedia_lang: c.wikipediaLang ?? null,
    sitelinks: c.sitelinks ?? null,
    categories: s.categories, osm_tags: c.osmTags ?? null, hero_image: s.heroImage,
    photo_score: s.photoScore, popularity_score: s.popularityScore, scenic_score: s.scenicScore, hidden_gem: s.hiddenGem,
    best_months: bestMonths(c.categories, c.lat, c.lng),
    confidence: c.confidence,
  }).select('id').single();
  if (ierr) {
    if (/duplicate key/.test(ierr.message)) return { id: null, action: 'skipped', reason: 'race: already inserted' };
    throw new Error(ierr.message);
  }
  await insertSources(sb, ins.id, c);
  await sb.from('location_updates').insert({ location_id: ins.id, job_id: jobId, action: 'created', changed_fields: ['*'], diff: { sources: c.sources } });
  return { id: ins.id, action: 'created' };
}

async function insertSources(sb: SupabaseClient, locationId: string, c: Candidate) {
  const rows = c.sources.map((s) => ({ location_id: locationId, provider: s.provider, external_id: s.id, url: s.url ?? null, fetched_at: new Date().toISOString() }));
  if (rows.length) await sb.from('location_sources').upsert(rows, { onConflict: 'provider,external_id', ignoreDuplicates: true });
}

export function rowToCandidate(r: any): Candidate {
  const sources: Candidate['sources'] = [];
  if (r.wikidata_id) sources.push({ provider: 'wikidata', id: r.wikidata_id, url: `https://www.wikidata.org/wiki/${r.wikidata_id}` });
  if (r.osm_id) sources.push({ provider: 'osm', id: r.osm_id, url: `https://www.openstreetmap.org/${r.osm_id}` });
  return {
    name: r.name, lat: r.lat, lng: r.lng, categories: (r.categories ?? []).filter((c: string) => c !== 'hidden-gem'), sources,
    wikidataId: r.wikidata_id ?? undefined, osmId: r.osm_id ?? undefined, osmTags: r.osm_tags ?? undefined,
    commonsImage: r.hero_image?.provider === 'commons' ? r.hero_image.id.replace(/^commons:File:/, '') : undefined,
    sitelinks: r.sitelinks ?? undefined, wikipediaTitle: r.wikipedia_title ?? undefined, wikipediaLang: r.wikipedia_lang ?? undefined,
    country: r.country, description: r.description, confidence: r.confidence,
  };
}
