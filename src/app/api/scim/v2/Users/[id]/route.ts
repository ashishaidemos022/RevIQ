import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';

function validateScimToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  return token === process.env.SCIM_BEARER_TOKEN;
}

// GET /api/scim/v2/Users/:id — Get individual user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateScimToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = getSupabaseClient();

  const { data: user, error } = await db
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !user) {
    return NextResponse.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'User not found',
      status: 404,
    }, { status: 404 });
  }

  return NextResponse.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.id,
    externalId: user.okta_id,
    userName: user.email,
    name: { formatted: user.full_name },
    displayName: user.full_name,
    emails: [{ primary: true, value: user.email, type: 'work' }],
    active: user.is_active,
  });
}
