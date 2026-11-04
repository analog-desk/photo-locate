'use client';
import { useCallback, useEffect, useState } from 'react';

export interface Place { lat: number; lng: number; label: string; source: 'gps' | 'search' | 'pin' | 'link' }

const KEY = 'varoseye.place';

/** Shared "where am I looking" state. GPS is only requested on an explicit user action. */
export function usePlace(initial?: Place | null) {
  const [place, setPlaceState] = useState<Place | null>(initial ?? null);
  const [gpsState, setGps] = useState<'idle' | 'asking' | 'denied' | 'unavailable' | 'ok'>('idle');
  useEffect(() => {
    if (initial) return;
    try { const s = localStorage.getItem(KEY); if (s) setPlaceState(JSON.parse(s)); } catch { /* storage unavailable */ }
  }, [initial]);
  const setPlace = useCallback((p: Place | null) => {
    setPlaceState(p);
    try { p ? localStorage.setItem(KEY, JSON.stringify(p)) : localStorage.removeItem(KEY); } catch { /* ignore */ }
  }, []);
  const requestGps = useCallback(() => {
    if (!('geolocation' in navigator)) { setGps('unavailable'); return; }
    setGps('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps('ok'); setPlace({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'My location', source: 'gps' }); },
      (err) => setGps(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 120000 },
    );
  }, [setPlace]);
  return { place, setPlace, requestGps, gpsState };
}
