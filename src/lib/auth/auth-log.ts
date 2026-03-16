import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';

type AuthEventType =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'jit_provision';

type AuthMethod = 'saml' | 'dev_login';

interface AuthLogEntry {
  event_type: AuthEventType;
  auth_method: AuthMethod;
  user_id?: string | null;
  email?: string | null;
  failure_reason?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

export function extractRequestMeta(request: NextRequest) {
  return {
    ip_address:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null,
    user_agent: request.headers.get('user-agent') || null,
  };
}

export async function logAuthEvent(entry: AuthLogEntry): Promise<void> {
  try {
    const db = getSupabaseClient();
    await db.from('auth_log').insert({
      event_type: entry.event_type,
      auth_method: entry.auth_method,
      user_id: entry.user_id || null,
      email: entry.email || null,
      failure_reason: entry.failure_reason || null,
      ip_address: entry.ip_address || null,
      user_agent: entry.user_agent || null,
    });
  } catch (error) {
    // Never let auth logging failures block the auth flow
    console.error('Failed to write auth log:', error);
  }
}
