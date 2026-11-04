import type { Forecast } from './openMeteo';
import { hourIndex } from './openMeteo';
import { astroNight, sunDay } from '../astro';
import { fmtShort, fmtSpeed } from '../units';

/**
 * Photography condition heuristics derived from forecast data.
 * These are *indicators of potential*, never guarantees — the UI must say so.
 */
export interface HourConditions {
  idx: number;
  time: string;
  total: number; low: number; mid: number; high: number;
  precipProb: number; precip: number;
  visibilityM: number | null;
  wind: number; gust: number;
  humidity: number; dewSpread: number | null;
}

export function hourAt(f: Forecast, iso: string | null): HourConditions | null {
  if (!iso) return null;
  const i = hourIndex(f, iso);
  if (i < 0) return null;
  const h = f.hourly;
  const n = (v: number | null | undefined, d = 0) => (v == null ? d : v);
  const t = h.temperature_2m[i], dp = h.dew_point_2m[i];
  return {
    idx: i,
    time: f.hourlyUtc[i],
    total: n(h.cloud_cover[i]), low: n(h.cloud_cover_low[i]), mid: n(h.cloud_cover_mid[i]), high: n(h.cloud_cover_high[i]),
    precipProb: n(h.precipitation_probability[i]), precip: n(h.precipitation[i]),
    visibilityM: h.visibility[i] ?? null,
    wind: n(h.wind_speed_10m[i]), gust: n(h.wind_gusts_10m[i]),
    humidity: n(h.relative_humidity_2m[i]),
    dewSpread: t != null && dp != null ? t - dp : null,
  };
}

const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));

/**
 * Sunrise/sunset colour potential. Best case: mid/high clouds 25–70 % to catch light,
 * low clouds < 30 % (low cloud near the horizon blocks the sun), dry, good visibility.
 */
export function sunEventScore(c: HourConditions): number {
  const canvas = Math.max(c.mid, c.high);
  const canvasScore = canvas < 10 ? 45 : canvas <= 70 ? 60 + (Math.min(canvas, 50) - 10) : clamp(100 - (canvas - 70) * 2);
  const lowPenalty = c.low <= 20 ? 0 : (c.low - 20) * 0.9;
  const rainPenalty = c.precipProb * 0.35 + Math.min(c.precip, 5) * 6;
  const visPenalty = c.visibilityM != null && c.visibilityM < 5000 ? (5000 - c.visibilityM) / 200 : 0;
  return Math.round(clamp(canvasScore + 10 - lowPenalty - rainPenalty - visPenalty));
}

/** Blue hour benefits from clear-to-moderate skies and calm air (reflections, long exposures). */
export function blueHourScore(c: HourConditions): number {
  const cloud = c.total <= 40 ? 0 : (c.total - 40) * 0.6;
  return Math.round(clamp(95 - cloud - c.precipProb * 0.4 - Math.max(0, c.wind - 15) * 1.2));
}

export function fogPotential(c: HourConditions): number {
  let s = 0;
  if (c.visibilityM != null && c.visibilityM < 1000) s += 55;
  else if (c.visibilityM != null && c.visibilityM < 4000) s += 25;
  if (c.dewSpread != null && c.dewSpread < 1.5) s += 25;
  if (c.humidity >= 95) s += 15;
  if (c.wind < 8) s += 10;
  if (c.low > 70) s += 5;
  return clamp(s);
}

export interface ConditionInsight {
  kind: 'sunrise' | 'sunset' | 'fog' | 'astro' | 'wind' | 'rain' | 'drama' | 'snow' | 'heat';
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'warning';
  title: string;
  detail: string;
  time?: string;
}

export interface DayOutlook {
  date: string;
  sunrise: { time: string | null; score: number | null; hour: HourConditions | null };
  sunset: { time: string | null; score: number | null; hour: HourConditions | null };
  blueEvening: number | null;
  astro: { score: number | null; cloud: number | null; darkStart: string | null; mwBest: string | null };
  fogMorning: number | null;
  insights: ConditionInsight[];
}

function levelOf(score: number): ConditionInsight['level'] {
  return score >= 75 ? 'excellent' : score >= 58 ? 'good' : score >= 40 ? 'fair' : 'poor';
}

