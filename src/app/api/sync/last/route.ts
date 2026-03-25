import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';

export async function GET() {
  try {
    await requireAuth();
    const db = getSupabaseClient();

    // Get last successful sync for each type
    const { data: sfSync } = await db
      .from('sync_log')
      .select('completed_at')
      .eq('sync_type', 'salesforce')
      .in('status', ['success', 'partial'])
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    const { data: snowflakeSync } = await db
      .from('sync_log')
      .select('completed_at')
      .eq('sync_type', 'snowflake')
      .in('status', ['success', 'partial'])
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      salesforce: sfSync?.completed_at || null,
      snowflake: snowflakeSync?.completed_at || null,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
