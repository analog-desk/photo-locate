import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicConfig, hasSupabase, serverConfig } from '../config';

/** Per-request client acting as the signed-in user (RLS applies). */
export async function supabaseServer(): Promise<SupabaseClient | null> {
  if (!hasSupabase()) return null;
  const store = await cookies();
  return createServerClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* called from a Server Component */ }
      },
    },
  });
}

export { supabaseAdmin } from './admin';
export const backendReady = () => hasSupabase() && Boolean(serverConfig().serviceRoleKey);
