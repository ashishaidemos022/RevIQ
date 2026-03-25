import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';
import { resolvePbmCreditedOpps, getPbmSfIdMap } from '@/lib/pbm/resolve-credited-opps';
import { getOrgSubtree } from '@/lib/supabase/queries/hierarchy';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const targetUser = viewAsUser ?? user;
    const db = getSupabaseClient();
    const url = request.nextUrl;

    const status = url.searchParams.get('status'); // open | closed_won | closed_lost | all
    const isPaidPilot = url.searchParams.get('is_paid_pilot');
    const sortBy = url.searchParams.get('sort_by') || 'close_date'; // acv | close_date
    const sortAsc = url.searchParams.get('sort_asc') === 'true';
    const closeDateLte = url.searchParams.get('close_date_lte');
    const limit = parseInt(url.searchParams.get('limit') || '200');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Resolve which PBMs to include
    const pbmLocalIds = await resolvePbmUserIds(targetUser, db);
    if (pbmLocalIds.length === 0) {
      return NextResponse.json({ data: [], total: 0 });
    }

    // Resolve PBM SF IDs and get credited opps
    const pbmSfIdMap = await getPbmSfIdMap(pbmLocalIds);
    const creditMap = await resolvePbmCreditedOpps(pbmSfIdMap);

    if (creditMap.size === 0) {
      return NextResponse.json({ data: [], total: 0 });
    }

    // Get all credited opp SF IDs
    const creditedOppSfIds = [...creditMap.keys()];

    // Fetch opportunities in batches
    type OppRow = Record<string, unknown>;
    let allOpps: OppRow[] = [];
    for (let i = 0; i < creditedOppSfIds.length; i += 500) {
      const batch = creditedOppSfIds.slice(i, i + 500);
      let query = db
        .from('opportunities')
        .select('*, accounts(id, name, industry, region), users!opportunities_owner_user_id_fkey(id, full_name, email)')
        .in('salesforce_opportunity_id', batch);

      // Apply status filter
      if (status === 'open') {
        query = query.eq('is_closed_won', false).eq('is_closed_lost', false);
      } else if (status === 'closed_won') {
        query = query.eq('is_closed_won', true);
      } else if (status === 'closed_lost') {
        query = query.eq('is_closed_lost', true);
      }

      if (isPaidPilot === 'true') {
        query = query.eq('is_paid_pilot', true);
      } else if (isPaidPilot === 'false') {
        query = query.eq('is_paid_pilot', false);
      }

      if (closeDateLte) {
        query = query.lte('close_date', closeDateLte);
      }

      const { data } = await query;
      if (data) allOpps = allOpps.concat(data as OppRow[]);
    }

    // Sort
    allOpps.sort((a, b) => {
      const aVal = sortBy === 'acv' ? ((a.acv as number) || 0) : ((a.close_date as string) || '');
      const bVal = sortBy === 'acv' ? ((b.acv as number) || 0) : ((b.close_date as string) || '');
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortAsc ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortAsc ? cmp : -cmp;
    });

    const total = allOpps.length;

    // Enrich with credit info and PBM name
    // Build PBM name lookup
    const { data: pbmUsers } = await db
      .from('users')
      .select('id, full_name')
      .in('id', pbmLocalIds);
    const pbmNameMap: Record<string, string> = {};
    (pbmUsers || []).forEach(u => { pbmNameMap[u.id] = u.full_name; });

    const enriched = allOpps.map(opp => {
      const sfId = opp.salesforce_opportunity_id as string;
      const credits = creditMap.get(sfId) || [];
      // Pick the first credit for the target PBM(s)
      const primaryCredit = credits[0] || null;
      return {
        ...opp,
        credit_path: primaryCredit?.credit_path || null,
        partner_name: primaryCredit?.partner_name || null,
        credited_pbm_name: primaryCredit ? pbmNameMap[primaryCredit.pbm_local_id] || null : null,
        credited_pbm_id: primaryCredit?.pbm_local_id || null,
      };
    });

    return NextResponse.json({ data: enriched, total });
  } catch (error) {
    return handleAuthError(error);
  }
}

async function resolvePbmUserIds(
  targetUser: { user_id: string; role: string },
  db: ReturnType<typeof getSupabaseClient>
): Promise<string[]> {
  const FULL_ACCESS_ROLES = ['cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];

  if (targetUser.role === 'pbm') {
    return [targetUser.user_id];
  }

  // Full access roles → all PBMs
  if (FULL_ACCESS_ROLES.includes(targetUser.role)) {
    const { data } = await db
      .from('users')
      .select('id')
      .eq('role', 'pbm')
      .eq('is_active', true);
    return (data || []).map(u => u.id);
  }

  // Manager+ → PBMs in their org subtree
  const subtree = await getOrgSubtree(targetUser.user_id);
  const allIds = [targetUser.user_id, ...subtree];

  const { data } = await db
    .from('users')
    .select('id')
    .eq('role', 'pbm')
    .eq('is_active', true)
    .in('id', allIds);

  return (data || []).map(u => u.id);
}
