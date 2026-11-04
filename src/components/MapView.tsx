'use client';
import { fmtElev, fmtShort } from '@/lib/units';
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { LayersControl, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents, ScaleControl, CircleMarker, Circle } from 'react-leaflet';
import { Mountain, Ruler, Crosshair, X } from 'lucide-react';
import { destination, haversineM } from '@/lib/geo';
import { publicConfig } from '@/lib/config';
import Link from 'next/link';
import { getElevation } from '@/lib/data';

export interface MapMarker { id: string; lat: number; lng: number; kind: 'spot' | 'parking' | 'viewpoint' | 'webcam' | 'pin' | 'me'; label: string; href?: string; score?: number; sub?: string }
export interface MapRay { azimuth: number; color: string; label: string; lengthM?: number; dashed?: boolean }
export interface MapRoute { coords: [number, number][]; color?: string; dashed?: boolean; label?: string }

const ICON_STYLE: Record<MapMarker['kind'], { bg: string; size: number; text?: string }> = {
  spot: { bg: '#ffc56b', size: 26 }, parking: { bg: '#5371dc', size: 22, text: 'P' }, viewpoint: { bg: '#34d399', size: 20, text: '◉' },
  webcam: { bg: '#f472b6', size: 20, text: '●' }, pin: { bg: '#fb7185', size: 22, text: '+' }, me: { bg: '#38bdf8', size: 18 },
};
function icon(m: MapMarker) {
  const s = ICON_STYLE[m.kind];
  const text = m.kind === 'spot' && m.score != null ? String(m.score) : s.text ?? '';
  return L.divIcon({ className: '', iconSize: [s.size, s.size], iconAnchor: [s.size / 2, s.size / 2],
    html: `<div class="pin" style="width:${s.size}px;height:${s.size}px;background:${s.bg}">${text}</div>` });
}

function Recenter({ center, zoom }: { center: [number, number]; zoom?: number }) {
  const map = useMap();
  const prev = useRef<string>('');
  useEffect(() => {
    const k = center.join(',');
    if (k !== prev.current) { prev.current = k; map.setView(center, zoom ?? map.getZoom(), { animate: true }); }
  }, [center, zoom, map]);
  return null;
}

function Events({ mode, onPick, onMoveEnd, onMeasure, onElev }: {
  mode: 'none' | 'pick' | 'measure' | 'elev'; onPick?: (lat: number, lng: number) => void;
  onMoveEnd?: (c: { lat: number; lng: number }, radiusKm: number) => void; onMeasure: (p: [number, number]) => void; onElev: (p: [number, number]) => void;
}) {
  const map = useMapEvents({
    click(e) {
      if (mode === 'pick') onPick?.(e.latlng.lat, e.latlng.lng);
      else if (mode === 'measure') onMeasure([e.latlng.lat, e.latlng.lng]);
      else if (mode === 'elev') onElev([e.latlng.lat, e.latlng.lng]);
    },
    moveend() {
      if (!onMoveEnd) return;
      const c = map.getCenter(), ne = map.getBounds().getNorthEast();
      onMoveEnd({ lat: c.lat, lng: c.lng }, Math.min(250, map.distance(c, ne) / 1000));
    },
  });
  return null;
}

