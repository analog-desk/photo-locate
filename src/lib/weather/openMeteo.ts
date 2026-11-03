import { fetchJson } from '../http';

/** Open-Meteo: free, no key, CC BY 4.0 (attribution required). https://open-meteo.com/en/terms */
export const OPEN_METEO_ATTRIBUTION = { text: 'Weather data by Open-Meteo.com (CC BY 4.0)', url: 'https://open-meteo.com/' };

const HOURLY = [
  'temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation',
  'rain', 'snowfall', 'snow_depth', 'weather_code', 'pressure_msl', 'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid',
  'cloud_cover_high', 'visibility', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'uv_index', 'is_day',
] as const;
const DAILY = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset', 'uv_index_max', 'precipitation_sum',
  'precipitation_probability_max', 'snowfall_sum', 'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant',
] as const;
const CURRENT = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'precipitation', 'weather_code', 'cloud_cover',
  'pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
] as const;

export type HourlyKey = (typeof HOURLY)[number];
export type DailyKey = (typeof DAILY)[number];

export interface Forecast {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  utcOffsetSeconds: number;
  fetchedAt: string;
  current: Record<(typeof CURRENT)[number], number> & { time: string };
  hourly: { time: string[] } & Record<HourlyKey, (number | null)[]>;
  daily: { time: string[]; sunrise: string[]; sunset: string[] } & Record<Exclude<DailyKey, 'sunrise' | 'sunset'>, (number | null)[]>;
  /** Hourly times converted to UTC ISO instants (Open-Meteo returns local wall-clock). */
  hourlyUtc: string[];
}

export async function getForecast(lat: number, lng: number, days = 7): Promise<Forecast> {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    hourly: HOURLY.join(','),
    daily: DAILY.join(','),
    current: CURRENT.join(','),
    timezone: 'auto',
    forecast_days: String(days),
    wind_speed_unit: 'kmh',
  });
  const raw = await fetchJson<any>(`https://api.open-meteo.com/v1/forecast?${p}`, { provider: 'open-meteo', revalidate: 1800 });
  const off = raw.utc_offset_seconds as number;
  const toUtc = (local: string) => new Date(Date.parse(local + 'Z') - off * 1000).toISOString();
  return {
    latitude: raw.latitude,
    longitude: raw.longitude,
    elevation: raw.elevation,
    timezone: raw.timezone,
    utcOffsetSeconds: off,
    fetchedAt: new Date().toISOString(),
    current: raw.current,
    hourly: raw.hourly,
    daily: raw.daily,
    hourlyUtc: (raw.hourly.time as string[]).map(toUtc),
  };
}

/** Elevation (Copernicus DEM GLO-90) via Open-Meteo. */
export async function getElevations(points: { lat: number; lng: number }[]): Promise<number[]> {
  if (!points.length) return [];
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const p = new URLSearchParams({
      latitude: chunk.map((c) => c.lat.toFixed(5)).join(','),
      longitude: chunk.map((c) => c.lng.toFixed(5)).join(','),
    });
    const r = await fetchJson<{ elevation: number[] }>(`https://api.open-meteo.com/v1/elevation?${p}`, { provider: 'open-meteo', revalidate: 86400 * 30 });
    out.push(...r.elevation);
  }
  return out;
}

/** Index of the hourly slot nearest to an instant. */
export function hourIndex(f: Forecast, instantIso: string): number {
  const t = Date.parse(instantIso);
  let best = -1, bestD = Infinity;
  for (let i = 0; i < f.hourlyUtc.length; i++) {
    const d = Math.abs(Date.parse(f.hourlyUtc[i]) - t);
    if (d < bestD) { bestD = d; best = i; }
  }
  return bestD <= 90 * 60000 ? best : -1;
}

export const WMO: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Rain showers', 81: 'Rain showers',
  82: 'Violent rain showers', 85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm',
  96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

/** Many forecasts in one request (Open-Meteo supports comma-separated coordinates). */
export async function getForecastMulti(points: { lat: number; lng: number }[], days = 3): Promise<Forecast[]> {
  const out: Forecast[] = [];
  for (let i = 0; i < points.length; i += 50) {
    const chunk = points.slice(i, i + 50);
    const p = new URLSearchParams({
      latitude: chunk.map((c) => c.lat.toFixed(4)).join(','),
      longitude: chunk.map((c) => c.lng.toFixed(4)).join(','),
      hourly: HOURLY.join(','), daily: DAILY.join(','), current: CURRENT.join(','),
      timezone: 'auto', forecast_days: String(days),
    });
    const raw = await fetchJson<any>(`https://api.open-meteo.com/v1/forecast?${p}`, { provider: 'open-meteo', revalidate: 1800 });
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const r of arr) {
      const off = r.utc_offset_seconds as number;
      out.push({
        latitude: r.latitude, longitude: r.longitude, elevation: r.elevation, timezone: r.timezone, utcOffsetSeconds: off,
        fetchedAt: new Date().toISOString(), current: r.current, hourly: r.hourly, daily: r.daily,
        hourlyUtc: (r.hourly.time as string[]).map((t) => new Date(Date.parse(t + 'Z') - off * 1000).toISOString()),
      });
    }
  }
  return out;
}
