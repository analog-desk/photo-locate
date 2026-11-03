'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, Cloud, CloudFog, Droplets, Eye, Gauge, Loader2, Snowflake, Sparkles, Sun, Sunrise, Sunset, Thermometer, Wind } from 'lucide-react';
import type { Forecast } from '@/lib/weather/openMeteo';
import { WMO } from '@/lib/weather/openMeteo';
import type { DayOutlook, ConditionInsight } from '@/lib/weather/conditions';
import { formatInTz } from '@/lib/astro';
import { compassPoint } from '@/lib/geo';

export interface WeatherData { forecast: Forecast; outlooks: DayOutlook[]; attribution: { text: string; url: string } }

export function useWeather(lat: number | null, lng: number | null, cats: string[] = []) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = cats.join(',');
  useEffect(() => {
    if (lat == null || lng == null) return;
    let alive = true;
    setLoading(true); setErr(null);
    fetch(`/api/weather?lat=${lat}&lng=${lng}&cats=${key}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; })
      .then((j) => alive && setData(j))
      .catch((e) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [lat, lng, key]);
  return { data, err, loading };
}

const LEVEL: Record<ConditionInsight['level'], string> = {
  excellent: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200', good: 'border-gold-400/40 bg-gold-400/10 text-gold-200',
  fair: 'border-white/10 bg-white/5 text-zinc-300', poor: 'border-white/5 bg-white/[.02] text-zinc-500', warning: 'border-rose-400/40 bg-rose-400/10 text-rose-200',
};
const KIND_ICON = { sunrise: Sunrise, sunset: Sunset, fog: CloudFog, astro: Sparkles, wind: Wind, rain: Droplets, drama: Cloud, snow: Snowflake, heat: Thermometer };

export function Insights({ items, tz }: { items: ConditionInsight[]; tz: string | null }) {
  if (!items.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((i, k) => {
        const Icon = KIND_ICON[i.kind] ?? AlertTriangle;
        return (
          <div key={k} className={`rounded-xl border px-3 py-2 ${LEVEL[i.level]}`}>
            <p className="flex items-center gap-2 text-sm font-medium"><Icon size={15} />{i.title}{i.time && <span className="ml-auto font-mono text-xs opacity-80">{formatInTz(i.time, tz)}</span>}</p>
            <p className="mt-0.5 text-xs opacity-80">{i.detail}</p>
          </div>
        );
      })}
    </div>
  );
}

function CloudChart({ f, hours = 48 }: { f: Forecast; hours?: number }) {
  const now = Date.now();
  const start = Math.max(0, f.hourlyUtc.findIndex((t) => Date.parse(t) >= now - 3600_000));
  const idx = Array.from({ length: Math.min(hours, f.hourlyUtc.length - start) }, (_, i) => start + i);
  const Wd = 720, H = 150, bw = Wd / idx.length;
  const layer = (key: 'cloud_cover_low' | 'cloud_cover_mid' | 'cloud_cover_high', y0: number, color: string) =>
    idx.map((i, k) => <rect key={key + k} x={k * bw} y={y0} width={bw - 0.5} height={30} fill={color} opacity={((f.hourly[key][i] ?? 0) / 100) * 0.95 + 0.03} />);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${Wd} ${H}`} className="min-w-[640px] w-full" role="img" aria-label="Cloud layers, rain probability and daylight over the next 48 hours">
        {idx.map((i, k) => <rect key={'d' + k} x={k * bw} y={0} width={bw} height={H - 18} fill={f.hourly.is_day[i] ? 'rgba(255,197,107,.04)' : 'rgba(83,113,220,.06)'} />)}
        {layer('cloud_cover_high', 4, '#e4e4e7')}{layer('cloud_cover_mid', 38, '#a1a1aa')}{layer('cloud_cover_low', 72, '#71717a')}
        {idx.map((i, k) => <rect key={'p' + k} x={k * bw} y={132 - ((f.hourly.precipitation_probability[i] ?? 0) / 100) * 26} width={bw - 0.5} height={((f.hourly.precipitation_probability[i] ?? 0) / 100) * 26} fill="#38bdf8" opacity={0.7} />)}
        {idx.map((i, k) => k % 6 === 0 && <text key={'t' + k} x={k * bw + 2} y={H - 4} className="fill-zinc-500 text-[10px]">{formatInTz(f.hourlyUtc[i], f.timezone, { weekday: 'short', hour: '2-digit' })}</text>)}
        <text x={4} y={16} className="fill-ink-950 text-[10px] font-semibold">HIGH</text><text x={4} y={50} className="fill-ink-950 text-[10px] font-semibold">MID</text><text x={4} y={84} className="fill-zinc-100 text-[10px] font-semibold">LOW</text>
        <text x={4} y={128} className="fill-sky-300 text-[10px]">RAIN %</text>
      </svg>
    </div>
  );
}

