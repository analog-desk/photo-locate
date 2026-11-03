'use client';
import dynamic from 'next/dynamic';
export type { MapMarker, MapRay, MapRoute } from './MapView';
export const Map = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-2xl bg-ink-850" />,
});
