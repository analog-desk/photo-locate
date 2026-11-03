'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, MapPin, ShieldCheck } from 'lucide-react';
import { useAuth, ensureLocationId } from '@/lib/useAuth';
import { lightPhaseAt, seasonOf } from '@/lib/astro';
import { CATEGORIES, CATEGORY_LABELS, type LocationSummary } from '@/lib/types';
import { getNearby } from '@/lib/data';
import { photoHref } from '@/lib/links';

const LICENSES = [
  ['all-rights-reserved', 'All rights reserved'], ['cc-by', 'CC BY 4.0'], ['cc-by-sa', 'CC BY-SA 4.0'], ['cc-by-nc', 'CC BY-NC 4.0'],
  ['cc-by-nc-sa', 'CC BY-NC-SA 4.0'], ['cc-by-nd', 'CC BY-ND 4.0'], ['cc-by-nc-nd', 'CC BY-NC-ND 4.0'], ['cc0', 'CC0 (public domain)'],
] as const;
const PHASES = ['golden', 'blue', 'day', 'night', 'nautical', 'astronomical'] as const;

interface Exif { camera?: string; lens?: string; focal?: number; aperture?: number; shutter?: string; iso?: number; takenAt?: string; offsetKnown: boolean; lat?: number; lng?: number; raw: Record<string, unknown> }

