'use client';
import { useCallback, useState } from 'react';
import { Map, type MapMarker, type MapRay, type MapRoute } from './Map';
import { SunMoon } from './SunMoon';
import type { LocationDetail } from '@/lib/types';

/** Map + sun/moon simulator sharing state: the simulator draws sun & moon azimuth rays on the map. */
export function LocationSunMap({ l }: { l: LocationDetail }) {
  const [rays, setRays] = useState<MapRay[]>([]);
  const onRays = useCallback((r: MapRay[]) => setRays(r), []);
  const markers: MapMarker[] = [
    { id: l.id, lat: l.lat, lng: l.lng, kind: 'spot', label: l.name, score: l.photoScore },
    ...l.viewpoints.map((v) => ({ id: v.id, lat: v.lat, lng: v.lng, kind: 'viewpoint' as const, label: v.name ?? 'Viewpoint', sub: v.direction != null ? `Faces ${Math.round(v.direction)}°` : undefined })),
  ];
  return (
    <div className="space-y-4">
      <Map center={[l.lat, l.lng]} zoom={14} markers={markers} rays={rays} height={360} defaultLayer="Satellite" />
      <SunMoon lat={l.lat} lng={l.lng} tz={l.timezone} elevation={l.elevation.value ?? 0} onRays={onRays}
        viewDir={l.viewpoints.find((v) => v.direction != null)?.direction ?? null} />
    </div>
  );
}

export function ParkingMap({ l }: { l: LocationDetail }) {
  const markers: MapMarker[] = [
    { id: l.id, lat: l.lat, lng: l.lng, kind: 'spot', label: l.name, score: l.photoScore },
    ...l.parking.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, kind: 'parking' as const, label: p.name ?? 'Parking', sub: `${p.distanceToSpotM} m straight-line to spot` })),
    ...l.viewpoints.map((v) => ({ id: v.id, lat: v.lat, lng: v.lng, kind: 'viewpoint' as const, label: v.name ?? 'Viewpoint' })),
  ];
  const routes: MapRoute[] = l.parking.map((p) => p.route
    ? { coords: p.route, color: '#34d399', label: `Walking route from ${p.name ?? 'parking'}` }
    : { coords: [[p.lat, p.lng], [l.lat, l.lng]] as [number, number][], color: '#5371dc', dashed: true, label: 'Straight line only — not a route' });
  return <Map center={[l.lat, l.lng]} zoom={15} markers={markers} routes={routes} height={380} />;
}
