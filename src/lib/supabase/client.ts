'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicConfig, hasSupabase } from '../config';

let client: SupabaseClient | null = null;
/** Browser client (anon key + row-level security). Sessions persist in localStorage; magic-link codes are picked up from the URL. */
export function supabaseBrowser(): SupabaseClient | null {
  if (!hasSupabase() || typeof window === 'undefined') return null;
  client ??= createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  return client;
}
