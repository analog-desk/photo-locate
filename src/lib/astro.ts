import * as SunCalc from 'suncalc';
import type { LightPhase, Season } from './types';

/**
 * Photographic light definitions (sun altitude in degrees):
 *   golden hour:  -4°  … +6°
 *   blue hour:    -6°  … -4°
 *   civil:         0°  … -6°   (sunset → dusk)
 *   nautical:     -6°  … -12°
 *   astronomical: -12° … -18°
 *   night:        < -18°
 */
let registered = false;
function ensureCustomTimes() {
  if (registered) return;
  if (!SunCalc.times.some((t) => t[1] === 'blueHourEnd')) SunCalc.addTime(-4, 'blueHourEnd', 'blueHourStart');
  registered = true;
}

/** Offset in minutes (positive east of UTC) of IANA zone `tz` at instant `date`. */
export function tzOffsetMinutes(tz: string | null | undefined, date: Date): number {
  if (!tz) return -date.getTimezoneOffset();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date);
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    return Math.round((asUTC - date.getTime()) / 60000);
  } catch {
    return -date.getTimezoneOffset();
  }
}

/** Midday (12:00 local) of the civil date `ymd` (YYYY-MM-DD) in zone `tz`, as a UTC instant. */
export function localNoon(ymd: string, tz: string | null | undefined): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 12));
  return new Date(guess.getTime() - tzOffsetMinutes(tz, guess) * 60000);
}

export function todayIn(tz: string | null | undefined, now = new Date()): string {
  const off = tzOffsetMinutes(tz, now);
  return new Date(now.getTime() + off * 60000).toISOString().slice(0, 10);
}

export interface Window { start: string | null; end: string | null }

export interface SunDay {
  date: string;
  timezone: string | null;
  sunrise: string | null;
  sunset: string | null;
  solarNoon: string;
  daylightMinutes: number | null;
  goldenMorning: Window;
  goldenEvening: Window;
  blueMorning: Window;
  blueEvening: Window;
  civilTwilight: { morning: Window; evening: Window };
  nauticalTwilight: { morning: Window; evening: Window };
  astronomicalTwilight: { morning: Window; evening: Window };
  sunriseAzimuth: number | null;
  sunsetAzimuth: number | null;
  noonElevation: number;
  polar: 'day' | 'night' | null;
}

const iso = (d: Date | null | undefined | boolean) => (d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : null);

export function sunPosition(date: Date, lat: number, lng: number) {
  const p = SunCalc.getPosition(date, lat, lng);
  return { azimuth: p.azimuth, elevation: p.altitude };
}

export function moonPosition(date: Date, lat: number, lng: number) {
  const p = SunCalc.getMoonPosition(date, lat, lng);
  return { azimuth: p.azimuth, elevation: p.altitude, distanceKm: p.distance };
}

export function sunDay(ymd: string, lat: number, lng: number, tz: string | null, elevationM = 0): SunDay {
  ensureCustomTimes();
  const noon = localNoon(ymd, tz);
  const off = tzOffsetMinutes(tz, noon);
  // Observer height increases the dip of the horizon; cap to keep it meaningful for terrain-blocked sites.
  const t = SunCalc.getTimes(noon, lat, lng, Math.max(0, Math.min(elevationM, 3000)), off) as Record<string, Date | null | boolean>;
  const d = (k: string) => (t[k] instanceof Date ? (t[k] as Date) : null);
  const sunrise = d('sunrise'), sunset = d('sunset');
  return {
    date: ymd,
    timezone: tz,
    sunrise: iso(sunrise),
    sunset: iso(sunset),
    solarNoon: iso(d('solarNoon'))!,
    daylightMinutes: sunrise && sunset ? Math.round((sunset.getTime() - sunrise.getTime()) / 60000) : t.alwaysUp ? 1440 : t.alwaysDown ? 0 : null,
    goldenMorning: { start: iso(d('blueHourEnd')), end: iso(d('goldenHourEnd')) },
    goldenEvening: { start: iso(d('goldenHour')), end: iso(d('blueHourStart')) },
    blueMorning: { start: iso(d('dawn')), end: iso(d('blueHourEnd')) },
    blueEvening: { start: iso(d('blueHourStart')), end: iso(d('dusk')) },
    civilTwilight: { morning: { start: iso(d('dawn')), end: iso(sunrise) }, evening: { start: iso(sunset), end: iso(d('dusk')) } },
    nauticalTwilight: { morning: { start: iso(d('nauticalDawn')), end: iso(d('dawn')) }, evening: { start: iso(d('dusk')), end: iso(d('nauticalDusk')) } },
    astronomicalTwilight: { morning: { start: iso(d('nightEnd')), end: iso(d('nauticalDawn')) }, evening: { start: iso(d('nauticalDusk')), end: iso(d('night')) } },
    sunriseAzimuth: sunrise ? sunPosition(sunrise, lat, lng).azimuth : null,
    sunsetAzimuth: sunset ? sunPosition(sunset, lat, lng).azimuth : null,
    noonElevation: d('solarNoon') ? sunPosition(d('solarNoon')!, lat, lng).elevation : 0,
    polar: t.alwaysUp ? 'day' : t.alwaysDown ? 'night' : null,
  };
}

