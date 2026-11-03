import { describe, expect, it } from 'vitest';
import { bearing, compassPoint, destination, distanceToPolylineM, haversineKm, isValidCoord, parseCoordinates } from '@/lib/geo';
import { dedupeCandidates, isDuplicate, nameSimilarity } from '@/lib/dedupe';
import type { Candidate } from '@/lib/providers/candidate';

describe('geo', () => {
  it('haversine London–Paris ≈ 344 km', () => {
    expect(haversineKm({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 })).toBeCloseTo(343.5, 0);
  });
  it('bearing & destination round-trip', () => {
    const o = { lat: 46, lng: 7 };
    const p = destination(o, 10000, 60);
    expect(bearing(o, p)).toBeCloseTo(60, 0);
    expect(haversineKm(o, p)).toBeCloseTo(10, 2);
  });
  it('validates coordinates and rejects null island', () => {
    expect(isValidCoord(0, 0)).toBe(false);
    expect(isValidCoord(91, 0)).toBe(false);
    expect(isValidCoord(46.5, 7.9)).toBe(true);
  });
  it('parses coordinate strings', () => {
    expect(parseCoordinates('46.5577, 7.9068')).toEqual({ lat: 46.5577, lng: 7.9068 });
    expect(parseCoordinates('33.86 S 151.21 E')).toEqual({ lat: -33.86, lng: 151.21 });
    expect(parseCoordinates('Lake Bled')).toBeNull();
  });
  it('compass points', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(225)).toBe('SW');
    expect(compassPoint(359)).toBe('N');
  });
  it('distance to polyline', () => {
    const line = [{ lat: 0.0001, lng: 0 }, { lat: 0.0001, lng: 1 }];
    expect(distanceToPolylineM({ lat: 0.0101, lng: 0.5 }, line)).toBeCloseTo(1112, -1);
  });
});

const cand = (o: Partial<Candidate>): Candidate => ({ name: 'x', lat: 46, lng: 7, categories: ['landscape'], sources: [], confidence: 0.7, ...o });

describe('dedupe', () => {
  it('name similarity ignores generic words & diacritics', () => {
    expect(nameSimilarity('Mirador de San Nicolás', 'San Nicolas viewpoint')).toBeGreaterThan(0.85);
    expect(nameSimilarity('Lago di Braies', 'Pragser Wildsee')).toBeLessThan(0.4);
  });
  it('same wikidata id → duplicate, different ids → not', () => {
    expect(isDuplicate({ name: 'A', lat: 1, lng: 1, wikidataId: 'Q1' }, { name: 'B', lat: 2, lng: 2, wikidataId: 'Q1' })).toBe(true);
    expect(isDuplicate({ name: 'Same', lat: 1, lng: 1, wikidataId: 'Q1' }, { name: 'Same', lat: 1, lng: 1, wikidataId: 'Q2' })).toBe(false);
  });
  it('close + similar name → duplicate; far → not', () => {
    expect(isDuplicate({ name: 'Trolltunga', lat: 60.1241, lng: 6.74 }, { name: 'Trolltunga viewpoint', lat: 60.1245, lng: 6.7405 })).toBe(true);
    expect(isDuplicate({ name: 'Trolltunga', lat: 60.1241, lng: 6.74 }, { name: 'Trolltunga', lat: 60.2, lng: 6.74 })).toBe(false);
  });
  it('merges batch duplicates and unions sources', () => {
    const out = dedupeCandidates([
      cand({ name: 'Skógafoss', lat: 63.5321, lng: -19.5114, wikidataId: 'Q1135473', sources: [{ provider: 'wikidata', id: 'Q1135473' }], categories: ['waterfalls'] }),
      cand({ name: 'Skogafoss', lat: 63.5320, lng: -19.5116, osmId: 'node/1', sources: [{ provider: 'osm', id: 'node/1' }], categories: ['waterfalls', 'landscape'] }),
      cand({ name: 'Seljalandsfoss', lat: 63.6156, lng: -19.9886, wikidataId: 'Q1544470', sources: [{ provider: 'wikidata', id: 'Q1544470' }] }),
    ]);
    expect(out).toHaveLength(2);
    const sk = out.find((c) => c.wikidataId === 'Q1135473')!;
    expect(sk.osmId).toBe('node/1');
    expect(sk.sources).toHaveLength(2);
  });
});