export default function MapView({
  center, zoom = 11, markers = [], rays = [], routes = [], radiusKm, onPick, onMoveEnd, height = 420, defaultLayer = 'Standard', allowPick = !!onPick, rayOrigin,
}: {
  center: [number, number]; zoom?: number; markers?: MapMarker[]; rays?: MapRay[]; routes?: MapRoute[]; radiusKm?: number;
  onPick?: (lat: number, lng: number) => void; onMoveEnd?: (c: { lat: number; lng: number }, radiusKm: number) => void;
  height?: number | string; defaultLayer?: 'Standard' | 'Satellite' | 'Terrain' | 'Topographic'; allowPick?: boolean; rayOrigin?: [number, number];
}) {
  const [mode, setMode] = useState<'none' | 'pick' | 'measure' | 'elev'>('none');
  const [measure, setMeasure] = useState<[number, number][]>([]);
  const [elev, setElev] = useState<{ p: [number, number]; v: number | null; err?: string } | null>(null);
  const measureM = useMemo(() => measure.slice(1).reduce((s, p, i) => s + haversineM({ lat: measure[i][0], lng: measure[i][1] }, { lat: p[0], lng: p[1] }), 0), [measure]);
  const origin = rayOrigin ?? center;
  const mb = publicConfig.mapboxToken;

  async function lookupElevation(p: [number, number]) {
    setElev({ p, v: null });
    try {
      setElev({ p, v: Math.round(await getElevation(p[0], p[1])) });
    } catch { setElev({ p, v: null, err: 'unavailable' }); }
  }

  const tool = (m: typeof mode, label: string, Icon: typeof Ruler) => (
    <button onClick={() => { setMode(mode === m ? 'none' : m); if (m === 'measure') setMeasure([]); }} title={label} aria-pressed={mode === m}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs shadow-lg ${mode === m ? 'bg-gold-400 text-ink-950' : 'bg-ink-800/95 text-zinc-200 hover:bg-ink-700'}`}>
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5" style={{ height }}>
      <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom worldCopyJump>
        <Recenter center={center} />
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked={defaultLayer === 'Standard'} name="Standard">
            <TileLayer url={publicConfig.tilesStandard} maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={defaultLayer === 'Satellite'} name="Satellite">
            {mb ? (
              <TileLayer url={`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${mb}`} tileSize={512} zoomOffset={-1} maxZoom={20}
                attribution='© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.maxar.com/">Maxar</a>' />
            ) : (
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19}
                attribution="Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community" />
            )}
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={defaultLayer === 'Terrain'} name="Terrain">
            {mb ? (
              <TileLayer url={`https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${mb}`} tileSize={512} zoomOffset={-1} maxZoom={20}
                attribution='© Mapbox © OpenStreetMap' />
            ) : (
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}" maxZoom={19}
                attribution="Tiles © Esri — Esri, HERE, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors" />
            )}
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={defaultLayer === 'Topographic'} name="Topographic">
            <TileLayer url={publicConfig.tilesTopo} maxZoom={17} subdomains={['a', 'b', 'c']}
              attribution='Map data: © OpenStreetMap contributors, SRTM | Style: © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' />
          </LayersControl.BaseLayer>
          <LayersControl.Overlay name="Hiking trails">
            <TileLayer url="https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png" maxZoom={18} opacity={0.8} attribution='Trails © <a href="https://waymarkedtrails.org">Waymarked Trails</a> (CC-BY-SA)' />
          </LayersControl.Overlay>
          <LayersControl.Overlay name="Place labels (satellite)">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxZoom={19} attribution="Labels © Esri" />
          </LayersControl.Overlay>
        </LayersControl>
        <ScaleControl position="bottomleft" metric={false} />
        <Events mode={mode} onPick={(a, b) => { onPick?.(a, b); setMode('none'); }} onMoveEnd={onMoveEnd} onMeasure={(p) => setMeasure((m) => [...m, p])} onElev={lookupElevation} />
        {radiusKm != null && <Circle center={center} radius={radiusKm * 1000} pathOptions={{ color: '#ffc56b', weight: 1, fillOpacity: 0.03, dashArray: '4 6' }} />}
        {routes.map((r, i) => <Polyline key={i} positions={r.coords} pathOptions={{ color: r.color ?? '#34d399', weight: 4, dashArray: r.dashed ? '6 8' : undefined, opacity: 0.9 }}>{r.label && <Popup>{r.label}</Popup>}</Polyline>)}
        {rays.map((r, i) => {
          const end = destination({ lat: origin[0], lng: origin[1] }, r.lengthM ?? 3000, r.azimuth);
          return <Polyline key={`ray${i}`} positions={[origin, [end.lat, end.lng]]} pathOptions={{ color: r.color, weight: 3, dashArray: r.dashed ? '4 6' : undefined }}><Popup>{r.label} · {Math.round(r.azimuth)}°</Popup></Polyline>;
        })}
        {markers.map((m) => (
          <Marker key={`${m.kind}-${m.id}`} position={[m.lat, m.lng]} icon={icon(m)}>
            <Popup>
              <div className="min-w-[160px] text-sm">
                <p className="font-medium">{m.label}</p>
                {m.sub && <p className="text-xs opacity-70">{m.sub}</p>}
                <p className="font-mono text-[11px] opacity-60">{m.lat.toFixed(5)}, {m.lng.toFixed(5)}</p>
                {m.href && <Link href={m.href} className="mt-1 inline-block text-xs">Open →</Link>}
              </div>
            </Popup>
          </Marker>
        ))}
        {measure.length > 0 && <Polyline positions={measure} pathOptions={{ color: '#fbbf24', weight: 2, dashArray: '2 6' }} />}
        {measure.map((p, i) => <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: '#fbbf24' }} />)}
        {elev && (
          <Popup position={elev.p} eventHandlers={{ remove: () => setElev(null) }}>
            <span className="text-sm">{elev.err ? `Elevation ${elev.err}` : elev.v == null ? 'Looking up…' : `${fmtElev(elev.v)} above sea level`}</span>
            <span className="block text-[10px] opacity-60">Copernicus DEM (≈300 ft grid)</span>
          </Popup>
        )}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-8 left-3 right-14 z-[500] flex flex-wrap gap-2">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          {tool('measure', 'Measure', Ruler)}
          {tool('elev', 'Elevation', Mountain)}
          {allowPick && tool('pick', 'Drop pin', Crosshair)}
        </div>
        {mode === 'measure' && measure.length > 1 && (
          <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-ink-800/95 px-3 py-1.5 text-xs text-gold-300">
            {fmtShort(measureM)}
            <button onClick={() => setMeasure([])} aria-label="Clear measurement"><X size={12} /></button>
          </span>
        )}
        {mode !== 'none' && <span className="pointer-events-auto rounded-full bg-ink-950/80 px-3 py-1.5 text-[11px] text-zinc-300">{mode === 'pick' ? 'Click the map to drop a pin' : mode === 'measure' ? 'Click to add points' : 'Click to read elevation'}</span>}
      </div>
    </div>
  );
}
