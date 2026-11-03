import { fetchJson } from '../http';
import type { Category } from '../types';
import type { Candidate } from './candidate';

/** Wikidata classes (P31, direct instance-of) considered photographic subjects → app categories. */
export const WD_CLASSES: Record<string, Category[]> = {
  Q8502: ['mountains', 'landscape'],          // mountain
  Q207326: ['mountains', 'landscape'],        // summit
  Q133056: ['mountains', 'landscape', 'drone'], // mountain pass
  Q8072: ['mountains', 'landscape'],          // volcano
  Q35666: ['mountains', 'landscape'],         // glacier
  Q34038: ['waterfalls', 'landscape'],        // waterfall
  Q23397: ['lakes', 'landscape'],             // lake
  Q131681: ['lakes', 'landscape'],            // reservoir
  Q40080: ['beaches', 'coastlines'],          // beach
  Q185113: ['coastlines', 'landscape'],       // cape
  Q107679: ['coastlines', 'landscape'],       // cliff
  Q23442: ['coastlines', 'landscape', 'drone'], // island
  Q39715: ['coastlines', 'architecture', 'night'], // lighthouse
  Q4421: ['forests', 'landscape'],            // forest
  Q46169: ['landscape', 'wildlife', 'astro'], // national park
  Q179049: ['wildlife', 'landscape'],         // nature reserve
  Q150784: ['landscape', 'drone'],            // canyon
  Q2042028: ['landscape'],                    // ravine
  Q35509: ['landscape'],                      // cave
  Q177380: ['landscape'],                     // hot spring
  Q6017969: ['landscape'],                    // scenic viewpoint
  Q1440300: ['landscape', 'cityscapes'],      // observation tower
  Q23413: ['architecture'],                   // castle
  Q1785071: ['architecture'],                 // fortress
  Q16560: ['architecture'],                   // palace
  Q2977: ['architecture'],                    // cathedral
  Q44613: ['architecture'],                   // monastery
  Q12280: ['architecture', 'cityscapes', 'night'], // bridge
  Q12570: ['architecture', 'cityscapes', 'night'], // suspension bridge
  Q12323: ['architecture', 'landscape'],      // dam
  Q11303: ['cityscapes', 'architecture', 'night'], // skyscraper
  Q174782: ['street', 'architecture'],        // town square
  Q74047: ['abandoned'],                      // ghost town
  Q109607: ['abandoned', 'architecture'],     // ruins
  Q839954: ['architecture'],                  // archaeological site
  Q4989906: ['architecture'],                 // monument
  Q1107656: ['landscape'],                    // garden
};

const VALUES = Object.keys(WD_CLASSES).map((q) => `wd:${q}`).join(' ');

const SPARQL = 'https://query.wikidata.org/sparql';

interface Binding { [k: string]: { value: string } | undefined }

function select(where: string, limit: number) {
  return `SELECT ?item ?itemLabel ?itemDescription ?coord ?image ?class ?sitelinks ?countryLabel ?article WHERE {
  ${where}
  VALUES ?class { ${VALUES} }
  ?item wdt:P31 ?class ; wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P17 ?country }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul,[AUTO_LANGUAGE]". }
} ORDER BY DESC(?sitelinks) LIMIT ${limit}`;
}

async function run(query: string): Promise<Binding[]> {
  const res = await fetchJson<{ results: { bindings: Binding[] } }>(SPARQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
    body: new URLSearchParams({ query }).toString(),
    provider: 'wikidata',
    timeoutMs: 65000,
    retries: 2,
  });
  return res.results.bindings;
}

function parsePoint(wkt: string): { lat: number; lng: number } | null {
  const m = wkt.match(/Point\(([-\d.eE]+) ([-\d.eE]+)\)/);
  return m ? { lng: parseFloat(m[1]), lat: parseFloat(m[2]) } : null;
}

function toCandidates(rows: Binding[]): Candidate[] {
  const byId = new Map<string, Candidate>();
  for (const r of rows) {
    const qid = r.item?.value.split('/').pop();
    const pt = r.coord ? parsePoint(r.coord.value) : null;
    const label = r.itemLabel?.value;
    if (!qid || !pt || !label || /^Q\d+$/.test(label)) continue;
    const cls = r.class?.value.split('/').pop() ?? '';
    const existing = byId.get(qid);
    const cats = WD_CLASSES[cls] ?? [];
    if (existing) {
      existing.categories = Array.from(new Set([...existing.categories, ...cats]));
      existing.classes = Array.from(new Set([...(existing.classes ?? []), cls]));
      continue;
    }
    const img = r.image?.value ? decodeURIComponent(r.image.value.split('/Special:FilePath/').pop() ?? '').replace(/_/g, ' ') : undefined;
    const article = r.article?.value;
    byId.set(qid, {
      name: label,
      lat: pt.lat,
      lng: pt.lng,
      categories: [...cats],
      classes: [cls],
      sources: [{ provider: 'wikidata', id: qid, url: `https://www.wikidata.org/wiki/${qid}` }],
      wikidataId: qid,
      commonsImage: img || undefined,
      sitelinks: Number(r.sitelinks?.value ?? 0),
      wikipediaTitle: article ? decodeURIComponent(article.split('/wiki/').pop()!) : undefined,
      wikipediaLang: article ? 'en' : undefined,
      country: r.countryLabel?.value ?? null,
      description: r.itemDescription?.value ?? null,
      confidence: 0.75 + Math.min(0.2, Number(r.sitelinks?.value ?? 0) / 200),
    });
  }
  return [...byId.values()];
}

export async function wikidataAround(lat: number, lng: number, radiusKm: number, limit = 150): Promise<Candidate[]> {
  const where = `SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral ; wikibase:radius "${Math.min(radiusKm, 250)}" . }`;
  return toCandidates(await run(select(where, limit)));
}

export async function wikidataBox(south: number, west: number, north: number, east: number, limit = 200): Promise<Candidate[]> {
  const where = `SERVICE wikibase:box { ?item wdt:P625 ?coord . bd:serviceParam wikibase:cornerSouthWest "Point(${west} ${south})"^^geo:wktLiteral ; wikibase:cornerNorthEast "Point(${east} ${north})"^^geo:wktLiteral . }`;
  return toCandidates(await run(select(where, limit)));
}

export async function wikidataById(qid: string): Promise<Candidate | null> {
  if (!/^Q\d+$/.test(qid)) return null;
  const q = `SELECT ?item ?itemLabel ?itemDescription ?coord ?image ?class ?sitelinks ?countryLabel ?article WHERE {
    BIND(wd:${qid} AS ?item) ?item wdt:P625 ?coord ; wikibase:sitelinks ?sitelinks .
    OPTIONAL { ?item wdt:P31 ?class } OPTIONAL { ?item wdt:P18 ?image } OPTIONAL { ?item wdt:P17 ?country }
    OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul,[AUTO_LANGUAGE]". } } LIMIT 20`;
  const c = toCandidates(await run(q))[0];
  if (c && c.categories.length === 0) c.categories = ['landscape'];
  return c ?? null;
}

/** Plain-text intro of the English Wikipedia article (CC BY-SA, attribution shown in UI). */
export async function wikipediaSummary(title: string, lang = 'en') {
  try {
    const r = await fetchJson<{ extract?: string; content_urls?: { desktop?: { page?: string } } }>(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { provider: 'wikipedia', revalidate: 86400 },
    );
    return { text: r.extract ?? null, url: r.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}` };
  } catch {
    return null;
  }
}
