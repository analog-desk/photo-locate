import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '../config';

let admin: SupabaseClient | null = null;
/** Service-role client for background jobs. Never import from client components. */
export function supabaseAdmin(): SupabaseClient | null {
  const key = serverConfig().serviceRoleKey;
  if (!publicConfig.supabaseUrl || !key) return null;
  admin ??= createClient(publicConfig.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
