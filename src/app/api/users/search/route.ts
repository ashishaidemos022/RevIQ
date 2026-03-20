import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';
import { VIEW_AS_ROLES } from '@/lib/constants';
import { UserRole } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    if (!VIEW_AS_ROLES.includes(user.role as UserRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ data: [] });
    }

    const db = getSupabaseClient();
    const pattern = `%${q}%`;

    const { data, error } = await db
      .from('users')
      .select('id, full_name, email, role, region')
      .eq('is_active', true)
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .order('full_name')
      .limit(20);

    if (error) {
      console.error('[USERS_SEARCH] Error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: (data || []).map(u => ({
        user_id: u.id,
        full_name: u.full_name,
        email: u.email,
        role: u.role,
        region: u.region,
      })),
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