export function dayOutlook(f: Forecast, date: string, lat: number, lng: number, categories: string[] = []): DayOutlook {
  const sd = sunDay(date, lat, lng, f.timezone);
  const sr = hourAt(f, sd.sunrise), ss = hourAt(f, sd.sunset);
  const be = hourAt(f, sd.blueEvening.start);
  const night = astroNight(date, lat, lng, f.timezone);
  const midnightIso = night.darkStart && night.darkEnd
    ? new Date((Date.parse(night.darkStart) + Date.parse(night.darkEnd)) / 2).toISOString() : null;
  const nh = hourAt(f, midnightIso);
  const insights: ConditionInsight[] = [];
  const srScore = sr ? sunEventScore(sr) : null;
  const ssScore = ss ? sunEventScore(ss) : null;
  if (sr && srScore != null) {
    insights.push({ kind: 'sunrise', level: levelOf(srScore), time: sd.sunrise ?? undefined,
      title: `${cap(levelOf(srScore))} sunrise potential`,
      detail: `Low ${sr.low}% · mid ${sr.mid}% · high ${sr.high}% cloud, ${sr.precipProb}% rain chance.` });
  }
  if (ss && ssScore != null) {
    insights.push({ kind: 'sunset', level: levelOf(ssScore), time: sd.sunset ?? undefined,
      title: `${cap(levelOf(ssScore))} sunset potential`,
      detail: `Low ${ss.low}% · mid ${ss.mid}% · high ${ss.high}% cloud, ${ss.precipProb}% rain chance.` });
  }
  for (const [c, label] of [[sr, 'sunrise'], [ss, 'sunset']] as const) {
    if (c && Math.max(c.mid, c.high) >= 35 && Math.max(c.mid, c.high) <= 75 && c.low < 30 && c.precipProb < 30) {
      insights.push({ kind: 'drama', level: 'good', time: c.time, title: `Potential dramatic clouds at ${label}`,
        detail: 'Broken mid/high cloud with a fairly open horizon can light up — though nothing is guaranteed.' });
      break;
    }
  }
  const fog = sr ? fogPotential(sr) : null;
  if (fog != null && fog >= 50) {
    insights.push({ kind: 'fog', level: fog >= 75 ? 'excellent' : 'good', time: sd.sunrise ?? undefined, title: 'Fog potential around sunrise',
      detail: `Visibility ${sr!.visibilityM != null ? fmtShort(sr!.visibilityM) : 'n/a'}, dew-point spread ${sr!.dewSpread?.toFixed(1) ?? 'n/a'}°C. Valleys and lakes are most likely to hold mist.` });
  }
  let astroScore: number | null = null;
  if (nh && night.darkStart) {
    astroScore = Math.round(clamp(night.rating * (1 - nh.total / 100) - nh.precipProb * 0.3));
    if (nh.total <= 20 && night.moonFreeDarkMinutes >= 90) {
      insights.push({ kind: 'astro', level: astroScore >= 70 ? 'excellent' : 'good', time: night.darkStart,
        title: 'Clear astrophotography conditions forecast',
        detail: `${nh.total}% cloud near midnight, ${Math.round(night.moonFreeDarkMinutes / 60 * 10) / 10} h of moon-free darkness.` +
          (night.milkyWay.bestTime ? ' Milky Way core visible.' : '') });
    }
  } else if (!night.darkStart) {
    insights.push({ kind: 'astro', level: 'poor', title: 'No astronomical darkness tonight', detail: 'The sun never drops 18° below the horizon at this latitude/date.' });
  }
  const dayIdx = f.daily.time.indexOf(date);
  if (dayIdx >= 0) {
    const gust = f.daily.wind_gusts_10m_max[dayIdx] ?? 0;
    const rainP = f.daily.precipitation_probability_max[dayIdx] ?? 0;
    const snow = f.daily.snowfall_sum[dayIdx] ?? 0;
    if (gust >= 50) insights.push({ kind: 'wind', level: 'warning', title: 'Strong winds', detail: `Gusts up to ${fmtSpeed(gust)} — tripod stability, drone flight and exposed ridges are affected.` });
    else if (gust >= 30 && categories.includes('drone')) insights.push({ kind: 'wind', level: 'warning', title: 'Gusty for drones', detail: `Gusts to ${fmtSpeed(gust)} — check your aircraft's wind limits.` });
    if (rainP >= 60) insights.push({ kind: 'rain', level: 'warning', title: 'Rain risk', detail: `Up to ${rainP}% precipitation probability. Protect your gear; waterfalls may flow strongly.` });
    if (snow > 0.5) insights.push({ kind: 'snow', level: 'good', title: 'Fresh snowfall forecast', detail: `${(snow / 2.54).toFixed(1)} in expected — beautiful but check road and trail conditions.` });
  }
  return {
    date,
    sunrise: { time: sd.sunrise, score: srScore, hour: sr },
    sunset: { time: sd.sunset, score: ssScore, hour: ss },
    blueEvening: be ? blueHourScore(be) : null,
    astro: { score: astroScore, cloud: nh?.total ?? null, darkStart: night.darkStart, mwBest: night.milkyWay.bestTime },
    fogMorning: fog,
    insights,
  };
}

function cap(s: string) { return s[0].toUpperCase() + s.slice(1); }