export interface MoonDay {
  date: string;
  rise: string | null;
  set: string | null;
  transit: string | null;
  alwaysUp: boolean;
  alwaysDown: boolean;
  illumination: number; // 0..1 at local noon
  phase: number;        // 0..1
  phaseName: string;
  waxing: boolean;
  riseAzimuth: number | null;
  setAzimuth: number | null;
}

export function phaseName(phase: number): string {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.0339 || p > 0.9661) return 'New Moon';
  if (p < 0.2161) return 'Waxing Crescent';
  if (p < 0.2839) return 'First Quarter';
  if (p < 0.4661) return 'Waxing Gibbous';
  if (p < 0.5339) return 'Full Moon';
  if (p < 0.7161) return 'Waning Gibbous';
  if (p < 0.7839) return 'Last Quarter';
  return 'Waning Crescent';
}

export function moonDay(ymd: string, lat: number, lng: number, tz: string | null): MoonDay {
  const noon = localNoon(ymd, tz);
  const off = tzOffsetMinutes(tz, noon);
  const mt = SunCalc.getMoonTimes(noon, lat, lng, off);
  const ill = SunCalc.getMoonIllumination(noon);
  return {
    date: ymd,
    rise: iso(mt.rise),
    set: iso(mt.set),
    transit: iso(mt.transit),
    alwaysUp: !!mt.alwaysUp,
    alwaysDown: !!mt.alwaysDown,
    illumination: ill.fraction,
    phase: ill.phase,
    phaseName: phaseName(ill.phase),
    waxing: ill.waxing,
    riseAzimuth: mt.rise ? moonPosition(mt.rise, lat, lng).azimuth : null,
    setAzimuth: mt.set ? moonPosition(mt.set, lat, lng).azimuth : null,
  };
}

export function moonIllumination(date: Date) {
  const i = SunCalc.getMoonIllumination(date);
  return { fraction: i.fraction, phase: i.phase, name: phaseName(i.phase), waxing: i.waxing };
}

export interface PathSample { t: string; azimuth: number; elevation: number }

export function sunPath(ymd: string, lat: number, lng: number, tz: string | null, stepMin = 10): PathSample[] {
  const start = localNoon(ymd, tz).getTime() - 12 * 3600_000;
  const out: PathSample[] = [];
  for (let m = 0; m <= 1440; m += stepMin) {
    const date = new Date(start + m * 60000);
    const p = sunPosition(date, lat, lng);
    out.push({ t: date.toISOString(), azimuth: p.azimuth, elevation: p.elevation });
  }
  return out;
}

export function moonPath(ymd: string, lat: number, lng: number, tz: string | null, stepMin = 10): PathSample[] {
  const start = localNoon(ymd, tz).getTime() - 12 * 3600_000;
  const out: PathSample[] = [];
  for (let m = 0; m <= 1440; m += stepMin) {
    const date = new Date(start + m * 60000);
    const p = moonPosition(date, lat, lng);
    out.push({ t: date.toISOString(), azimuth: p.azimuth, elevation: p.elevation });
  }
  return out;
}

export function lightPhaseAt(date: Date, lat: number, lng: number): LightPhase {
  const e = sunPosition(date, lat, lng).elevation;
  if (e >= 6) return 'day';
  if (e >= -4) return 'golden';
  if (e >= -6) return 'blue';
  if (e >= -12) return 'nautical';
  if (e >= -18) return 'astronomical';
  return 'night';
}

