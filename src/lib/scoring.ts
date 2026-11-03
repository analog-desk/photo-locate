import type { Category, ConditionScores, ScoreBreakdown } from './types';

/** Base scenic value by category — a prior that notability and imagery refine. */
const CATEGORY_PRIOR: Partial<Record<Category, number>> = {
  mountains: 70, waterfalls: 70, coastlines: 66, lakes: 64, beaches: 58, forests: 58, landscape: 60, wildlife: 58,
  architecture: 60, cityscapes: 60, abandoned: 55, street: 50, night: 55, astro: 55, drone: 55,
};

export interface ScoreInputs {
  categories: Category[];
  sitelinks?: number | null;
  hasImage: boolean;
  photoCount: number;
  distinctPhotographers: number;
  avgDailyViews?: number | null;
  communityRatingAvg?: number | null;
  communityRatingCount?: number;
  communityLikes?: number;
  isViewpoint: boolean;
  viewpointCount: number;
  nearestParkingM: number | null;
  difficulty?: string | null;
  conditions: ConditionScores | null;
  seasonal: number;
  viewDirection?: number | null;
  sunsetAzimuth?: number | null;
  sunriseAzimuth?: number | null;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function scenicScore(i: ScoreInputs): number {
  const prior = Math.max(50, ...i.categories.map((c) => CATEGORY_PRIOR[c] ?? 50));
  const notability = Math.min(18, Math.log10(1 + (i.sitelinks ?? 0)) * 9);
  const imagery = Math.min(10, Math.log2(1 + i.photoCount) * 2) + (i.hasImage ? 3 : 0);
  const community = i.communityRatingAvg && (i.communityRatingCount ?? 0) >= 3 ? (i.communityRatingAvg - 3) * 6 : 0;
  const vp = i.isViewpoint ? 5 : 0;
  return Math.round(clamp(prior * 0.75 + notability + imagery + community + vp));
}

/** Popularity is about attention, *not* quality — kept separate on purpose. */
export function popularityScore(i: ScoreInputs): number {
  const views = Math.min(55, Math.log10(1 + (i.avgDailyViews ?? 0)) * 16);
  const links = Math.min(15, Math.log10(1 + (i.sitelinks ?? 0)) * 7);
  const photos = Math.min(20, Math.log10(1 + i.photoCount) * 12);
  const comm = Math.min(10, Math.log10(1 + (i.communityLikes ?? 0) + (i.communityRatingCount ?? 0) * 3) * 5);
  return Math.round(clamp(views + links + photos + comm));
}

function accessibility(i: ScoreInputs) {
  let s = i.nearestParkingM == null ? 45 : i.nearestParkingM < 300 ? 92 : i.nearestParkingM < 1000 ? 78 : 62;
  const d = i.difficulty ?? '';
  if (/demanding|alpine|T4|T5|T6/.test(d)) s -= 30;
  else if (/mountain_hiking|T2|T3/.test(d)) s -= 12;
  return clamp(s);
}

function angDiff(a: number, b: number) { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; }

function goldenSuitability(i: ScoreInputs): number {
  // If the viewpoint's direction is tagged, reward alignment with sunrise or sunset (±60° = useful side/back light too)
  if (i.viewDirection != null && (i.sunsetAzimuth != null || i.sunriseAzimuth != null)) {
    const d = Math.min(
      i.sunsetAzimuth != null ? angDiff(i.viewDirection, i.sunsetAzimuth) : 180,
      i.sunriseAzimuth != null ? angDiff(i.viewDirection, i.sunriseAzimuth) : 180,
    );
    return clamp(100 - d * 0.6);
  }
  const open = i.categories.some((c) => ['mountains', 'coastlines', 'lakes', 'beaches', 'landscape'].includes(c));
  return open ? 70 : 55;
}

export function photoScore(i: ScoreInputs): { score: number; breakdown: ScoreBreakdown } {
  const c = i.conditions;
  const best = c ? Math.max(c.sunrise ?? 0, c.sunset ?? 0, c.astro ?? 0) : null;
  const golden = c ? (c.golden ?? Math.max(c.sunrise ?? 0, c.sunset ?? 0)) : null;
  const b: ScoreBreakdown = {
    scenic: scenicScore(i),
    diversity: clamp(new Set(i.categories).size * 14 + Math.min(40, i.distinctPhotographers * 4)),
    weather: best,
    golden: golden != null ? Math.round((golden + goldenSuitability(i)) / 2) : goldenSuitability(i),
    clouds: c ? Math.max(c.sunrise ?? 0, c.sunset ?? 0) : null,
    seasonal: i.seasonal,
    accessibility: accessibility(i),
    viewpoints: clamp(i.isViewpoint ? 55 + i.viewpointCount * 10 : 30 + i.viewpointCount * 15),
  };
  const weights: [keyof ScoreBreakdown, number][] = [
    ['scenic', 0.32], ['weather', 0.16], ['golden', 0.1], ['clouds', 0.06], ['seasonal', 0.1],
    ['accessibility', 0.09], ['viewpoints', 0.09], ['diversity', 0.08],
  ];
  let sum = 0, w = 0;
  for (const [k, wt] of weights) {
    const v = b[k];
    if (v == null) continue; // missing data → renormalise instead of guessing
    sum += v * wt; w += wt;
  }
  return { score: Math.round(sum / w), breakdown: b };
}

export const isHiddenGem = (scenic: number, popularity: number) => scenic >= 62 && popularity <= 28;
