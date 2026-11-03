import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { AlertTriangle, Car, Compass, ExternalLink, Footprints, Mountain, ShieldAlert, Sunrise, Sunset } from 'lucide-react';
import { detail } from '@/lib/repo';
import { Freshness, ScoreRing, Verified } from '@/components/ui';
import { PhotoImg } from '@/components/LocationCard';
import { PhotoGallery } from '@/components/PhotoGallery';
import { WeatherPanel } from '@/components/WeatherPanel';
import { Webcams } from '@/components/Webcams';
import { LocationSunMap, ParkingMap } from '@/components/LocationInteractive';
import { LocationActions } from '@/components/LocationActions';
import { CATEGORY_LABELS, type LocationDetail } from '@/lib/types';
import { compassPoint, formatCoord } from '@/lib/geo';
import { formatInTz, sunDay, todayIn } from '@/lib/astro';
import { compositionTips } from '@/lib/compositions';

export const revalidate = 1800;

// Provider failures propagate to error.tsx (retryable); only a genuinely unknown id is a 404.
async function load(id: string) {
  return (await detail(decodeURIComponent(id))).data;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const l = await load((await params).id).catch(() => null);
  if (!l) return { title: 'Location' };
  return { title: l.name, description: l.description?.slice(0, 160) ?? `Photography guide to ${l.name}`, openGraph: l.heroImage ? { images: [l.heroImage.thumbUrl] } : undefined };
}

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const l = await load((await params).id);
  if (!l) notFound();
  const sd = sunDay(todayIn(l.timezone), l.lat, l.lng, l.timezone, l.elevation.value ?? 0);
  const b = l.scoreBreakdown;
  return (
    <article>
      <header className="relative isolate">
        <div className="absolute inset-0 -z-10">
          <PhotoImg src={l.heroImage?.url} alt={l.name} className="h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/50 to-ink-950/10" />
        </div>
        <div className="mx-auto flex min-h-[52vh] max-w-7xl flex-col justify-end px-4 pb-8 pt-20">
          <div className="flex flex-wrap gap-1.5">{l.categories.map((c) => <Link key={c} href={`/near-me?cats=${c}`} className="chip bg-ink-950/50">{CATEGORY_LABELS[c]}</Link>)}</div>
          <h1 className="h-display mt-3 text-4xl text-white md:text-6xl">{l.name}</h1>
          <p className="mt-2 text-zinc-300">{[l.nearestTown, l.region, l.country].filter(Boolean).join(' · ')}</p>
          <p className="mt-1 font-mono text-sm text-zinc-400">{formatCoord(l.lat, l.lng, 5)} · <Verified s={l.elevation} render={(v) => `${v} m elevation`} empty="elevation unknown" /></p>
          {l.heroImage && <p className="mt-2 text-[10px] text-zinc-500">Photo: {l.heroImage.author} · {l.heroImage.license} · <a href={l.heroImage.sourceUrl} target="_blank" rel="noreferrer" className="underline">source</a></p>}
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <LocationActions l={l} />
          {l.access.privateProperty && (
            <div className="flex gap-3 rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100"><ShieldAlert className="shrink-0" />
              This location is recorded as private or closed to the public. Only photograph from public land or with the owner’s permission. Never trespass.</div>
          )}
          {l.description && (
            <section><p className="max-w-3xl leading-relaxed text-zinc-300">{l.description}</p>
              {l.wikipediaUrl && <a href={l.wikipediaUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-500">Wikipedia (CC BY-SA) <ExternalLink size={11} /></a>}</section>
          )}

          <section id="photos"><h2 className="section-title mb-4">Community & licensed photographs</h2><PhotoGallery photos={l.photos} />
            <Link href={`/community/upload?loc=${encodeURIComponent(l.slug)}`} className="btn-ghost mt-3">Upload your photo of {l.name}</Link></section>

          <section id="shooting"><h2 className="section-title mb-4">Where to stand & which way to shoot</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="card p-4"><p className="label mb-2 flex items-center gap-1"><Sunrise size={12} />Sunrise today · {formatInTz(sd.sunrise, l.timezone)}</p>
                {sd.sunriseAzimuth != null ? <p className="text-sm text-zinc-300">The sun rises at <b>{Math.round(sd.sunriseAzimuth)}° ({compassPoint(sd.sunriseAzimuth)})</b>. Face {compassPoint(sd.sunriseAzimuth)} for backlit silhouettes and sunstars, or face {compassPoint((sd.sunriseAzimuth + 180) % 360)} for front-lit, warm light on your subject.</p> : <p className="text-sm text-zinc-400">No sunrise today.</p>}</div>
              <div className="card p-4"><p className="label mb-2 flex items-center gap-1"><Sunset size={12} />Sunset today · {formatInTz(sd.sunset, l.timezone)}</p>
                {sd.sunsetAzimuth != null ? <p className="text-sm text-zinc-300">The sun sets at <b>{Math.round(sd.sunsetAzimuth)}° ({compassPoint(sd.sunsetAzimuth)})</b>. Position the subject between you and {compassPoint(sd.sunsetAzimuth)} for glowing skies, or turn {compassPoint((sd.sunsetAzimuth + 180) % 360)} for alpenglow on peaks and façades.</p> : <p className="text-sm text-zinc-400">No sunset today.</p>}</div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="card p-4"><p className="label mb-2 flex items-center gap-1"><Compass size={12} />Recorded viewpoints ({l.viewpoints.length})</p>
                {l.viewpoints.length ? <ul className="space-y-1.5 text-sm">{l.viewpoints.map((v) => (
                  <li key={v.id} className="flex justify-between gap-2"><span>{v.name ?? 'Viewpoint'}{v.direction != null && <span className="text-zinc-500"> · faces {Math.round(v.direction)}° {compassPoint(v.direction)}</span>}</span>
                    <a className="shrink-0 font-mono text-xs text-zinc-500 hover:text-gold-300" href={v.source.url} target="_blank" rel="noreferrer">{v.lat.toFixed(5)}, {v.lng.toFixed(5)}{v.elevation != null && ` · ${Math.round(v.elevation)} m`}</a></li>))}</ul>
                  : <p className="text-sm text-zinc-400">No mapped viewpoints within 1.5 km. Community contributions welcome.</p>}
              </div>
              <div className="card p-4"><p className="label mb-2">Lens choices seen in photos here</p>
                {l.focalHints.length ? <ul className="space-y-1 text-sm">{l.focalHints.map((f) => <li key={f.focal} className="flex justify-between"><span>{f.focal}</span><span className="text-zinc-500">{f.count} photo{f.count > 1 ? 's' : ''}</span></li>)}</ul>
                  : <p className="text-sm text-zinc-400">Not enough EXIF data to recommend focal lengths yet.</p>}
                <p className="label mb-1 mt-4">Composition ideas</p>
                <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-300">{compositionTips(l.categories).map((t) => <li key={t}>{t}</li>)}</ul>
                <p className="mt-1 text-[10px] text-zinc-600">General guidance for this type of subject — not location-verified.</p>
              </div>
            </div>
          </section>

          <section id="sun"><h2 className="section-title mb-4">Sun, moon & light simulator</h2><LocationSunMap l={l} /></section>

          <section id="weather"><h2 className="section-title mb-4">Weather & photography conditions</h2><WeatherPanel lat={l.lat} lng={l.lng} cats={l.categories} /></section>

          <section id="access"><h2 className="section-title mb-4">Parking & access</h2>
            <ParkingMap l={l} />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {l.parking.length ? l.parking.map((p) => (
                <div key={p.id} className="card p-4 text-sm">
                  <p className="flex items-center gap-2 font-medium"><Car size={15} className="text-dusk-400" />{p.name ?? 'Parking area'}</p>
                  <p className="font-mono text-xs text-zinc-500">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</p>
                  <dl className="mt-2 grid grid-cols-[110px_1fr] gap-y-1 text-xs">
                    <dt className="text-zinc-500">Fee</dt><dd><Verified s={p.fee} /></dd>
                    <dt className="text-zinc-500">Capacity</dt><dd><Verified s={p.capacity} render={(v) => `${v} spaces`} /></dd>
                    <dt className="text-zinc-500">Access</dt><dd><Verified s={p.access} /></dd>
                    <dt className="text-zinc-500">Walking distance</dt><dd><Verified s={p.walkingDistanceM} render={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} km` : `${v} m`)} /></dd>
                    <dt className="text-zinc-500">Walking time</dt><dd><Verified s={p.walkingTimeMin} render={(v) => `${v} min`} /></dd>
                  </dl>
                  <div className="mt-2 flex gap-2 text-xs">
                    <a className="chip" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}>Google Maps</a>
                    <a className="chip" target="_blank" rel="noreferrer" href={`https://maps.apple.com/?daddr=${p.lat},${p.lng}`}>Apple Maps</a>
                    <a className="chip" target="_blank" rel="noreferrer" href={p.source.url}>OSM</a>
                  </div>
                </div>
              )) : <p className="text-sm text-zinc-400">No public parking is mapped within 1.5 km in OpenStreetMap. Parking information is unverified — check locally and never block access roads.</p>}
            </div>
            <div className="card mt-4 p-4">
              <dl className="grid gap-y-2 text-sm sm:grid-cols-[180px_1fr]">
                <dt className="text-zinc-500">Opening hours</dt><dd><Verified s={l.access.openingHours} /></dd>
                <dt className="text-zinc-500">Entrance fee</dt><dd><Verified s={l.access.fee} /></dd>
                <dt className="text-zinc-500">Public access</dt><dd><Verified s={l.access.access} /></dd>
                <dt className="text-zinc-500">Wheelchair access</dt><dd><Verified s={l.access.wheelchair} /></dd>
                <dt className="text-zinc-500 flex items-center gap-1"><Footprints size={13} />Hiking difficulty</dt><dd><Verified s={l.access.hikingDifficulty} /></dd>
                <dt className="text-zinc-500 flex items-center gap-1"><Mountain size={13} />Protected area</dt><dd><Verified s={l.access.protectedArea} empty="None recorded" /></dd>
                <dt className="text-zinc-500">Drones</dt><dd className="text-zinc-300">{l.access.droneRestriction.value ?? l.access.droneRestriction.source}</dd>
              </dl>
              {l.access.safetyNotes.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-white/5 pt-3 text-sm text-amber-100/90">
                  {l.access.safetyNotes.map((s) => <li key={s} className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />{s}</li>)}
                </ul>
              )}
              <p className="mt-3 text-[11px] text-zinc-500">Access data comes from OpenStreetMap where tagged. Anything marked “Unverified” has no reliable source — conditions on the ground take precedence.</p>
            </div>
          </section>

          <section id="webcams"><h2 className="section-title mb-4">Live webcams nearby</h2><Webcams lat={l.lat} lng={l.lng} /></section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="card space-y-3 p-4">
            <div className="flex flex-wrap gap-4">
              <ScoreRing value={l.photoScore} label="Photo opportunity" size={56} />
              <ScoreRing value={l.popularityScore} label="Popularity" tone="dusk" />
              <ScoreRing value={l.scenicScore} label="Scenic quality" tone="zinc" />
            </div>
            <p className="text-[11px] text-zinc-500">Photo opportunity blends scenic quality with current conditions; popularity measures attention, not quality.</p>
            {b && <Breakdown b={b} />}
            {l.communityRating != null && <p className="text-sm">Community rating <b>{l.communityRating.toFixed(1)}</b> / 5 <span className="text-zinc-500">({l.ratingCount})</span></p>}
          </div>
          {l.conditions && (
            <div className="card p-4"><p className="label mb-2">Next light</p>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                {(['sunrise', 'sunset', 'astro'] as const).map((k) => <div key={k} className="rounded-lg bg-white/5 py-2"><p className="text-lg font-semibold text-gold-300">{l.conditions![k] ?? '—'}</p><p className="text-[10px] capitalize text-zinc-500">{k}</p></div>)}
              </div>
              <p className="mt-2 text-[10px] text-zinc-600">Forecast-based potential, not a guarantee.</p></div>
          )}
          {l.bestMonths && (
            <div className="card p-4"><p className="label mb-2">Best time of year</p>
              <div className="grid grid-cols-12 gap-0.5">{MONTHS.map((m, i) => <div key={i} className={`rounded py-1 text-center text-[10px] ${l.bestMonths!.months.includes(i + 1) ? 'bg-gold-400/80 text-ink-950' : 'bg-white/5 text-zinc-500'}`}>{m}</div>)}</div>
              <p className="mt-2 text-xs text-zinc-400">{l.bestMonths.reason}{l.bestMonths.heuristic && ' (seasonal heuristic)'}</p></div>
          )}
          <div className="card space-y-2 p-4 text-xs">
            <p className="label">Data & freshness</p>
            <Freshness iso={l.updatedAt} label="Location data updated" />
            <p className="text-zinc-400">Confidence {Math.round(l.confidence * 100)}%</p>
            <ul className="space-y-1">{l.sources.map((s) => <li key={s.provider + s.id}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-zinc-300 hover:text-gold-300">{s.provider} · {s.id} <ExternalLink size={10} /></a></li>)}</ul>
            <a className="inline-flex items-center gap-1 text-zinc-400 hover:text-gold-300" href={`https://www.openstreetmap.org/note/new#map=18/${l.lat}/${l.lng}`} target="_blank" rel="noreferrer">Report a map issue to OSM <ExternalLink size={10} /></a>
          </div>
        </aside>
      </div>
    </article>
  );
}

function Breakdown({ b }: { b: NonNullable<LocationDetail['scoreBreakdown']> }) {
  const rows: [string, number | null][] = [['Scenic', b.scenic], ['Weather', b.weather], ['Golden hour', b.golden], ['Clouds', b.clouds], ['Seasonal', b.seasonal], ['Access', b.accessibility], ['Viewpoints', b.viewpoints], ['Diversity', b.diversity]];
  return (
    <div className="space-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 text-[11px]"><span className="w-20 text-zinc-500">{k}</span>
          <div className="h-1.5 flex-1 rounded-full bg-white/5">{v != null && <div className="h-full rounded-full bg-gold-400/80" style={{ width: `${v}%` }} />}</div>
          <span className="w-6 text-right text-zinc-400">{v ?? '—'}</span></div>
      ))}
    </div>
  );
}
