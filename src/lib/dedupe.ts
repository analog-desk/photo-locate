import { haversineM } from './geo';
import type { Candidate } from './providers/candidate';
import { mergeCandidates } from './providers/candidate';

const GENERIC = new Set([
  'the', 'of', 'de', 'del', 'la', 'le', 'les', 'el', 'da', 'di', 'du', 'der', 'die', 'das', 'and', 'et', 'y',
  'viewpoint', 'view', 'point', 'lookout', 'overlook', 'vista', 'mirador', 'miradouro', 'belvedere', 'aussichtspunkt',
  'aussicht', 'punto', 'panoramico', 'panorama', 'mount', 'mt', 'monte', 'mont', 'berg', 'lake', 'lago', 'lac', 'see',
  'waterfall', 'falls', 'fall', 'cascade', 'cascada', 'cascata', 'wasserfall', 'castle', 'castillo', 'castello', 'schloss', 'burg',
  'beach', 'playa', 'plage', 'praia', 'spiaggia', 'strand',
]);

export function normaliseName(s: string): string {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter((w) => w && !GENERIC.has(w)).join(' ');
}

function bigrams(s: string) {
  const out = new Map<string, number>();
  const t = s.replace(/\s+/g, ' ');
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Sørensen–Dice on character bigrams, with a containment bonus. 0..1 */
export function nameSimilarity(a: string, b: string): number {
  const na = normaliseName(a), nb = normaliseName(b);
  if (!na || !nb) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  if (na === nb) return 1;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return 0.9;
  const A = bigrams(na), B = bigrams(nb);
  let inter = 0, total = 0;
  for (const [g, n] of A) { inter += Math.min(n, B.get(g) ?? 0); total += n; }
  for (const [, n] of B) total += n;
  return total ? (2 * inter) / total : 0;
}

export interface DedupeTarget { id?: string; name: string; lat: number; lng: number; wikidataId?: string | null; osmId?: string | null; categories?: string[] }

/**
 * Decide whether two records describe the same photography location.
 * Rules (first match wins):
 *  1. identical external IDs (Wikidata QID or OSM element)
 *  2. ≤ 150 m apart and name similarity ≥ 0.72
 *  3. ≤ 40 m apart and share a category (e.g. two "unnamed viewpoint" nodes on the same platform)
 *  4. ≤ 600 m apart and names essentially identical (≥ 0.93) — large features (lakes, castles)
 */
export function isDuplicate(a: DedupeTarget, b: DedupeTarget): boolean {
  if (a.wikidataId && b.wikidataId) return a.wikidataId === b.wikidataId;
  if (a.osmId && b.osmId && a.osmId === b.osmId) return true;
  const d = haversineM(a, b);
  if (d > 600) return false;
  const sim = nameSimilarity(a.name, b.name);
  if (d <= 150 && sim >= 0.72) return true;
  if (d <= 40 && (a.categories ?? []).some((c) => (b.categories ?? []).includes(c))) return true;
  return d <= 600 && sim >= 0.93;
}

/** Collapse duplicates within a batch of candidates (O(n²) within ~1km grid buckets). */
export function dedupeCandidates(list: Candidate[]): Candidate[] {
  const buckets = new Map<string, Candidate[]>();
  const key = (lat: number, lng: number) => `${Math.floor(lat * 100)}:${Math.floor(lng * 100)}`;
  const out: Candidate[] = [];
  for (const c of list) {
    const ki = Math.floor(c.lat * 100), kj = Math.floor(c.lng * 100);
    let merged = false;
    outer: for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const arr = buckets.get(`${ki + di}:${kj + dj}`);
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        if (isDuplicate(arr[i], c)) {
          const m = mergeCandidates(arr[i], c);
          const idx = out.indexOf(arr[i]);
          out[idx] = m; arr[i] = m;
          merged = true;
          break outer;
        }
      }
    }
    if (!merged) {
      out.push(c);
      const k = key(c.lat, c.lng);
      buckets.set(k, [...(buckets.get(k) ?? []), c]);
    }
  }
  return out;
}
