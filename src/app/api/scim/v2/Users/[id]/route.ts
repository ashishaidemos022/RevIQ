import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';

function validateScimToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  return token === process.env.SCIM_BEARER_TOKEN;
}

type RouteContext = { params: Promise<{ id: string }> };

function toScimUser(user: Record<string, unknown>) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.id,
    externalId: user.okta_id,
    userName: user.email,
    name: { formatted: user.full_name },
    displayName: user.full_name,
    title: user.title,
    emails: [{ primary: true, value: user.email, type: 'work' }],
    active: user.is_active,
    'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
      department: user.department,
      manager: user.manager_email
        ? { email: user.manager_email, displayName: user.manager_display_name }
        : undefined,
    },
  };
}

// GET /api/scim/v2/Users/:id
export async function GET(request: NextRequest, { params }: RouteContext) {
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

  return NextResponse.json(toScimUser(user));
}

// PUT /api/scim/v2/Users/:id — Full replacement update
export async function PUT(request: NextRequest, { params }: RouteContext) {
  if (!validateScimToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = getSupabaseClient();
  const payload = await request.json();

  try {
    const email = payload.emails?.[0]?.value || payload.userName;
    const fullName = payload.displayName ||
      `${payload.name?.givenName || ''} ${payload.name?.familyName || ''}`.trim();
    const isActive = payload.active !== false;
    const enterprise = payload['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'];
    const department = enterprise?.department || payload.department || null;
    const title = payload.title || null;
    const countryCode = payload.addresses?.[0]?.country || payload.locale || null;
    const managerEmail = enterprise?.manager?.email || null;
    const managerDisplayName = enterprise?.manager?.displayName || null;
    const managerId = enterprise?.manager?.value;

    const { data: user, error } = await db
      .from('users')
      .update({
        email,
        full_name: fullName,
        is_active: isActive,
        department,
        title,
        country_code: countryCode,
        manager_email: managerEmail,
        manager_display_name: managerDisplayName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !user) {
      return NextResponse.json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User not found',
        status: 404,
      }, { status: 404 });
    }

    // Handle manager hierarchy change
    if (managerId) {
      const { data: manager } = await db
        .from('users')
        .select('id')
        .eq('okta_id', managerId)
        .single();

      if (manager) {
        const today = new Date().toISOString().split('T')[0];
        await db
          .from('user_hierarchy')
          .update({ effective_to: today })
          .eq('user_id', user.id)
          .is('effective_to', null);

        await db.from('user_hierarchy').insert({
          user_id: user.id,
          manager_id: manager.id,
          effective_from: today,
        });
      }
    }

    if (!isActive) {
      const today = new Date().toISOString().split('T')[0];
      await db
        .from('user_hierarchy')
        .update({ effective_to: today })
        .eq('user_id', user.id)
        .is('effective_to', null);
    }

    await db.from('sync_log').insert({
      sync_type: 'scim',
      target_user_id: user.id,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: 'success',
      records_synced: 1,
      raw_payload: payload,
    });

    return NextResponse.json(toScimUser(user));
  } catch (error) {
    console.error('SCIM PUT error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH /api/scim/v2/Users/:id — Partial update
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!validateScimToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = getSupabaseClient();
  const payload = await request.json();

  try {
    const operations = payload.Operations || [];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    for (const op of operations) {
      if (op.op === 'replace') {
        // Handle bulk replace (no path, value is an object of fields)
        if (!op.path && typeof op.value === 'object') {
          if (op.value.active !== undefined) updates.is_active = op.value.active;
          if (op.value.userName) updates.email = op.value.userName;
          if (op.value.displayName) updates.full_name = op.value.displayName;
          if (op.value.title) updates.title = op.value.title;
          if (op.value.name?.formatted) updates.full_name = op.value.name.formatted;
          if (op.value.emails?.[0]?.value) updates.email = op.value.emails[0].value;
          if (op.value.addresses?.[0]?.country) updates.country_code = op.value.addresses[0].country;
          const ent = op.value['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'];
          if (ent?.department) updates.department = ent.department;
          if (ent?.manager?.email) updates.manager_email = ent.manager.email;
          if (ent?.manager?.displayName) updates.manager_display_name = ent.manager.displayName;
          continue;
        }

        // Handle path-specific replace
        switch (op.path) {
          case 'active':
            updates.is_active = op.value;
            break;
          case 'userName':
            updates.email = op.value;
            break;
          case 'displayName':
            updates.full_name = op.value;
            break;
          case 'title':
            updates.title = op.value;
            break;
          case 'name.formatted':
            updates.full_name = op.value;
            break;
          case 'emails[type eq "work"].value':
            updates.email = op.value;
            break;
          case 'addresses[type eq "work"].country':
            updates.country_code = op.value;
            break;
          case 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department':
            updates.department = op.value;
            break;
          case 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager.email':
            updates.manager_email = op.value;
            break;
          case 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager.displayName':
            updates.manager_display_name = op.value;
            break;
        }
      }
    }

    const { data: user, error } = await db
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !user) {
      return NextResponse.json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User not found',
        status: 404,
      }, { status: 404 });
    }

    // Handle deactivation — end-date hierarchy
    if (updates.is_active === false) {
      const today = new Date().toISOString().split('T')[0];
      await db
        .from('user_hierarchy')
        .update({ effective_to: today })
        .eq('user_id', user.id)
        .is('effective_to', null);
    }

    await db.from('sync_log').insert({
      sync_type: 'scim',
      target_user_id: user.id,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: 'success',
      records_synced: 1,
      raw_payload: payload,
    });

    return NextResponse.json(toScimUser(user));
  } catch (error) {
    console.error('SCIM PATCH error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
