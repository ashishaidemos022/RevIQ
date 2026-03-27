import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';
import { resolvePbmCreditedOpps, getPbmSfIdMap } from '@/lib/pbm/resolve-credited-opps';
import { getOrgSubtree } from '@/lib/supabase/queries/hierarchy';

const BOOKED_STAGES = [
  'Stage 8-Closed Won: Finance',
  'Stage 7-Closed Won',
  'Stage 6-Closed-Won: Finance Approved',
  'Stage 5-Closed Won',
];

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const targetUser = viewAsUser ?? user;
    const db = getSupabaseClient();

    const emptyResponse = {
      data: [],
      kpis: { booked_pilots: 0, win_rate: 0, conversion_rate: 0, avg_deal_duration: 0 },
    };

    // Resolve PBMs
    const pbmLocalIds = await resolvePbmUserIds(targetUser, db);
    if (pbmLocalIds.length === 0) {
      return NextResponse.json(emptyResponse);
    }

    const pbmSfIdMap = await getPbmSfIdMap(pbmLocalIds);
    const creditMap = await resolvePbmCreditedOpps(pbmSfIdMap);
    const creditedOppSfIds = [...creditMap.keys()];

    if (creditedOppSfIds.length === 0) {
      return NextResponse.json(emptyResponse);
    }

    // Fetch pilot opportunities from credited set
    type OppRow = Record<string, unknown>;
    let allPilots: OppRow[] = [];
    for (let i = 0; i < creditedOppSfIds.length; i += 500) {
      const batch = creditedOppSfIds.slice(i, i + 500);
      const { data } = await db
        .from('opportunities')
        .select('*, accounts(id, name, industry, region), users!opportunities_owner_user_id_fkey(id, full_name, email)')
        .eq('is_paid_pilot', true)
        .in('salesforce_opportunity_id', batch);
      if (data) allPilots = allPilots.concat(data as OppRow[]);
    }

    // PBM name lookup
    const { data: pbmUsers } = await db.from('users').select('id, full_name').in('id', pbmLocalIds);
    const pbmNameMap: Record<string, string> = {};
    (pbmUsers || []).forEach(u => { pbmNameMap[u.id] = u.full_name; });

    // KPI calculations
    const bookedPilots = allPilots.filter(p => BOOKED_STAGES.includes(p.stage as string));
    const bookedSfIds = bookedPilots.map(p => p.salesforce_opportunity_id as string);

    // Win Rate = won / (won + lost)
    const wonPilots = allPilots.filter(p => p.is_closed_won);
    const lostPilots = allPilots.filter(p => p.is_closed_lost);
    const winRate = (wonPilots.length + lostPilots.length) > 0
      ? (wonPilots.length / (wonPilots.length + lostPilots.length)) * 100
      : 0;

    // Conversion Rate = won child opps (referencing parent pilot) / booked pilots
    let conversionRate = 0;
    if (bookedSfIds.length > 0) {
      let wonChildCount = 0;
      for (let i = 0; i < bookedSfIds.length; i += 500) {
        const batch = bookedSfIds.slice(i, i + 500);
        const { count } = await db
          .from('opportunities')
          .select('id', { count: 'exact', head: true })
          .in('parent_pilot_opportunity_sf_id', batch)
          .eq('is_closed_won', true);
        wonChildCount += count || 0;
      }
      conversionRate = bookedPilots.length > 0
        ? (wonChildCount / bookedPilots.length) * 100
        : 0;
    }

    // Avg Deal Duration (Age)
    const now = Date.now();
    const ages = allPilots
      .map(p => {
        const created = p.sf_created_date as string | null;
        if (!created) return null;
        const createdMs = new Date(created).getTime();
        const end = p.close_date ? new Date(p.close_date as string).getTime() : now;
        return Math.floor((end - createdMs) / (1000 * 60 * 60 * 24));
      })
      .filter((a): a is number => a !== null && a >= 0);
    const avgDealDuration = ages.length > 0
      ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length)
      : 0;

    // Enrich with credit info and computed age + status
    const enriched = allPilots.map(opp => {
      const sfId = opp.salesforce_opportunity_id as string;
      const credits = creditMap.get(sfId) || [];
      const primaryCredit = credits[0] || null;

      let age: number | null = null;
      const created = opp.sf_created_date as string | null;
      if (created) {
        const createdMs = new Date(created).getTime();
        const end = opp.close_date ? new Date(opp.close_date as string).getTime() : now;
        age = Math.floor((end - createdMs) / (1000 * 60 * 60 * 24));
      }

      const isClosedWon = opp.is_closed_won as boolean;
      const isClosedLost = opp.is_closed_lost as boolean;
      const endDate = opp.paid_pilot_end_date as string | null;
      const today = new Date().toISOString().split('T')[0];

      let status: string;
      if (isClosedWon) status = 'Converted';
      else if (isClosedLost) status = 'Lost';
      else if (endDate && endDate < today) status = 'Expired';
      else status = 'Active';

      return {
        ...opp,
        age,
        pilot_status: status,
        credit_path: primaryCredit?.credit_path || null,
        partner_name: primaryCredit?.partner_name || null,
        credited_pbm_name: primaryCredit ? pbmNameMap[primaryCredit.pbm_local_id] || null : null,
        credited_pbm_id: primaryCredit?.pbm_local_id || null,
      };
    });

    // Sort: active first, then by close_date descending
    enriched.sort((a, b) => {
      const statusOrder: Record<string, number> = { Active: 0, Converted: 1, Expired: 2, Lost: 3 };
      const sa = statusOrder[a.pilot_status] ?? 4;
      const sb = statusOrder[b.pilot_status] ?? 4;
      if (sa !== sb) return sa - sb;
      const aOpp = a as OppRow;
      const bOpp = b as OppRow;
      const ea = (aOpp.close_date as string) || '';
      const eb = (bOpp.close_date as string) || '';
      return eb.localeCompare(ea);
    });

    return NextResponse.json({
      data: enriched,
      kpis: {
        booked_pilots: bookedPilots.length,
        win_rate: winRate,
        conversion_rate: conversionRate,
        avg_deal_duration: avgDealDuration,
      },
    });
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

  if (FULL_ACCESS_ROLES.includes(targetUser.role)) {
    const { data } = await db.from('users').select('id').eq('role', 'pbm').eq('is_active', true);
    return (data || []).map(u => u.id);
  }

  const subtree = await getOrgSubtree(targetUser.user_id);
  const allIds = [targetUser.user_id, ...subtree];
  const { data } = await db.from('users').select('id').eq('role', 'pbm').eq('is_active', true).in('id', allIds);
  return (data || []).map(u => u.id);
}
