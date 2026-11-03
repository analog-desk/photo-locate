import { astroNight } from './astro';
import type { Category } from './types';

/**
 * Best-months heuristics. Clearly flagged as heuristics in the UI.
 * Astro months are *computed* (Milky Way core altitude during moonless astronomical darkness, mid-month).
 */
const NORTH: Partial<Record<Category, { months: number[]; reason: string }>> = {
  forests: { months: [9, 10, 11, 4, 5], reason: 'Autumn colour and fresh spring foliage' },
  waterfalls: { months: [4, 5, 6], reason: 'Peak flow during spring snowmelt' },
  mountains: { months: [6, 7, 8, 9, 10], reason: 'Snow-free access to high trails; alpenglow' },
  lakes: { months: [9, 10, 5, 6], reason: 'Calm mornings with mist and reflections' },
  beaches: { months: [5, 6, 7, 8, 9], reason: 'Long evenings and warm light' },
  coastlines: { months: [10, 11, 12, 1, 2], reason: 'Storm swell and dramatic skies' },
  cityscapes: { months: [11, 12, 1], reason: 'Early blue hour and festive lights' },
  wildlife: { months: [4, 5, 9, 10], reason: 'Migration and breeding seasons (species-dependent)' },
};

const shift = (m: number) => ((m + 5) % 12) + 1; // +6 months for southern hemisphere

export function bestMonths(categories: Category[], lat: number, lng: number): { months: number[]; reason: string; heuristic: boolean } | null {
  const tropical = Math.abs(lat) < 23.4;
  if (categories.includes('astro') || categories.includes('night')) {
    const year = new Date().getUTCFullYear();
    const good: number[] = [];
    for (let m = 1; m <= 12; m++) {
      const n = astroNight(`${year}-${String(m).padStart(2, '0')}-15`, lat, lng, null, 20);
      if (n.milkyWay.bestElevation != null && n.milkyWay.bestElevation > 15) good.push(m);
    }
    if (good.length) return { months: good, reason: 'Months when the Milky Way core rises above 15° during astronomical darkness (computed)', heuristic: false };
  }
  if (tropical) return null; // seasons in the tropics are wet/dry, not reliably derivable here
  for (const c of categories) {
    const h = NORTH[c];
    if (h) return { months: lat >= 0 ? h.months : h.months.map(shift), reason: h.reason, heuristic: true };
  }
  return null;
}

export function seasonalRelevance(best: { months: number[] } | null, date = new Date()): number {
  if (!best) return 60;
  const m = date.getUTCMonth() + 1;
  if (best.months.includes(m)) return 100;
  if (best.months.includes((m % 12) + 1)) return 80; // coming up next month
  return 45;
}
