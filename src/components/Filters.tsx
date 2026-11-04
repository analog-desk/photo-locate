'use client';
import { CATEGORIES, CATEGORY_LABELS, SORTS, SORT_LABELS, type Category, type SortKey } from '@/lib/types';
import { RADII_MI } from '@/lib/units';

export function CategoryChips({ value, onChange }: { value: Category[]; onChange: (v: Category[]) => void }) {
  const toggle = (c: Category) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <div className="flex flex-wrap gap-1.5">
      <button onClick={() => onChange([])} className={`chip ${value.length === 0 ? 'chip-on' : ''}`}>All</button>
      {CATEGORIES.map((c) => <button key={c} onClick={() => toggle(c)} className={`chip ${value.includes(c) ? 'chip-on' : ''}`}>{CATEGORY_LABELS[c]}</button>)}
    </div>
  );
}

export function RadiusSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5" role="radiogroup" aria-label="Search radius in miles">
      {RADII_MI.map((r) => (
        <button key={r} role="radio" aria-checked={value === r} onClick={() => onChange(r)}
          className={`rounded-full px-2.5 py-1 text-xs ${value === r ? 'bg-gold-400 text-ink-950' : 'text-zinc-300 hover:text-white'}`}>{r} mi</button>
      ))}
    </div>
  );
}

export function SortSelect({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as SortKey)} className="input w-auto py-1.5" aria-label="Sort locations">
      {SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
    </select>
  );
}
