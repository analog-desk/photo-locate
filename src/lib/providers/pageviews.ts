import { fetchJson } from '../http';

/** Wikimedia REST pageviews — a real, public popularity signal for notable places. */
export async function dailyPageviews(title: string, lang = 'en', days = 60): Promise<{ date: string; views: number }[]> {
  const end = new Date(Date.now() - 86400000);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/daily/${fmt(start)}/${fmt(end)}`;
  try {
    const r = await fetchJson<{ items: { timestamp: string; views: number }[] }>(url, { provider: 'pageviews', revalidate: 43200, retries: 1 });
    return r.items.map((i) => ({ date: `${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}-${i.timestamp.slice(6, 8)}`, views: i.views }));
  } catch {
    return [];
  }
}

/** Ratio of the last 7 days' average views vs the preceding 30 days. >1.25 = gaining attention. */
export function momentum(series: { views: number }[]) {
  if (series.length < 14) return { recentAvg: 0, baselineAvg: 0, ratio: 1 };
  const recent = series.slice(-7), base = series.slice(-37, -7);
  const avg = (a: { views: number }[]) => a.reduce((s, x) => s + x.views, 0) / Math.max(1, a.length);
  const r = avg(recent), b = avg(base);
  return { recentAvg: r, baselineAvg: b, ratio: b > 0 ? r / b : 1 };
}
