import { BadgeCheck, CircleAlert, Info } from 'lucide-react';
import type { Sourced } from '@/lib/types';

export function ScoreRing({ value, label, tone = 'gold', size = 44 }: { value: number | null; label: string; tone?: 'gold' | 'dusk' | 'zinc'; size?: number }) {
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  const color = tone === 'gold' ? '#ffc56b' : tone === 'dusk' ? '#7593f5' : '#a1a1aa';
  return (
    <div className="flex items-center gap-2" title={`${label}: ${value ?? 'n/a'}/100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth={4} fill="none" />
        {value != null && <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={4} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} strokeLinecap="round" />}
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="rotate-90 fill-zinc-100 text-[12px] font-semibold" style={{ transformOrigin: 'center' }}>{value ?? '—'}</text>
      </svg>
      <span className="text-[11px] leading-tight text-zinc-400">{label}</span>
    </div>
  );
}

export function Verified<T>({ s, render, empty = 'Unverified' }: { s: Sourced<T> | undefined; render?: (v: T) => React.ReactNode; empty?: string }) {
  if (!s || s.value == null) {
    return <span className="inline-flex items-center gap-1 text-zinc-500"><CircleAlert size={13} /> {empty}{s?.source ? <span className="text-zinc-600"> · {s.source}</span> : null}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {render ? render(s.value) : String(s.value)}
      {s.verified ? (
        <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400/90" title={`Source: ${s.source}`}><BadgeCheck size={12} />{s.source}</a>
      ) : (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400/90" title={s.source}><Info size={12} />{s.source ?? 'estimate'}</span>
      )}
    </span>
  );
}

export function Freshness({ iso, label = 'Updated' }: { iso: string | null | undefined; label?: string }) {
  if (!iso) return <span className="text-xs text-zinc-500">{label}: never</span>;
  const h = (Date.now() - Date.parse(iso)) / 3600_000;
  const tone = h < 7 ? 'text-emerald-400' : h < 48 ? 'text-amber-300' : 'text-rose-400';
  const txt = h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
  return <span className={`text-xs ${tone}`} title={new Date(iso).toLocaleString()}>{label} {txt}</span>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="h-display text-xl text-zinc-200">{title}</p>
      {children && <div className="max-w-lg text-sm text-zinc-400">{children}</div>}
    </div>
  );
}

export function Section({ title, kicker, action, children, id }: { title: string; kicker?: string; action?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          {kicker && <p className="label mb-1">{kicker}</p>}
          <h2 className="section-title">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