/** Meteorological season, hemisphere-aware. Tropics (|lat| < 23.4) still get a nominal season. */
export function seasonOf(date: Date, lat: number): Season {
  const m = date.getUTCMonth();
  const north: Season[] = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
  const s = north[m];
  if (lat >= 0) return s;
  return ({ winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' } as const)[s];
}

// ─── Galactic centre (Milky Way core) ────────────────────────────────────────
const GC_RA = 266.405;  // deg (J2000)
const GC_DEC = -28.936; // deg

function julianDate(d: Date) { return d.getTime() / 86400000 + 2440587.5; }

export function galacticCentrePosition(date: Date, lat: number, lng: number) {
  const jd = julianDate(date);
  const gmst = (280.46061837 + 360.98564736629 * (jd - 2451545.0)) % 360;
  const lst = (gmst + lng + 360) % 360;
  const H = ((lst - GC_RA + 360) % 360) * (Math.PI / 180);
  const φ = lat * (Math.PI / 180), δ = GC_DEC * (Math.PI / 180);
  const alt = Math.asin(Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(φ) - Math.tan(δ) * Math.cos(φ));
  return { azimuth: ((az * 180) / Math.PI + 180 + 360) % 360, elevation: (alt * 180) / Math.PI };
}

export interface AstroNight {
  date: string; // the evening date
  darkStart: string | null; // sun < -18°
  darkEnd: string | null;
  moonFreeDarkMinutes: number;
  moonIllumination: number;
  milkyWay: { visibleStart: string | null; visibleEnd: string | null; bestTime: string | null; bestAzimuth: number | null; bestElevation: number | null };
  rating: number; // 0-100 astronomical potential (ignores weather)
}

/** Darkness, moonlight & Milky Way core window for the night starting on `ymd`. */
export function astroNight(ymd: string, lat: number, lng: number, tz: string | null, stepMin = 10): AstroNight {
  const start = localNoon(ymd, tz).getTime();
  let darkStart: number | null = null, darkEnd: number | null = null;
  let moonFree = 0, mwStart: number | null = null, mwEnd: number | null = null;
  let best: { t: number; az: number; el: number } | null = null;
  for (let m = 0; m <= 1440; m += stepMin) {
    const t = start + m * 60000;
    const d = new Date(t);
    const sun = sunPosition(d, lat, lng).elevation;
    if (sun > -18) continue;
    darkStart ??= t;
    darkEnd = t;
    const moon = moonPosition(d, lat, lng);
    const ill = SunCalc.getMoonIllumination(d).fraction;
    const moonless = moon.elevation < -0.5 || ill < 0.08;
    if (moonless) moonFree += stepMin;
    const gc = galacticCentrePosition(d, lat, lng);
    if (gc.elevation > 8 && moonless) {
      mwStart ??= t;
      mwEnd = t;
      if (!best || gc.elevation > best.el) best = { t, az: gc.azimuth, el: gc.elevation };
    }
  }
  const ill = SunCalc.getMoonIllumination(new Date(start + 12 * 3600_000)).fraction;
  const mwMinutes = mwStart && mwEnd ? (mwEnd - mwStart) / 60000 : 0;
  const rating = Math.round(Math.min(100, (moonFree / 360) * 60 + Math.min(mwMinutes, 240) / 240 * 30 + (1 - ill) * 10));
  const isoT = (t: number | null) => (t ? new Date(t).toISOString() : null);
  return {
    date: ymd,
    darkStart: isoT(darkStart),
    darkEnd: isoT(darkEnd),
    moonFreeDarkMinutes: moonFree,
    moonIllumination: ill,
    milkyWay: { visibleStart: isoT(mwStart), visibleEnd: isoT(mwEnd), bestTime: isoT(best?.t ?? null), bestAzimuth: best?.az ?? null, bestElevation: best?.el ?? null },
    rating: darkStart ? rating : 0,
  };
}

export function lunarCalendar(year: number, month: number, lat: number, lng: number, tz: string | null) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => {
    const ymd = `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
    const md = moonDay(ymd, lat, lng, tz);
    return { date: ymd, illumination: md.illumination, phase: md.phase, phaseName: md.phaseName, rise: md.rise, set: md.set };
  });
}

export function formatInTz(isoStr: string | null | undefined, tz: string | null, opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }) {
  if (!isoStr) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: tz ?? undefined }).format(new Date(isoStr));
  } catch {
    return new Date(isoStr).toLocaleTimeString([], opts);
  }
}
