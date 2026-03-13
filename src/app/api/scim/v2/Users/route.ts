import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';

function validateScimToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  return token === process.env.SCIM_BEARER_TOKEN;
}

// POST /api/scim/v2/Users — Create user
export async function POST(request: NextRequest) {
  if (!validateScimToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getSupabaseClient();
  const payload = await request.json();

  try {
    const oktaId = payload.externalId || payload.id;
    const email = payload.emails?.[0]?.value || payload.userName;
    const fullName = payload.displayName ||
      `${payload.name?.givenName || ''} ${payload.name?.familyName || ''}`.trim();
    const role = mapOktaGroupToRole(payload.groups);
    const managerId = payload['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']?.manager?.value;

    // Create user
    const { data: user, error } = await db
      .from('users')
      .insert({
        okta_id: oktaId,
        email,
        full_name: fullName,
        role,
      })
      .select('id')
      .single();

    if (error) {
      console.error('SCIM create user error:', error);
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    // Create hierarchy record if manager specified
    if (managerId) {
      const { data: manager } = await db
        .from('users')
        .select('id')
        .eq('okta_id', managerId)
        .single();

      if (manager) {
        await db.from('user_hierarchy').insert({
          user_id: user.id,
          manager_id: manager.id,
          effective_from: new Date().toISOString().split('T')[0],
        });
      } else {
        // Log warning — manager not yet provisioned
        await db.from('sync_log').insert({
          sync_type: 'scim',
          target_user_id: user.id,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          status: 'warning',
          error_message: `Manager ${managerId} not found — hierarchy pending`,
          raw_payload: payload,
        });
      }
    }

    // Log SCIM event
    await db.from('sync_log').insert({
      sync_type: 'scim',
      target_user_id: user.id,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: 'success',
      records_synced: 1,
      raw_payload: payload,
    });

    return NextResponse.json(
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        id: user.id,
        externalId: oktaId,
        userName: email,
        active: true,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('SCIM POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT /api/scim/v2/Users — Update user (Okta sends full replacement)
export async function PUT(request: NextRequest) {
  if (!validateScimToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getSupabaseClient();
  const payload = await request.json();

  try {
    const oktaId = payload.externalId || payload.id;
    const email = payload.emails?.[0]?.value || payload.userName;
    const fullName = payload.displayName ||
      `${payload.name?.givenName || ''} ${payload.name?.familyName || ''}`.trim();
    const role = mapOktaGroupToRole(payload.groups);
    const isActive = payload.active !== false;
    const managerId = payload['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']?.manager?.value;

    // Update user
    const { data: user, error } = await db
      .from('users')
      .update({
        email,
        full_name: fullName,
        role,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('okta_id', oktaId)
      .select('id')
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Handle manager change
    if (managerId) {
      const { data: manager } = await db
        .from('users')
        .select('id')
        .eq('okta_id', managerId)
        .single();

      if (manager) {
        // End-date current hierarchy
        const today = new Date().toISOString().split('T')[0];
        await db
          .from('user_hierarchy')
          .update({ effective_to: today })
          .eq('user_id', user.id)
          .is('effective_to', null);

        // Insert new hierarchy
        await db.from('user_hierarchy').insert({
          user_id: user.id,
          manager_id: manager.id,
          effective_from: today,
        });
      }
    }

    // If deactivated, end-date hierarchy
    if (!isActive) {
      const today = new Date().toISOString().split('T')[0];
      await db
        .from('user_hierarchy')
        .update({ effective_to: today })
        .eq('user_id', user.id)
        .is('effective_to', null);
    }

    // Log SCIM event
    await db.from('sync_log').insert({
      sync_type: 'scim',
      target_user_id: user.id,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: 'success',
      records_synced: 1,
      raw_payload: payload,
    });

    return NextResponse.json({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: user.id,
      externalId: oktaId,
      userName: email,
      active: isActive,
    });
  } catch (error) {
    console.error('SCIM PUT error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH /api/scim/v2/Users — Partial update (typically for deactivation)
export async function PATCH(request: NextRequest) {
  if (!validateScimToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getSupabaseClient();
  const payload = await request.json();

  try {
    // SCIM PATCH operations
    const operations = payload.Operations || [];
    for (const op of operations) {
      if (op.op === 'replace' && op.path === 'active' && op.value === false) {
        // Deactivation
        const oktaId = payload.externalId || payload.id;
        const { data: user } = await db
          .from('users')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('okta_id', oktaId)
          .select('id')
          .single();

        if (user) {
          const today = new Date().toISOString().split('T')[0];
          await db
            .from('user_hierarchy')
            .update({ effective_to: today })
            .eq('user_id', user.id)
            .is('effective_to', null);
        }
      }
    }

    return NextResponse.json({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'] });
  } catch (error) {
    console.error('SCIM PATCH error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function mapOktaGroupToRole(groups?: Array<{ display: string }>): string {
  if (!groups || groups.length === 0) return 'ae';

  const roleMap: Record<string, string> = {
    'RevenueIQ-CRO': 'cro',
    'RevenueIQ-CLevel': 'c_level',
    'RevenueIQ-VP': 'vp',
    'RevenueIQ-AVP': 'avp',
    'RevenueIQ-Manager': 'manager',
    'RevenueIQ-AE': 'ae',
    'RevenueIQ-RevOps-RO': 'revops_ro',
    'RevenueIQ-RevOps-RW': 'revops_rw',
    'RevenueIQ-Enterprise-RO': 'enterprise_ro',
  };

  for (const group of groups) {
    const role = roleMap[group.display];
    if (role) return role;
  }

  return 'ae';
}
