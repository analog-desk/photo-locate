import type { PhotoRef } from '../types';
import { photoHref, userHref, withBase } from '../links';
/** Community photo row (photos_public view) → PhotoRef. Shared by jobs (no Next.js runtime). */
export function communityPhotoRef(p: any): PhotoRef {
  const root = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return {
    id: `community:${p.id}`,
    url: `${root}/storage/v1/object/public/photos/${p.storage_path}`,
    // Supabase image transformations are a paid-plan feature — opt in via env, otherwise serve the original.
    thumbUrl: process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS === '1'
      ? `${root}/storage/v1/render/image/public/photos/${p.storage_path}?width=640&quality=75`
      : `${root}/storage/v1/object/public/photos/${p.storage_path}`,
    width: p.width, height: p.height, title: p.title,
    author: p.display_name ?? p.username ?? 'Varo’s Eye member', authorUrl: p.username ? withBase(userHref(p.username)) : undefined,
    license: p.license === 'all-rights-reserved' ? 'All rights reserved' : String(p.license).toUpperCase().replace(/-/g, ' '),
    sourceUrl: withBase(photoHref(p.id)), provider: 'community',
    takenAt: p.taken_at, lat: p.lat, lng: p.lng, lightPhase: p.light_phase, season: p.season,
    camera: p.camera, lens: p.lens, focalLength: p.focal_length, aperture: p.aperture, shutter: p.shutter, iso: p.iso,
  };
}
