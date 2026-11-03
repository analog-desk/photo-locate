import { fail, json } from '@/lib/api';
import { detail } from '@/lib/repo';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const r = await detail(decodeURIComponent(id));
    if (!r.data) return fail(404, 'location not found');
    return json(r, { cache: 900 });
  } catch (e: any) {
    return fail(502, e?.message ?? 'provider error');
  }
}
