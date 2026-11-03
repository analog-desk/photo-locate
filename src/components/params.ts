import { CATEGORIES, SORTS, type Category, type SortKey } from '@/lib/types';
export const parseCats = (v: string | null): Category[] => (v ?? '').split(',').filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
export const parseSortClient = (v: string | null): SortKey => ((SORTS as readonly string[]).includes(v ?? '') ? (v as SortKey) : 'score');
