'use client';
import { useCallback, useState } from 'react';
import { usePlace } from './usePlace';
import { PlacePicker } from './PlacePicker';
import { Map, type MapMarker, type MapRay } from './Map';
import { SunMoon } from './SunMoon';
import { WeatherPanel, useWeather } from './WeatherPanel';

export function SunMoonTool() {
  const { place, setPlace, requestGps, gpsState } = usePlace();
  const { data } = useWeather(place?.lat ?? null, place?.lng ?? null); // provides the IANA time zone + elevation for the point
  const [rays, setRays] = useState<MapRay[]>([]);
  const onRays = useCallback((r: MapRay[]) => setRays(r), []);
  const markers: MapMarker[] = place ? [{ id: 'p', lat: place.lat, lng: place.lng, kind: 'pin', label: place.label }] : [];
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div><p className="label">Sun & moon tracker</p><h1 className="section-title">Where will the light be?</h1></div>
      <PlacePicker place={place} onPlace={setPlace} requestGps={requestGps} gpsState={gpsState} />
      <Map center={place ? [place.lat, place.lng] : [30, 0]} zoom={place ? 13 : 2} markers={markers} rays={rays} height={380} defaultLayer="Satellite"
        onPick={(lat, lng) => setPlace({ lat, lng, label: 'Dropped pin', source: 'pin' })} />
      {place ? <SunMoon lat={place.lat} lng={place.lng} tz={data?.forecast.timezone ?? null} elevation={Math.round(data?.forecast.elevation ?? 0)} onRays={onRays} />
        : <p className="text-sm text-zinc-400">Pick a location to compute sunrise, sunset, golden & blue hour, twilight, sun and moon positions, and Milky Way visibility for any date.</p>}
    </div>
  );
}

export function WeatherTool() {
  const { place, setPlace, requestGps, gpsState } = usePlace();
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div><p className="label">Photography weather</p><h1 className="section-title">Conditions & forecast</h1></div>
      <PlacePicker place={place} onPlace={setPlace} requestGps={requestGps} gpsState={gpsState} />
      {place ? <WeatherPanel lat={place.lat} lng={place.lng} /> : <p className="text-sm text-zinc-400">Choose a location to see the 7-day forecast with low/mid/high cloud, wind, visibility and photography ratings.</p>}
    </div>
  );
}
