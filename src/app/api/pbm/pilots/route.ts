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

    // Resolve PBMs
    const pbmLocalIds = await resolvePbmUserIds(targetUser, db);
    if (pbmLocalIds.length === 0) {
      return NextResponse.json({ data: [], kpis: { active: 0, total_acv: 0, conversion_rate: 0, avg_duration: 0, expiring_30d: 0 } });
    }

    const pbmSfIdMap = await getPbmSfIdMap(pbmLocalIds);
    const creditMap = await resolvePbmCreditedOpps(pbmSfIdMap);
    const creditedOppSfIds = [...creditMap.keys()];

    if (creditedOppSfIds.length === 0) {
      return NextResponse.json({ data: [], kpis: { active: 0, total_acv: 0, conversion_rate: 0, avg_duration: 0, expiring_30d: 0 } });
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

    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let activePilots = 0;
    let totalPilotAcv = 0;
    let convertedPilots = 0;
    let totalPilots = 0;
    let totalDuration = 0;
    let durationCount = 0;
    let expiring30d = 0;

    const enriched = allPilots.map(opp => {
      const sfId = opp.salesforce_opportunity_id as string;
      const credits = creditMap.get(sfId) || [];
      const primaryCredit = credits[0] || null;

      const isClosedWon = opp.is_closed_won as boolean;
      const isClosedLost = opp.is_closed_lost as boolean;
      const endDate = opp.paid_pilot_end_date as string | null;
      const startDate = opp.paid_pilot_start_date as string | null;
      const closeDate = opp.close_date as string | null;
      const acv = parseFloat(opp.acv as string) || 0;

      totalPilots++;

      let status: string;
      if (isClosedWon) {
        status = 'Converted';
        convertedPilots++;
        if (startDate && closeDate) {
          totalDuration += Math.ceil(
            (new Date(closeDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
          );
          durationCount++;
        }
      } else if (isClosedLost) {
        status = 'Lost';
      } else if (endDate && endDate < today) {
        status = 'Expired';
      } else {
        status = 'Active';
        activePilots++;
        totalPilotAcv += acv;
        if (endDate && endDate <= thirtyDaysOut) {
          expiring30d++;
        }
      }

      return {
        ...opp,
        pilot_status: status,
        credit_path: primaryCredit?.credit_path || null,
        partner_name: primaryCredit?.partner_name || null,
        credited_pbm_name: primaryCredit ? pbmNameMap[primaryCredit.pbm_local_id] || null : null,
        credited_pbm_id: primaryCredit?.pbm_local_id || null,
      };
    });

    // Sort: active first, then by end date ascending
    enriched.sort((a, b) => {
      const statusOrder: Record<string, number> = { Active: 0, Converted: 1, Expired: 2, Lost: 3 };
      const sa = statusOrder[a.pilot_status] ?? 4;
      const sb = statusOrder[b.pilot_status] ?? 4;
      if (sa !== sb) return sa - sb;
      const aOpp = a as OppRow;
      const bOpp = b as OppRow;
      const ea = (aOpp.paid_pilot_end_date as string) || 'z';
      const eb = (bOpp.paid_pilot_end_date as string) || 'z';
      return ea.localeCompare(eb);
    });

    const conversionRate = totalPilots > 0 ? (convertedPilots / totalPilots) * 100 : 0;
    const avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

    return NextResponse.json({
      data: enriched,
      kpis: {
        active: activePilots,
        total_acv: totalPilotAcv,
        conversion_rate: conversionRate,
        avg_duration: avgDuration,
        expiring_30d: expiring30d,
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
