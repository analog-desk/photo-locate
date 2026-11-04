'use client';
import { fmtElev } from '@/lib/units';
import { useEffect, useMemo, useState } from 'react';
import { Moon, Sparkles, Sun, Sunrise, Sunset, Telescope } from 'lucide-react';
import {
  astroNight, formatInTz, galacticCentrePosition, localNoon, lunarCalendar, moonDay, moonIllumination, moonPath, moonPosition,
  sunDay, sunPath, sunPosition, todayIn, type Window,
} from '@/lib/astro';
import { compassPoint } from '@/lib/geo';
import type { MapRay } from './Map';

function polar(az: number, el: number, R: number) {
  const r = R * (1 - Math.max(0, el) / 90);
  const a = (az - 90) * (Math.PI / 180);
  return [R + r * Math.cos(a), R + r * Math.sin(a)];
}

function SkyDial({ sun, moon, path, mpath, sunrise, sunset, viewDir, mw }: {
  sun: { azimuth: number; elevation: number }; moon: { azimuth: number; elevation: number };
  path: { azimuth: number; elevation: number }[]; mpath: { azimuth: number; elevation: number }[];
  sunrise: number | null; sunset: number | null; viewDir?: number | null; mw?: { azimuth: number; elevation: number } | null;
}) {
  const R = 140, S = R * 2;
  const line = (pts: { azimuth: number; elevation: number }[]) => {
    const segs: string[] = []; let cur = '';
    for (const p of pts) {
      if (p.elevation < 0) { if (cur) segs.push(cur); cur = ''; continue; }
      const [x, y] = polar(p.azimuth, p.elevation, R);
      cur += `${cur ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    if (cur) segs.push(cur);
    return segs.join(' ');
  };
  const tick = (az: number | null, color: string) => {
    if (az == null) return null;
    const [x1, y1] = polar(az, 0, R), [x2, y2] = polar(az, -12, R + 12);
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={3} strokeLinecap="round" />;
  };
  const dot = (p: { azimuth: number; elevation: number }, fill: string, r: number, label: string) => {
    if (p.elevation < 0) return null;
    const [x, y] = polar(p.azimuth, p.elevation, R);
    return <g><circle cx={x} cy={y} r={r} fill={fill} stroke="#07080a" strokeWidth={2} /><title>{label}</title></g>;
  };
  return (
    <svg viewBox={`-20 -20 ${S + 40} ${S + 40}`} className="mx-auto w-full max-w-[340px]" role="img" aria-label="Sky dial: sun and moon paths">
      <defs><radialGradient id="sky"><stop offset="0" stopColor="#1e2a4a" /><stop offset="1" stopColor="#0c0e12" /></radialGradient></defs>
      <circle cx={R} cy={R} r={R} fill="url(#sky)" stroke="rgba(255,255,255,.15)" />
      {[30, 60].map((e) => <circle key={e} cx={R} cy={R} r={R * (1 - e / 90)} fill="none" stroke="rgba(255,255,255,.06)" strokeDasharray="3 4" />)}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const [x, y] = polar(a, 0, R + 12);
        const [lx, ly] = polar(a, 0, R);
        return <g key={a}><line x1={R} y1={R} x2={lx} y2={ly} stroke="rgba(255,255,255,.05)" /><text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="fill-zinc-500 text-[11px]">{compassPoint(a)}</text></g>;
      })}
      {viewDir != null && (() => { const [x, y] = polar(viewDir, 0, R); return <line x1={R} y1={R} x2={x} y2={y} stroke="#34d399" strokeWidth={2} strokeDasharray="5 4"><title>Tagged view direction</title></line>; })()}
      <path d={line(mpath)} fill="none" stroke="#9fb8ff" strokeWidth={1.5} strokeDasharray="2 4" opacity={0.8} />
      <path d={line(path)} fill="none" stroke="#ffc56b" strokeWidth={2.5} opacity={0.9} />
      {tick(sunrise, '#ffd89a')}{tick(sunset, '#f5a742')}
      {mw && dot(mw, '#c4b5fd', 5, 'Milky Way core')}
      {dot(moon, '#e5e7eb', 7, 'Moon')}
      {dot(sun, '#ffc56b', 9, 'Sun')}
      <text x={R} y={R} textAnchor="middle" dominantBaseline="central" className="fill-zinc-600 text-[9px]">zenith</text>
    </svg>
  );
}

const W = ({ label, w, tz, tone }: { label: string; w: Window; tz: string | null; tone: string }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
    <span className={`flex items-center gap-2 ${tone}`}><span className="h-2 w-2 rounded-full bg-current" />{label}</span>
    <span className="font-mono text-zinc-200">{formatInTz(w.start, tz)} – {formatInTz(w.end, tz)}</span>
  </div>
);

export function SunMoon({ lat, lng, tz, elevation = 0, viewDir, onRays, initialDate }: {
  lat: number; lng: number; tz: string | null; elevation?: number; viewDir?: number | null; onRays?: (rays: MapRay[]) => void; initialDate?: string;
}) {
  const [date, setDate] = useState(initialDate ?? todayIn(tz));
  const nowLocalMin = useMemo(() => {
    const midnight = localNoon(todayIn(tz), tz).getTime() - 12 * 3600_000;
    return Math.round((Date.now() - midnight) / 60000);
  }, [tz]);
  const [minute, setMinute] = useState(nowLocalMin);
  useEffect(() => { setDate(initialDate ?? todayIn(tz)); }, [tz, initialDate]);

  const midnight = localNoon(date, tz).getTime() - 12 * 3600_000;
  const at = new Date(midnight + minute * 60000);
  const sd = useMemo(() => sunDay(date, lat, lng, tz, elevation), [date, lat, lng, tz, elevation]);
  const md = useMemo(() => moonDay(date, lat, lng, tz), [date, lat, lng, tz]);
  const night = useMemo(() => astroNight(date, lat, lng, tz), [date, lat, lng, tz]);
  const path = useMemo(() => sunPath(date, lat, lng, tz, 10), [date, lat, lng, tz]);
  const mpath = useMemo(() => moonPath(date, lat, lng, tz, 15), [date, lat, lng, tz]);
  const sun = sunPosition(at, lat, lng), moon = moonPosition(at, lat, lng), mill = moonIllumination(at);
  const gc = galacticCentrePosition(at, lat, lng);
  const [y, m] = date.split('-').map(Number);
  const cal = useMemo(() => lunarCalendar(y, m, lat, lng, tz), [y, m, lat, lng, tz]);

  useEffect(() => {
    if (!onRays) return;
    const rays: MapRay[] = [];
    if (sd.sunriseAzimuth != null) rays.push({ azimuth: sd.sunriseAzimuth, color: '#ffd89a', label: 'Sunrise direction', lengthM: 4000 });
    if (sd.sunsetAzimuth != null) rays.push({ azimuth: sd.sunsetAzimuth, color: '#f5a742', label: 'Sunset direction', lengthM: 4000 });
    if (sun.elevation > -1) rays.push({ azimuth: sun.azimuth, color: '#fde047', label: `Sun at ${formatInTz(at.toISOString(), tz)}`, lengthM: 2500, dashed: true });
    if (moon.elevation > -1) rays.push({ azimuth: moon.azimuth, color: '#c7d2fe', label: `Moon at ${formatInTz(at.toISOString(), tz)}`, lengthM: 2500, dashed: true });
    if (md.riseAzimuth != null) rays.push({ azimuth: md.riseAzimuth, color: '#9fb8ff', label: 'Moonrise direction', lengthM: 3000, dashed: true });
    onRays(rays);
  }, [sd.sunriseAzimuth, sd.sunsetAzimuth, sun.azimuth, sun.elevation, moon.azimuth, moon.elevation, md.riseAzimuth, onRays, tz]); // eslint-disable-line react-hooks/exhaustive-deps

  const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const daylight = sd.daylightMinutes != null ? `${Math.floor(sd.daylightMinutes / 60)} h ${sd.daylightMinutes % 60} min` : '—';

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="input w-auto" aria-label="Date" />
          <button className="chip" onClick={() => { setDate(todayIn(tz)); setMinute(nowLocalMin); }}>Now</button>
          <span className="ml-auto text-[11px] text-zinc-500">{tz ?? 'Device time zone (location zone unknown)'}</span>
        </div>
        <SkyDial sun={sun} moon={moon} path={path} mpath={mpath} sunrise={sd.sunriseAzimuth} sunset={sd.sunsetAzimuth} viewDir={viewDir}
          mw={night.darkStart && gc.elevation > 0 ? gc : null} />
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Simulated time</span><span className="font-mono text-base text-zinc-100">{hhmm(minute)}</span>
          </div>
          <input type="range" min={0} max={1439} step={5} value={minute} onChange={(e) => setMinute(+e.target.value)} className="mt-1 w-full accent-amber-400" aria-label="Time of day" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-white/5 p-3"><p className="label flex items-center gap-1"><Sun size={12} /> Sun</p>
            <p className="mt-1 font-mono">{sun.azimuth.toFixed(1)}° {compassPoint(sun.azimuth)}</p>
            <p className="font-mono text-zinc-400">elev {sun.elevation.toFixed(1)}°</p></div>
          <div className="rounded-xl bg-white/5 p-3"><p className="label flex items-center gap-1"><Moon size={12} /> Moon</p>
            <p className="mt-1 font-mono">{moon.azimuth.toFixed(1)}° {compassPoint(moon.azimuth)}</p>
            <p className="font-mono text-zinc-400">elev {moon.elevation.toFixed(1)}° · {Math.round(mill.fraction * 100)}%</p></div>
        </div>
        <p className="mt-3 text-[11px] text-zinc-500">Gold line: sun path · dotted blue: moon path · ticks mark sunrise/sunset azimuths{viewDir != null ? ' · green: tagged view direction' : ''}. Terrain on the horizon can delay sunrise / advance sunset.</p>
      </div>

      <div className="grid gap-4">
        <div className="card p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><Sunrise className="mx-auto text-gold-300" size={20} /><p className="mt-1 font-mono text-lg">{formatInTz(sd.sunrise, tz)}</p><p className="text-[11px] text-zinc-500">Sunrise {sd.sunriseAzimuth != null && `· ${Math.round(sd.sunriseAzimuth)}° ${compassPoint(sd.sunriseAzimuth)}`}</p></div>
            <div><Sun className="mx-auto text-amber-200" size={20} /><p className="mt-1 font-mono text-lg">{formatInTz(sd.solarNoon, tz)}</p><p className="text-[11px] text-zinc-500">Solar noon · {sd.noonElevation.toFixed(0)}°</p></div>
            <div><Sunset className="mx-auto text-gold-500" size={20} /><p className="mt-1 font-mono text-lg">{formatInTz(sd.sunset, tz)}</p><p className="text-[11px] text-zinc-500">Sunset {sd.sunsetAzimuth != null && `· ${Math.round(sd.sunsetAzimuth)}° ${compassPoint(sd.sunsetAzimuth)}`}</p></div>
          </div>
          {sd.polar && <p className="mt-2 rounded-lg bg-dusk-500/10 px-3 py-2 text-xs text-dusk-300">{sd.polar === 'day' ? 'Midnight sun — the sun does not set on this date.' : 'Polar night — the sun does not rise on this date.'}</p>}
          <div className="mt-3 divide-y divide-white/5">
            <W label="Blue hour (morning)" w={sd.blueMorning} tz={tz} tone="text-dusk-300" />
            <W label="Golden hour (morning)" w={sd.goldenMorning} tz={tz} tone="text-gold-300" />
            <W label="Golden hour (evening)" w={sd.goldenEvening} tz={tz} tone="text-gold-400" />
            <W label="Blue hour (evening)" w={sd.blueEvening} tz={tz} tone="text-dusk-400" />
            <W label="Civil twilight (am)" w={sd.civilTwilight.morning} tz={tz} tone="text-sky-300" />
            <W label="Civil twilight (pm)" w={sd.civilTwilight.evening} tz={tz} tone="text-sky-300" />
            <W label="Nautical twilight (am)" w={sd.nauticalTwilight.morning} tz={tz} tone="text-indigo-300" />
            <W label="Nautical twilight (pm)" w={sd.nauticalTwilight.evening} tz={tz} tone="text-indigo-300" />
            <W label="Astronomical twilight (am)" w={sd.astronomicalTwilight.morning} tz={tz} tone="text-violet-300" />
            <W label="Astronomical twilight (pm)" w={sd.astronomicalTwilight.evening} tz={tz} tone="text-violet-300" />
            <div className="flex justify-between py-1.5 text-sm"><span className="text-zinc-400">Daylight</span><span className="font-mono">{daylight}</span></div>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">Golden hour = sun −4° to +6°; blue hour = −6° to −4°. Computed with SunCalc for {lat.toFixed(4)}, {lng.toFixed(4)}{elevation ? ` at ${fmtElev(elevation)}` : ''}.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-4">
            <p className="label mb-2 flex items-center gap-1"><Moon size={12} /> Moon</p>
            <p className="h-display text-xl">{md.phaseName}</p>
            <p className="text-sm text-zinc-400">{Math.round(md.illumination * 100)}% illuminated · {md.waxing ? 'waxing' : 'waning'}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-zinc-500">Rise</span><p className="font-mono">{md.alwaysUp ? 'up all day' : md.alwaysDown ? 'below horizon' : formatInTz(md.rise, tz)}</p>{md.riseAzimuth != null && <p className="text-[11px] text-zinc-500">{Math.round(md.riseAzimuth)}° {compassPoint(md.riseAzimuth)}</p>}</div>
              <div><span className="text-zinc-500">Set</span><p className="font-mono">{formatInTz(md.set, tz)}</p>{md.setAzimuth != null && <p className="text-[11px] text-zinc-500">{Math.round(md.setAzimuth)}° {compassPoint(md.setAzimuth)}</p>}</div>
            </div>
          </div>
          <div className="card p-4">
            <p className="label mb-2 flex items-center gap-1"><Telescope size={12} /> Night sky</p>
            {night.darkStart ? (
              <>
                <p className="text-sm">Astronomical darkness <span className="font-mono">{formatInTz(night.darkStart, tz)} – {formatInTz(night.darkEnd, tz)}</span></p>
                <p className="text-sm text-zinc-400">Moon-free dark time: {Math.floor(night.moonFreeDarkMinutes / 60)} h {night.moonFreeDarkMinutes % 60} min</p>
                {night.milkyWay.bestTime ? (
                  <p className="mt-2 flex items-start gap-1.5 text-sm text-violet-200"><Sparkles size={14} className="mt-0.5" />
                    Milky Way core visible {formatInTz(night.milkyWay.visibleStart, tz)}–{formatInTz(night.milkyWay.visibleEnd, tz)}; highest at {formatInTz(night.milkyWay.bestTime, tz)} ({Math.round(night.milkyWay.bestElevation!)}° up, {compassPoint(night.milkyWay.bestAzimuth!)}).</p>
                ) : <p className="mt-2 text-sm text-zinc-500">Milky Way core not visible in moon-free darkness this night.</p>}
                <p className="mt-2 text-xs text-zinc-500">Astro potential (sky geometry only): <span className="text-zinc-200">{night.rating}/100</span></p>
              </>
            ) : <p className="text-sm text-zinc-400">No astronomical darkness on this date at this latitude.</p>}
          </div>
        </div>

        <div className="card p-4">
          <p className="label mb-2">Lunar calendar · {new Date(Date.UTC(y, m - 1, 1)).toLocaleString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
          <div className="grid grid-cols-7 gap-1">
            {cal.map((d) => (
              <button key={d.date} onClick={() => setDate(d.date)} title={`${d.date}: ${d.phaseName}, ${Math.round(d.illumination * 100)}%`}
                className={`flex flex-col items-center rounded-lg py-1.5 text-[10px] ${d.date === date ? 'bg-gold-400/20 text-gold-200' : 'hover:bg-white/5 text-zinc-400'}`}>
                <MoonGlyph phase={d.phase} />
                {Number(d.date.slice(8))}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MoonGlyph({ phase, size = 18 }: { phase: number; size?: number }) {
  // Terminator as an ellipse: x-radius = |cos(2πp)|·r
  const r = size / 2 - 1, c = size / 2;
  const k = Math.cos(2 * Math.PI * phase);
  const waxing = phase < 0.5;
  const rx = Math.abs(k) * r;
  const lit = `M${c},${c - r} A${r},${r} 0 0 ${waxing ? 1 : 0} ${c},${c + r} A${rx},${r} 0 0 ${(k > 0) === waxing ? 0 : 1} ${c},${c - r}`;
  return (
    <svg width={size} height={size} aria-hidden>
      <circle cx={c} cy={c} r={r} fill="#1f2430" />
      <path d={lit} fill="#e5e7eb" />
    </svg>
  );
}
