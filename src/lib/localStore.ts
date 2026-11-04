'use client';
import { useCallback, useEffect, useState } from 'react';
import type { LocationDetail, LocationSummary } from './types';

/**
 * Favourites, collections, itineraries and shoot plans live on this device (no accounts).
 * Every read/write is guarded: private windows or blocked storage just behave as empty.
 */
export const KEYS = {
  favorites: 'varoseye.favorites',
  collections: 'varoseye.collections',
  itineraries: 'varoseye.itineraries',
  plans: 'varoseye.plans',
} as const;

export type SavedSpot = LocationSummary;
export interface Collection { id: string; title: string; createdAt: string; items: SavedSpot[] }
export interface Itinerary { id: string; title: string; createdAt: string; stops: { spot: SavedSpot; plannedAt?: string; notes?: string }[] }
export interface SavedPlan { id: string; createdAt: string; ref: string; name: string; lat: number; lng: number; date: string; target: string; arrivalAt: string | null; windowStart: string | null; windowEnd: string | null }

const EVENT = 'varoseye-storage';

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function write<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

/** React state bound to a localStorage key, kept in sync across components and tabs. */
export function useLocal<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    setValue(read(key, fallback));
    const sync = (e: Event) => {
      const k = e instanceof StorageEvent ? e.key : (e as CustomEvent).detail;
      if (k === key) setValue(read(key, fallback));
    };
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT, sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener(EVENT, sync); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = useCallback((next: T | ((prev: T) => T)) => {
    const v = typeof next === 'function' ? (next as (p: T) => T)(read(key, fallback)) : next;
    write(key, v);
    setValue(v);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, update] as const;
}

export const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));

/** Keep only the summary fields of a location (small enough for localStorage). */
export function toSaved(l: LocationSummary | LocationDetail): SavedSpot {
  return {
    id: l.id, slug: l.slug, name: l.name, lat: l.lat, lng: l.lng, country: l.country, region: l.region, nearestTown: l.nearestTown,
    categories: l.categories, heroImage: l.heroImage, photoScore: l.photoScore, popularityScore: l.popularityScore, scenicScore: l.scenicScore,
    conditions: null, hiddenGem: l.hiddenGem, communityRating: null, ratingCount: 0, discoveredAt: l.discoveredAt, updatedAt: l.updatedAt,
    confidence: l.confidence, sources: l.sources,
  };
}

export function exportAll(): string {
  return JSON.stringify(Object.fromEntries(Object.entries(KEYS).map(([k, key]) => [k, read(key, [])])), null, 2);
}
export function importAll(json: string) {
  const data = JSON.parse(json);
  for (const [k, key] of Object.entries(KEYS)) if (Array.isArray(data[k])) write(key, data[k]);
}
