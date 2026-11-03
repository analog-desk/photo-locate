'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicConfig, hasSupabase } from '../config';

let client: SupabaseClient | null = null;
export function supabaseBrowser(): SupabaseClient | null {
  if (!hasSupabase()) return null;
  client ??= createBrowserClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey) as unknown as SupabaseClient;
  return client;
}