export function WeatherPanel({ lat, lng, cats = [], compact }: { lat: number; lng: number; cats?: string[]; compact?: boolean }) {
  const { data, err, loading } = useWeather(lat, lng, cats);
  if (loading && !data) return <div className="card flex items-center gap-2 p-6 text-sm text-zinc-400"><Loader2 className="animate-spin" size={16} /> Loading forecast…</div>;
  if (err) return <div className="card p-6 text-sm text-rose-300">Live weather is unavailable right now ({err}). No forecast is shown rather than a guess.</div>;
  if (!data) return null;
  const f = data.forecast, c = f.current, tz = f.timezone;
  const today = data.outlooks[0];
  const stat = (Icon: typeof Wind, label: string, value: string) => (
    <div className="rounded-xl bg-white/5 px-3 py-2"><p className="label flex items-center gap-1"><Icon size={11} />{label}</p><p className="mt-0.5 text-sm text-zinc-100">{value}</p></div>
  );
  const hi = f.hourlyUtc.findIndex((t) => Date.parse(t) >= Date.now() - 1800_000);
  const vis = hi >= 0 ? f.hourly.visibility[hi] : null;
  const uv = hi >= 0 ? f.hourly.uv_index[hi] : null;
  const snowDepth = hi >= 0 ? f.hourly.snow_depth[hi] : null;
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="label">Now · {formatInTz(c.time ? new Date(Date.parse(c.time + 'Z') - f.utcOffsetSeconds * 1000).toISOString() : null, tz)}</p>
            <p className="h-display text-5xl">{Math.round(c.temperature_2m)}°<span className="text-xl text-zinc-400">C</span></p>
            <p className="text-sm text-zinc-300">{WMO[c.weather_code] ?? '—'} · feels {Math.round(c.apparent_temperature)}°</p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
            {stat(Cloud, 'Cloud', `${c.cloud_cover}%`)}
            {stat(Wind, 'Wind', `${Math.round(c.wind_speed_10m)} km/h ${compassPoint(c.wind_direction_10m)}`)}
            {stat(Wind, 'Gusts', `${Math.round(c.wind_gusts_10m)} km/h`)}
            {stat(Droplets, 'Humidity', `${c.relative_humidity_2m}%`)}
            {stat(Gauge, 'Pressure', `${Math.round(c.pressure_msl)} hPa`)}
            {stat(Eye, 'Visibility', vis != null ? (vis >= 1000 ? `${(vis / 1000).toFixed(vis < 10000 ? 1 : 0)} km` : `${Math.round(vis)} m`) : 'n/a')}
            {stat(Sun, 'UV index', uv != null ? uv.toFixed(1) : 'n/a')}
            {stat(Snowflake, 'Snow depth', snowDepth != null && snowDepth > 0 ? `${Math.round(snowDepth * 100)} cm` : 'none')}
          </div>
        </div>
      </div>
      {today && <Insights items={today.insights} tz={tz} />}
      {!compact && (
        <>
          <div className="card p-4"><p className="label mb-2">Next 48 h · cloud layers & rain probability</p><CloudChart f={f} /></div>
          <div className="card overflow-x-auto p-2">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="p-2">Day</th><th className="p-2">Sky</th><th className="p-2">Temp</th><th className="p-2">Rain</th><th className="p-2">Wind / gusts</th>
                <th className="p-2">Sunrise</th><th className="p-2">Sunset</th><th className="p-2">Astro</th><th className="p-2">Fog</th></tr></thead>
              <tbody>
                {f.daily.time.map((d, i) => {
                  const o = data.outlooks[i];
                  const sc = (v: number | null | undefined) => v == null ? <span className="text-zinc-600">—</span> : <span className={v >= 70 ? 'text-emerald-300' : v >= 50 ? 'text-gold-300' : 'text-zinc-400'}>{v}</span>;
                  return (
                    <tr key={d} className="border-t border-white/5">
                      <td className="p-2 text-zinc-200">{new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</td>
                      <td className="p-2 text-zinc-400">{WMO[f.daily.weather_code[i] ?? -1] ?? '—'}</td>
                      <td className="p-2 font-mono">{Math.round(f.daily.temperature_2m_min[i] ?? 0)}° / {Math.round(f.daily.temperature_2m_max[i] ?? 0)}°</td>
                      <td className="p-2 font-mono">{f.daily.precipitation_probability_max[i] ?? 0}% · {(f.daily.precipitation_sum[i] ?? 0).toFixed(1)} mm</td>
                      <td className="p-2 font-mono">{Math.round(f.daily.wind_speed_10m_max[i] ?? 0)} / {Math.round(f.daily.wind_gusts_10m_max[i] ?? 0)}</td>
                      <td className="p-2">{sc(o?.sunrise.score)}</td><td className="p-2">{sc(o?.sunset.score)}</td><td className="p-2">{sc(o?.astro.score)}</td><td className="p-2">{sc(o?.fogMorning)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[11px] text-zinc-500">Photo ratings (0–100) are derived from forecast cloud layers, rain, visibility and wind. They show potential, not guaranteed outcomes. <a className="underline" href={data.attribution.url} target="_blank" rel="noreferrer">{data.attribution.text}</a> · fetched {formatInTz(f.fetchedAt, tz)}</p>
    </div>
  );
}
