'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Bell, CalendarPlus, Car, Download, Loader2, MapPin, Trash2 } from 'lucide-react';
import type { LocationDetail, LocationSummary } from '@/lib/types';
import { buildPlan, TARGETS, type Target } from '@/lib/plan';
import { formatInTz, todayIn } from '@/lib/astro';
import { compassPoint } from '@/lib/geo';
import { icsEvent } from '@/lib/ics';
import { useWeather } from './WeatherPanel';
import { usePlace } from './usePlace';
import { PlacePicker } from './PlacePicker';
import { Insights } from './WeatherPanel';
import { useAuth, ensureLocationId } from '@/lib/useAuth';
import { Verified } from './ui';

export function Planner() {
  const sp = useSearchParams();
  const [ref, setRef] = useState<string | null>(sp.get('loc'));
  const [loc, setLoc] = useState<LocationDetail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [date, setDate] = useState<string>('');
  const [target, setTarget] = useState<Target>('sunset');
  const { data: wx } = useWeather(loc?.lat ?? null, loc?.lng ?? null, loc?.categories ?? []);
  const { sb, user } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    if (!ref) return;
    setLoc(null); setLoadErr(null);
    fetch(`/api/locations/${encodeURIComponent(ref)}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setLoc(j.data); setDate(todayIn(j.data.timezone)); })
      .catch((e) => setLoadErr(e.message));
  }, [ref]);
  useEffect(() => {
    if (!sb || !user) return;
    sb.from('shoot_plans').select('*').eq('user_id', user.id).gte('plan_date', new Date(Date.now() - 86400000).toISOString().slice(0, 10)).order('plan_date').then(({ data }) => setPlans(data ?? []));
  }, [sb, user, msg]);

  const outlook = wx?.outlooks.find((o) => o.date === date) ?? null;
  const plan = useMemo(() => (loc && date ? buildPlan(loc, date, target, wx?.forecast ?? null, outlook) : null), [loc, date, target, wx, outlook]);
  const tz = loc?.timezone ?? null;
  const t = (iso: string | null) => formatInTz(iso, tz);

  function ics() {
    if (!plan || !loc || !plan.window.start) return;
    const start = plan.arrivalAtParking ?? plan.arrivalAtSpot ?? plan.window.start;
    const body = icsEvent({ uid: `${loc.id}-${date}-${target}@lumen`, start, end: plan.window.end ?? plan.window.start, title: `${TARGETS[target]} · ${loc.name}`,
      description: `Arrive at parking ${t(plan.arrivalAtParking)}, at spot ${t(plan.arrivalAtSpot)}. Window ${t(plan.window.start)}–${t(plan.window.end)}. ${location.origin}/location/${loc.slug}`,
      lat: loc.lat, lng: loc.lng, location: loc.name });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
    a.download = `${loc.slug}-${date}.ics`; a.click();
  }
  async function save() {
    if (!plan || !loc) return;
    if (!sb || !user) { setMsg('Sign in on the Profile page to save plans to your photography calendar.'); return; }
    try {
      const locationId = await ensureLocationId(loc.id).catch(() => null);
      const { error } = await sb.from('shoot_plans').insert({ user_id: user.id, location_id: locationId, location_ref: loc.slug, location_name: loc.name, lat: loc.lat, lng: loc.lng,
        plan_date: date, target, arrival_at: plan.arrivalAtParking ?? plan.arrivalAtSpot, plan });
      if (error) throw error;
      if (locationId && ['sunrise', 'sunset', 'astro'].includes(target)) await sb.from('alert_rules').upsert({ user_id: user.id, location_id: locationId, kind: target, min_score: 65 }, { onConflict: 'user_id,location_id,kind' });
      setMsg('Saved to your photography calendar. You’ll get a notification if forecast conditions look promising.');
    } catch (e: any) { setMsg(e.message); }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div><p className="label">Photography planner</p><h1 className="section-title">Plan a shoot</h1></div>
      {!ref && <SpotChooser onChoose={setRef} />}
      {loadErr && <p className="text-sm text-rose-300">{loadErr}</p>}
      {ref && !loc && !loadErr && <p className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 size={14} className="animate-spin" />Loading location…</p>}
      {loc && (
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <MapPin className="text-gold-400" size={18} />
          <Link href={`/location/${loc.slug}`} className="h-display text-xl hover:underline">{loc.name}</Link>
          <button className="chip" onClick={() => { setRef(null); setLoc(null); }}>Change</button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input ml-auto w-auto" aria-label="Shoot date" />
          <select value={target} onChange={(e) => setTarget(e.target.value as Target)} className="input w-auto" aria-label="What to shoot">
            {Object.entries(TARGETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      )}
      {plan && loc && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card space-y-3 p-5 lg:col-span-2">
            <p className="label">{TARGETS[target]} · {new Date(date + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</p>
            {plan.window.start ? (
              <ol className="relative space-y-4 border-l border-white/10 pl-5">
                {plan.arrivalAtParking && <li><span className="absolute -left-1.5 h-3 w-3 rounded-full bg-dusk-500" /><p className="font-mono text-lg">{t(plan.arrivalAtParking)}</p><p className="text-sm text-zinc-400">Arrive at parking{loc.parking[0]?.name ? ` (${loc.parking[0].name})` : ''} · walk {plan.walkMin} min {plan.walkVerified ? '(routed)' : '(estimate)'}</p></li>}
                <li><span className="absolute -left-1.5 h-3 w-3 rounded-full bg-zinc-300" /><p className="font-mono text-lg">{t(plan.arrivalAtSpot)}</p><p className="text-sm text-zinc-400">Be at the spot — {plan.setupMin} min to scout and set up</p></li>
                <li><span className="absolute -left-1.5 h-3 w-3 rounded-full bg-gold-400" /><p className="font-mono text-lg">{t(plan.window.start)} – {t(plan.window.end)}</p><p className="text-sm text-zinc-400">{TARGETS[target]} window{plan.sunAzimuth != null && plan.sunElevation != null && plan.sunElevation > -8 ? ` · sun at ${Math.round(plan.sunAzimuth)}° ${compassPoint(plan.sunAzimuth)}, ${plan.sunElevation.toFixed(1)}° elevation` : ''}</p></li>
              </ol>
            ) : <p className="text-sm text-zinc-400">This light window doesn’t occur on this date at this latitude.</p>}
            {!loc.parking.length && <p className="text-xs text-amber-300">No mapped parking — arrival time is for the spot itself. Parking is unverified.</p>}
            {plan.milkyWay?.bestTime && <p className="text-sm text-violet-200">Milky Way core highest at {t(plan.milkyWay.bestTime)} toward {compassPoint(plan.milkyWay.bestAzimuth!)} ({Math.round(plan.milkyWay.bestElevation!)}°).</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              <button onClick={save} className="btn-primary"><CalendarPlus size={15} />Save to my calendar</button>
              <button onClick={ics} className="btn-ghost"><Download size={15} />Download .ics</button>
              <a className="btn-ghost" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${loc.parking[0]?.lat ?? loc.lat},${loc.parking[0]?.lng ?? loc.lng}`}><Car size={15} />Directions</a>
            </div>
            {msg && <p className="text-xs text-gold-200">{msg}</p>}
          </div>
          <div className="space-y-4">
            <div className="card p-4 text-sm">
              <p className="label mb-2">Expected conditions</p>
              {plan.weather.available ? (
                <>
                  {plan.weather.score != null && <p className="mb-1">Photo potential <b className="text-gold-300">{plan.weather.score}/100</b></p>}
                  <p>Cloud {plan.weather.cloud!.total}% (low {plan.weather.cloud!.low} · mid {plan.weather.cloud!.mid} · high {plan.weather.cloud!.high})</p>
                  <p>Wind {Math.round(plan.weather.wind!)} km/h, gusts {Math.round(plan.weather.gust!)} · rain {plan.weather.precipProb}%</p>
                  <p className="mt-1 text-[10px] text-zinc-500">Open-Meteo forecast; potential, not a guarantee.</p>
                </>
              ) : <p className="text-zinc-400">Forecast not available for this date yet (7-day horizon). Re-check closer to the day.</p>}
            </div>
            <div className="card p-4 text-sm">
              <p className="label mb-2">Moon</p>
              <p>{plan.moon.phase} · {Math.round(plan.moon.illumination * 100)}%</p>
              <p className="text-zinc-400">Rise {t(plan.moon.rise)} · Set {t(plan.moon.set)}</p>
              {plan.moon.elevation != null && plan.moon.elevation > 0 && <p className="text-zinc-400">During the window: {Math.round(plan.moon.azimuth!)}° {compassPoint(plan.moon.azimuth!)}, {plan.moon.elevation.toFixed(0)}° up</p>}
            </div>
            {loc.parking[0] && (
              <div className="card p-4 text-sm"><p className="label mb-2">Parking</p>
                <p>{loc.parking[0].name ?? 'Parking area'} · <span className="font-mono text-xs">{loc.parking[0].lat.toFixed(5)}, {loc.parking[0].lng.toFixed(5)}</span></p>
                <p className="text-xs">Fee: <Verified s={loc.parking[0].fee} /></p>
                <p className="text-xs">Walk: <Verified s={loc.parking[0].walkingDistanceM} render={(v) => `${v} m`} /></p></div>
            )}
            <div className="card p-4 text-sm"><p className="label mb-2">Viewpoints & subjects</p>
              {loc.viewpoints.slice(0, 4).map((v) => <p key={v.id} className="text-zinc-300">{v.name ?? 'Viewpoint'}{v.direction != null && ` · faces ${compassPoint(v.direction)}`}</p>)}
              <ul className="mt-2 list-disc pl-4 text-zinc-400">{plan.subjects.slice(0, 3).map((s) => <li key={s}>{s}</li>)}</ul></div>
          </div>
          {plan.weather.insights && <div className="lg:col-span-3"><Insights items={plan.weather.insights} tz={tz} /></div>}
        </div>
      )}
      {plans.length > 0 && (
        <div className="card p-4">
          <p className="label mb-3">My photography calendar</p>
          <ul className="divide-y divide-white/5">{plans.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-28 font-mono text-zinc-300">{p.plan_date}</span>
              <Link href={`/location/${p.location_ref}`} className="flex-1 hover:underline">{TARGETS[p.target as Target] ?? p.target} · {p.location_name}</Link>
              <span className="text-xs text-zinc-500">{p.arrival_at ? `arrive ${new Date(p.arrival_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
              <button onClick={async () => { await sb!.from('shoot_plans').delete().eq('id', p.id); setMsg(`Removed ${p.id}`); }} aria-label="Delete plan"><Trash2 size={14} className="text-zinc-500" /></button>
            </li>))}</ul>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-zinc-500"><Bell size={11} />Alerts are evaluated after every six-hour refresh and appear under Profile → Notifications.</p>
        </div>
      )}
    </div>
  );
}

function SpotChooser({ onChoose }: { onChoose: (ref: string) => void }) {
  const { place, setPlace, requestGps, gpsState } = usePlace();
  const [list, setList] = useState<LocationSummary[] | null>(null);
  useEffect(() => {
    if (!place) return;
    setList(null);
    fetch(`/api/locations/nearby?lat=${place.lat}&lng=${place.lng}&radius=25&limit=24`).then((r) => r.json()).then((j) => setList(j.data ?? []));
  }, [place]);
  return (
    <div className="space-y-3">
      <PlacePicker place={place} onPlace={setPlace} requestGps={requestGps} gpsState={gpsState} />
      {place && !list && <p className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 size={14} className="animate-spin" />Finding spots…</p>}
      {list && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{list.map((l) => (
        <button key={l.id} onClick={() => onChoose(l.slug)} className="card flex items-center justify-between gap-2 p-3 text-left hover:bg-white/5">
          <span className="min-w-0"><span className="block truncate text-sm">{l.name}</span><span className="text-xs text-zinc-500">{l.distanceKm?.toFixed(1)} km · {l.categories.slice(0, 2).join(', ')}</span></span>
          <span className="text-sm font-semibold text-gold-300">{l.photoScore}</span>
        </button>))}</div>}
    </div>
  );
}
