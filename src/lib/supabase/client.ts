import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isDemoMode } from '@/lib/demo';
import { createMockSupabaseClient } from '@/lib/mock/client';

let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  // In demo mode, return the mock client — no real Supabase connection
  if (isDemoMode()) {
    return createMockSupabaseClient() as unknown as SupabaseClient;
  }

  if (supabase) return supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return supabase;
}
