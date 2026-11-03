import { NextResponse } from 'next/server';
import { serverConfig } from './config';
import { CATEGORIES, SORTS, type Category, type SortKey } from './types';

export const json = (data: unknown, init: ResponseInit & { cache?: number } = {}) =>
  NextResponse.json(data, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(init.cache ? { 'Cache-Control': `public, s-maxage=${init.cache}, stale-while-revalidate=${init.cache * 2}` } : {}) },
  });

export const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export function num(v: string | null, min: number, max: number): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function parseCats(v: string | null): Category[] {
  return (v ?? '').split(',').filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
}

export function parseSort(v: string | null): SortKey {
  return (SORTS as readonly string[]).includes(v ?? '') ? (v as SortKey) : 'score';
}

/** Constant-time bearer check for cron/worker endpoints. */
export function authorizedCron(req: Request): boolean {
  const secret = serverConfig().cronSecret;
  if (!secret) return false;
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (got.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}
