import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { logAudit } from '@/lib/audit';

function validateScimToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  return token === process.env.SCIM_BEARER_TOKEN;
}

// GET /api/scim/v2/Users — List/search users (Okta uses this to test connection)
export async function GET(request: NextRequest) {
  if (!validateScimToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getSupabaseClient();
  const url = request.nextUrl;
  const filter = url.searchParams.get('filter');
  const startIndex = parseInt(url.searchParams.get('startIndex') || '1');
  const count = parseInt(url.searchParams.get('count') || '100');

  try {
    let query = db.from('users').select('*', { count: 'exact' });

    // Handle SCIM filter (e.g., userName eq "user@example.com")
    if (filter) {
      const match = filter.match(/userName\s+eq\s+"(.+?)"/);
      if (match) {
        query = query.eq('email', match[1]);
      }
    }

    const { data: users, count: totalCount, error } = await query
      .range(startIndex - 1, startIndex - 1 + count - 1)
      .order('created_at');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: totalCount || 0,
      startIndex,
      itemsPerPage: count,
      Resources: (users || []).map(u => ({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        id: u.id,
        externalId: u.okta_id,
        userName: u.email,
        name: { formatted: u.full_name },
        displayName: u.full_name,
        emails: [{ primary: true, value: u.email, type: 'work' }],
        active: u.is_active,
      })),
    });
  } catch (error) {
    console.error('SCIM GET Users error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
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
    const enterprise = payload['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'];
    const managerExt = payload['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager.email'];
    const talkdeskExt = payload['urn:ietf:params:scim:schemas:extension:talkdesk:1.0:User'];
    const roleExt = payload['urn:ietf:params:scim:schemas:extension:talkdesk:1.0:User:role'];
    const role = validateRole(roleExt?.role) || validateRole(talkdeskExt?.role) || mapOktaGroupToRole(payload.groups);
    const region = talkdeskExt?.region || null;
    const managerId = enterprise?.manager?.value;
    const department = enterprise?.department || payload.department || null;
    const title = payload.title || null;
    const countryCode = payload.addresses?.[0]?.country || payload.locale || null;
    const managerEmail = managerExt?.managerEmail || enterprise?.manager?.email || null;
    const managerDisplayName = enterprise?.manager?.displayName || null;

    // Create user
    const { data: user, error } = await db
      .from('users')
      .insert({
        okta_id: oktaId,
        email,
        full_name: fullName,
        role,
        region,
        department,
        title,
        country_code: countryCode,
        manager_email: managerEmail,
        manager_display_name: managerDisplayName,
      })
      .select('id')
      .single();

    if (error) {
      console.error('SCIM create user error:', error);
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    // Create hierarchy record if manager specified
    // Look up manager by email first (most reliable), then by okta_id
    if (managerId || managerEmail) {
      let managerRecord = null;
      if (managerEmail) {
        const { data } = await db.from('users').select('id').eq('email', managerEmail).single();
        managerRecord = data;
      }
      if (!managerRecord && managerId) {
        const { data } = await db.from('users').select('id').eq('okta_id', managerId).single();
        managerRecord = data;
      }
      const manager = managerRecord;

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

    logAudit({
      event_type: 'scim.create',
      target_type: 'user',
      target_id: user.id,
      target_label: fullName,
      after_state: { email, role, region, department, title },
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
    const isActive = payload.active !== false;
    const enterprise = payload['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'];
    const managerExt = payload['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager.email'];
    const talkdeskExt = payload['urn:ietf:params:scim:schemas:extension:talkdesk:1.0:User'];
    const roleExt = payload['urn:ietf:params:scim:schemas:extension:talkdesk:1.0:User:role'];
    const role = validateRole(roleExt?.role) || validateRole(talkdeskExt?.role) || mapOktaGroupToRole(payload.groups);
    const region = talkdeskExt?.region || null;
    const managerId = enterprise?.manager?.value;
    const department = enterprise?.department || payload.department || null;
    const title = payload.title || null;
    const countryCode = payload.addresses?.[0]?.country || payload.locale || null;
    const managerEmail = managerExt?.managerEmail || enterprise?.manager?.email || null;
    const managerDisplayName = enterprise?.manager?.displayName || null;

    // Update user
    const { data: user, error } = await db
      .from('users')
      .update({
        email,
        full_name: fullName,
        role,
        is_active: isActive,
        region,
        department,
        title,
        country_code: countryCode,
        manager_email: managerEmail,
        manager_display_name: managerDisplayName,
        updated_at: new Date().toISOString(),
      })
      .eq('okta_id', oktaId)
      .select('id')
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Handle manager change — look up by email first, then okta_id
    if (managerId || managerEmail) {
      let managerRecord = null;
      if (managerEmail) {
        const { data } = await db.from('users').select('id').eq('email', managerEmail).single();
        managerRecord = data;
      }
      if (!managerRecord && managerId) {
        const { data } = await db.from('users').select('id').eq('okta_id', managerId).single();
        managerRecord = data;
      }
      const manager = managerRecord;

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

const VALID_ROLES = ['other', 'commercial_ae', 'enterprise_ae', 'pbm', 'leader', 'cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];

function validateRole(role?: string): string | null {
  if (!role) return null;
  const normalized = role.toLowerCase().trim();
  return VALID_ROLES.includes(normalized) ? normalized : null;
}

function mapOktaGroupToRole(groups?: Array<{ display: string }>): string {
  if (!groups || groups.length === 0) return 'other';

  const roleMap: Record<string, string> = {
    'RevenueIQ-CRO': 'cro',
    'RevenueIQ-CLevel': 'c_level',
    'RevenueIQ-Leader': 'leader',
    'RevenueIQ-AE': 'other',
    'RevenueIQ-RevOps-RO': 'revops_ro',
    'RevenueIQ-RevOps-RW': 'revops_rw',
    'RevenueIQ-Enterprise-RO': 'enterprise_ro',
  };

  for (const group of groups) {
    const role = roleMap[group.display];
    if (role) return role;
  }

  return 'other';
}
