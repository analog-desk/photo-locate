/**
 * Resilient fetch for third-party data providers:
 *  - per-host rate limiting (min interval between requests, respects provider policies)
 *  - timeout
 *  - exponential backoff retries on network errors / 429 / 5xx, honouring Retry-After
 *  - descriptive User-Agent (required by OSM & Wikimedia usage policies)
 */
const HOST_MIN_INTERVAL_MS: Record<string, number> = {
  'nominatim.openstreetmap.org': 1100, // hard limit 1 req/s
  'overpass-api.de': 1500,
  'query.wikidata.org': 500,
  'commons.wikimedia.org': 150,
  'wikimedia.org': 100,
  'api.open-meteo.com': 50,
  'api.windy.com': 250,
  'api.flickr.com': 400,
  'api.openrouteservice.org': 1600, // 40/min on free tier
};

const lastCall = new Map<string, Promise<void>>();

function minIntervalFor(host: string) {
  for (const [h, ms] of Object.entries(HOST_MIN_INTERVAL_MS)) if (host === h || host.endsWith('.' + h)) return ms;
  return 0;
}

async function throttle(host: string) {
  const interval = minIntervalFor(host);
  if (!interval) return;
  const prev = lastCall.get(host) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  lastCall.set(host, prev.then(() => next));
  await prev;
  setTimeout(release, interval);
}

export class ProviderError extends Error {
  constructor(message: string, public status?: number, public provider?: string) { super(message); }
}

export interface FetchOpts extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  provider?: string;
  /** Next.js data cache revalidation seconds (ignored outside Next). */
  revalidate?: number;
}

function userAgent() {
  const contact = (typeof process !== 'undefined' && process.env.DATA_CONTACT) || 'lumen-photo-atlas (self-hosted)';
  return `LumenPhotoAtlas/0.1 (${contact})`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { timeoutMs = 20000, retries = 3, provider, revalidate, ...init } = opts;
  const host = new URL(url).host;
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retries) {
    await throttle(host);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      if (!headers.has('User-Agent')) headers.set('User-Agent', userAgent());
      if (!headers.has('Accept')) headers.set('Accept', 'application/json');
      const res = await fetch(url, {
        ...init,
        headers,
        signal: ctrl.signal,
        ...(revalidate !== undefined ? { next: { revalidate } } : {}),
      } as RequestInit);
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'));
        lastErr = new ProviderError(`${provider ?? host} responded ${res.status}`, res.status, provider);
        if (attempt === retries) throw lastErr;
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 60000) : 2 ** attempt * 1000 + Math.random() * 400);
        attempt++;
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (e instanceof ProviderError && e.status && e.status < 500 && e.status !== 429) throw e;
      if (attempt === retries) break;
      await sleep(2 ** attempt * 1000 + Math.random() * 400);
      attempt++;
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr instanceof Error ? lastErr : new ProviderError(`Request to ${host} failed`, undefined, provider);
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetchWithRetry(url, opts);
  if (!res.ok) throw new ProviderError(`${opts.provider ?? url} responded ${res.status}`, res.status, opts.provider);
  return (await res.json()) as T;
}