async function readExif(file: File): Promise<Exif> {
  const exifr = (await import('exifr')).default;
  const t: any = (await exifr.parse(file, { gps: true, tiff: true, exif: true, ifd0: true } as any).catch(() => null)) ?? {};
  const et = t.ExposureTime as number | undefined;
  let takenAt: string | undefined, offsetKnown = false;
  if (t.DateTimeOriginal instanceof Date) {
    const off = (t.OffsetTimeOriginal ?? t.OffsetTime) as string | undefined;
    if (off && /^[+-]\d{2}:\d{2}$/.test(off)) {
      // exifr gives a browser-local Date of the camera wall clock; rebuild it with the recorded offset
      const d = t.DateTimeOriginal as Date;
      const wall = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}${off}`;
      takenAt = new Date(wall).toISOString(); offsetKnown = true;
    } else takenAt = (t.DateTimeOriginal as Date).toISOString();
  }
  const raw: Record<string, unknown> = {};
  for (const k of ['Make', 'Model', 'LensModel', 'FocalLength', 'FocalLengthIn35mmFormat', 'FNumber', 'ExposureTime', 'ISO', 'ExposureCompensation', 'WhiteBalance', 'Flash', 'Software']) if (t[k] != null) raw[k] = t[k];
  return {
    camera: [t.Make, t.Model].filter(Boolean).join(' ') || undefined, lens: t.LensModel, focal: t.FocalLength, aperture: t.FNumber,
    shutter: et ? (et >= 1 ? `${et}s` : `1/${Math.round(1 / et)}s`) : undefined, iso: t.ISO, takenAt, offsetKnown,
    lat: typeof t.latitude === 'number' ? t.latitude : undefined, lng: typeof t.longitude === 'number' ? t.longitude : undefined, raw,
  };
}

/** Re-encode through a canvas: drops ALL embedded metadata (EXIF, GPS, XMP). */
async function stripMetadata(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const max = 4096, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.92));
  return { blob, w: c.width, h: c.height };
}

export function UploadForm() {
  const { sb, user, ready, enabled } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [exif, setExif] = useState<Exif | null>(null);
  const [f, setF] = useState({ title: '', description: '', license: 'all-rights-reserved', gpsPublic: false, strip: true, phase: '', genres: [] as string[], weather: '', camera: '', lens: '', focal: '', aperture: '', shutter: '', iso: '', takenAt: '' });
  const [spots, setSpots] = useState<LocationSummary[]>([]);
  const [locRef, setLocRef] = useState<string>(sp.get('loc') ?? '');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [rights, setRights] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file); setPreview(url);
    readExif(file).then((e) => {
      setExif(e);
      const phase = e.takenAt && e.lat != null && e.offsetKnown ? lightPhaseAt(new Date(e.takenAt), e.lat, e.lng!) : '';
      setF((s) => ({ ...s, camera: e.camera ?? '', lens: e.lens ?? '', focal: e.focal ? String(e.focal) : '', aperture: e.aperture ? String(e.aperture) : '',
        shutter: e.shutter ?? '', iso: e.iso ? String(e.iso) : '', takenAt: e.takenAt ? e.takenAt.slice(0, 16) : '', phase }));
      if (e.lat != null) getNearby({ lat: e.lat, lng: e.lng!, radius: 5, limit: 10, sort: 'distance' }).then((j) => setSpots(j.data)).catch(() => {});
    });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // Keeping GPS private but uploading the original file would leak the location through EXIF.
  useEffect(() => { if (!f.gpsPublic) setF((s) => ({ ...s, strip: true })); }, [f.gpsPublic]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sb || !user || !file) return;
    setBusy(true); setErr(null);
    try {
      if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error('Please upload a JPEG, PNG, WebP or AVIF image.');
      if (file.size > 25 * 1024 * 1024) throw new Error('Maximum file size is 25 MB.');
      const bmp = await createImageBitmap(file);
      let body: Blob = file, w = bmp.width, h = bmp.height, ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      if (f.strip) { const s = await stripMetadata(file); body = s.blob; w = s.w; h = s.h; ext = 'jpg'; }
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from('photos').upload(path, body, { contentType: f.strip ? 'image/jpeg' : file.type, upsert: false });
      if (up.error) throw up.error;
      const locationId = locRef ? await ensureLocationId(locRef).catch(() => null) : null;
      const takenAt = f.takenAt ? new Date(f.takenAt + (exif?.offsetKnown ? '' : 'Z')).toISOString() : null;
      const { data, error } = await sb.from('photos').insert({
        user_id: user.id, location_id: locationId, storage_path: path, width: w, height: h, title: f.title || null, description: f.description || null,
        lat: exif?.lat ?? null, lng: exif?.lng ?? null, gps_public: f.gpsPublic, taken_at: takenAt,
        light_phase: f.phase || null, season: takenAt && exif?.lat != null ? seasonOf(new Date(takenAt), exif.lat) : null,
        genres: f.genres, weather_condition: f.weather || null, camera: f.camera || null, lens: f.lens || null,
        focal_length: f.focal ? Number(f.focal) : null, aperture: f.aperture ? Number(f.aperture) : null, shutter: f.shutter || null, iso: f.iso ? Number(f.iso) : null,
        exif: exif?.raw ?? null, license: f.license,
      }).select('id').single();
      if (error) throw error;
      router.push(photoHref(data.id));
    } catch (e: any) { setErr(e.message ?? String(e)); } finally { setBusy(false); }
  }

  if (!enabled) return <p className="text-sm text-zinc-400">Uploads need the Supabase backend.</p>;
  if (!ready) return <Loader2 className="animate-spin" />;
  if (!user) return <p className="text-sm text-zinc-300"><Link href="/profile" className="underline">Sign in</Link> to upload photographs.</p>;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <label className="card flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="Preview" className="h-full w-full object-contain" /> : <span className="text-sm text-zinc-400">Choose a photo (JPEG, PNG, WebP · max 25 MB)</span>}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {exif && (
          <div className="card space-y-2 p-4 text-sm">
            <p className="label flex items-center gap-1"><ShieldCheck size={12} />Location privacy</p>
            {exif.lat != null ? <p className="text-zinc-300"><MapPin size={13} className="inline" /> GPS found: {exif.lat.toFixed(4)}, {exif.lng!.toFixed(4)}</p> : <p className="text-zinc-500">No GPS in this file.</p>}
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.gpsPublic} onChange={(e) => setF({ ...f, gpsPublic: e.target.checked })} /> Show the photo’s exact coordinates publicly</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.strip} disabled={!f.gpsPublic} onChange={(e) => setF({ ...f, strip: e.target.checked })} /> Remove all embedded metadata (EXIF/GPS) from the uploaded file</label>
            <p className="text-[11px] text-zinc-500">When coordinates are private, the file is always stripped so location can’t leak via EXIF. Camera settings you keep below are stored as text only.</p>
          </div>
        )}
      </div>
      <div className="space-y-3">
        <input className="input" placeholder="Title" value={f.title} onChange={set('title')} maxLength={140} />
        <textarea className="input min-h-24" placeholder="Story, settings, tips for others…" value={f.description} onChange={set('description')} maxLength={4000} />
        <div>
          <p className="label mb-1">Photography location</p>
          <select className="input" value={locRef} onChange={(e) => setLocRef(e.target.value)}>
            <option value="">— none —</option>
            {sp.get('loc') && <option value={sp.get('loc')!}>{sp.get('loc')}</option>}
            {spots.map((s) => <option key={s.id} value={s.slug}>{s.name} ({s.distanceKm?.toFixed(1)} km)</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="Camera" value={f.camera} onChange={set('camera')} />
          <input className="input" placeholder="Lens" value={f.lens} onChange={set('lens')} />
          <input className="input" placeholder="Focal length (mm)" value={f.focal} onChange={set('focal')} inputMode="decimal" />
          <input className="input" placeholder="Aperture (f/)" value={f.aperture} onChange={set('aperture')} inputMode="decimal" />
          <input className="input" placeholder="Shutter (1/250s)" value={f.shutter} onChange={set('shutter')} />
          <input className="input" placeholder="ISO" value={f.iso} onChange={set('iso')} inputMode="numeric" />
          <input className="input col-span-2" type="datetime-local" value={f.takenAt} onChange={set('takenAt')} aria-label="Shooting date and time" />
          <select className="input" value={f.phase} onChange={set('phase')} aria-label="Light">
            <option value="">Light / time of day…</option>{PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="input" value={f.weather} onChange={set('weather')} aria-label="Weather">
            <option value="">Weather…</option>{['clear', 'partly cloudy', 'overcast', 'fog', 'rain', 'snow', 'storm'].map((w) => <option key={w}>{w}</option>)}
          </select>
        </div>
        {exif?.takenAt && !exif.offsetKnown && <p className="text-[11px] text-amber-300">The camera didn’t record a time zone, so the light phase isn’t auto-detected — choose it above.</p>}
        <div className="flex flex-wrap gap-1.5">{CATEGORIES.filter((c) => c !== 'hidden-gem').map((c) => (
          <button type="button" key={c} onClick={() => setF({ ...f, genres: f.genres.includes(c) ? f.genres.filter((g) => g !== c) : [...f.genres, c] })} className={`chip ${f.genres.includes(c) ? 'chip-on' : ''}`}>{CATEGORY_LABELS[c]}</button>))}</div>
        <select className="input" value={f.license} onChange={set('license')} aria-label="License">{LICENSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <label className="flex items-start gap-2 text-xs text-zinc-300"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5" required />
          I took this photograph or hold the rights to share it, and it was taken without trespassing or endangering anyone.</label>
        <button className="btn-primary w-full" disabled={!file || busy || !rights}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Upload for review'}</button>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <p className="text-[11px] text-zinc-500">New uploads are reviewed by moderators before appearing publicly. You can see your pending photos on your profile.</p>
      </div>
    </form>
  );
}
