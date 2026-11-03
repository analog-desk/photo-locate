import { astroNight, moonDay, sunDay, sunPosition, moonPosition, type Window } from './astro';
import type { DayOutlook } from './weather/conditions';
import type { Forecast } from './weather/openMeteo';
import { hourAt } from './weather/conditions';
import type { LocationDetail } from './types';
import { compositionTips } from './compositions';

export const TARGETS = {
  sunrise: 'Sunrise', sunset: 'Sunset', golden_am: 'Morning golden hour', golden_pm: 'Evening golden hour',
  blue_am: 'Morning blue hour', blue_pm: 'Evening blue hour', astro: 'Night sky / Milky Way',
} as const;
export type Target = keyof typeof TARGETS;

export interface ShootPlan {
  target: Target; date: string; window: Window;
  arrivalAtParking: string | null; arrivalAtSpot: string | null;
  walkMin: number | null; walkVerified: boolean; setupMin: number;
  sunAzimuth: number | null; sunElevation: number | null;
  moon: { phase: string; illumination: number; rise: string | null; set: string | null; azimuth: number | null; elevation: number | null };
  weather: { available: boolean; cloud?: { total: number; low: number; mid: number; high: number }; wind?: number; gust?: number; precipProb?: number; score?: number | null; insights?: DayOutlook['insights'] };
  milkyWay?: ReturnType<typeof astroNight>['milkyWay'];
  subjects: string[];
}

export function buildPlan(l: LocationDetail, date: string, target: Target, f: Forecast | null, outlook: DayOutlook | null): ShootPlan {
  const sd = sunDay(date, l.lat, l.lng, l.timezone, l.elevation.value ?? 0);
  const night = astroNight(date, l.lat, l.lng, l.timezone);
  const md = moonDay(date, l.lat, l.lng, l.timezone);
  const pad = (iso: string | null, min: number) => (iso ? new Date(Date.parse(iso) + min * 60000).toISOString() : null);
  const window: Window = {
    sunrise: { start: pad(sd.sunrise, -20), end: pad(sd.sunrise, 25) },
    sunset: { start: pad(sd.sunset, -25), end: pad(sd.sunset, 20) },
    golden_am: sd.goldenMorning, golden_pm: sd.goldenEvening, blue_am: sd.blueMorning, blue_pm: sd.blueEvening,
    astro: { start: night.milkyWay.visibleStart ?? night.darkStart, end: night.milkyWay.visibleEnd ?? night.darkEnd },
  }[target];
  // Arrive early enough for blue hour before a sunrise shoot; 20 min setup (30 at night).
  const setupMin = target === 'astro' ? 30 : 20;
  const p = l.parking[0];
  const walkMin = p?.walkingTimeMin.value ?? null;
  const arrivalAtSpot = window.start ? new Date(Date.parse(window.start) - setupMin * 60000).toISOString() : null;
  const arrivalAtParking = arrivalAtSpot && walkMin != null ? new Date(Date.parse(arrivalAtSpot) - walkMin * 60000).toISOString() : null;
  const mid = window.start && window.end ? new Date((Date.parse(window.start) + Date.parse(window.end)) / 2) : null;
  const sun = mid ? sunPosition(mid, l.lat, l.lng) : null;
  const moon = mid ? moonPosition(mid, l.lat, l.lng) : null;
  const h = f && mid ? hourAt(f, mid.toISOString()) : null;
  const score = !outlook ? null : target === 'sunrise' || target === 'golden_am' ? outlook.sunrise.score : target === 'sunset' || target === 'golden_pm' ? outlook.sunset.score
    : target === 'blue_pm' ? outlook.blueEvening : target === 'astro' ? outlook.astro.score : null;
  return {
    target, date, window, arrivalAtParking, arrivalAtSpot, walkMin, walkVerified: !!p?.walkingTimeMin.verified, setupMin,
    sunAzimuth: sun?.azimuth ?? null, sunElevation: sun?.elevation ?? null,
    moon: { phase: md.phaseName, illumination: md.illumination, rise: md.rise, set: md.set, azimuth: moon?.azimuth ?? null, elevation: moon?.elevation ?? null },
    weather: h ? { available: true, cloud: { total: h.total, low: h.low, mid: h.mid, high: h.high }, wind: h.wind, gust: h.gust, precipProb: h.precipProb, score, insights: outlook?.insights } : { available: false },
    milkyWay: target === 'astro' ? night.milkyWay : undefined,
    subjects: compositionTips(l.categories),
  };
}
