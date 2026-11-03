import { describe, expect, it } from 'vitest';
import { isHiddenGem, photoScore, popularityScore, scenicScore, type ScoreInputs } from '@/lib/scoring';
import { fogPotential, sunEventScore, type HourConditions } from '@/lib/weather/conditions';
import { validateCandidate } from '@/lib/jobs/persist';

const base: ScoreInputs = {
  categories: ['mountains'], sitelinks: 40, hasImage: true, photoCount: 30, distinctPhotographers: 12, avgDailyViews: 800,
  isViewpoint: false, viewpointCount: 2, nearestParkingM: 400, conditions: null, seasonal: 100,
};

describe('scoring', () => {
  it('stays within 0-100 and renormalises missing weather', () => {
    const { score, breakdown } = photoScore(base);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(breakdown.weather).toBeNull();
  });
  it('better conditions raise the photo score', () => {
    const poor = photoScore({ ...base, conditions: { sunrise: 10, sunset: 15, golden: 15, blue: 20, astro: 5, computedAt: '' } }).score;
    const great = photoScore({ ...base, conditions: { sunrise: 90, sunset: 85, golden: 90, blue: 80, astro: 70, computedAt: '' } }).score;
    expect(great).toBeGreaterThan(poor);
  });
  it('popularity is independent of conditions', () => {
    expect(popularityScore({ ...base, conditions: { sunrise: 0, sunset: 0, golden: 0, blue: 0, astro: 0, computedAt: '' } })).toBe(popularityScore(base));
  });
  it('identifies hidden gems: scenic but little attention', () => {
    const quiet: ScoreInputs = { ...base, sitelinks: 0, avgDailyViews: 0, photoCount: 2, isViewpoint: true, categories: ['mountains', 'landscape'] };
    expect(isHiddenGem(scenicScore(quiet), popularityScore(quiet))).toBe(true);
    expect(isHiddenGem(scenicScore(base), popularityScore(base))).toBe(false);
  });
});

const hour = (o: Partial<HourConditions>): HourConditions => ({ idx: 0, time: '', total: 0, low: 0, mid: 0, high: 0, precipProb: 0, precip: 0, visibilityM: 30000, wind: 5, gust: 10, humidity: 60, dewSpread: 8, ...o });

describe('conditions', () => {
  it('broken high cloud beats clear sky and low overcast for sunsets', () => {
    const broken = sunEventScore(hour({ high: 50, mid: 30, low: 5, total: 55 }));
    const clear = sunEventScore(hour({}));
    const overcast = sunEventScore(hour({ low: 100, total: 100 }));
    expect(broken).toBeGreaterThan(clear);
    expect(clear).toBeGreaterThan(overcast);
  });
  it('detects fog potential', () => {
    expect(fogPotential(hour({ visibilityM: 400, dewSpread: 0.3, humidity: 99, wind: 3 }))).toBeGreaterThanOrEqual(75);
    expect(fogPotential(hour({}))).toBeLessThan(20);
  });
});

describe('data quality gate', () => {
  const ok = { name: 'Skógafoss', lat: 63.53, lng: -19.51, categories: ['waterfalls' as const], sources: [], wikidataId: 'Q1', confidence: 0.8 };
  it('accepts a good candidate', () => expect(validateCandidate(ok)).toBeNull());
  it('rejects bad coordinates, missing ids, private sites', () => {
    expect(validateCandidate({ ...ok, lat: 0, lng: 0 })).toMatch(/coordinates/);
    expect(validateCandidate({ ...ok, wikidataId: undefined })).toMatch(/source id/);
    expect(validateCandidate({ ...ok, wikidataId: undefined, osmId: 'node/1', osmTags: { access: 'private' } })).toMatch(/private/);
  });
});
