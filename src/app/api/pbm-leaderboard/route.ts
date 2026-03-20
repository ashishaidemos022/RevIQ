import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';
import { getQuarterStartDate, getQuarterEndDate, getFiscalYearRange, getCurrentFiscalPeriod } from '@/lib/fiscal';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const db = getSupabaseClient();
    const url = request.nextUrl;

    const board = url.searchParams.get('board') || 'revenue'; // revenue | pipeline | pilots
    const period = url.searchParams.get('period') || 'qtd'; // qtd | prev_qtd | ytd
    const region = url.searchParams.get('region') || 'combined'; // combined | AMER | EMEA | APAC
    const managerIdsParam = url.searchParams.get('manager_ids');
    const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();

    // Date range
    let startStr: string | undefined;
    let endStr: string | undefined;

    if (period === 'qtd') {
      const start = getQuarterStartDate(fiscalYear, fiscalQuarter);
      const end = getQuarterEndDate(fiscalYear, fiscalQuarter);
      startStr = start.toISOString().split('T')[0];
      endStr = end.toISOString().split('T')[0];
    } else if (period === 'prev_qtd') {
      let prevQ = fiscalQuarter - 1;
      let prevFY = fiscalYear;
      if (prevQ === 0) { prevQ = 4; prevFY--; }
      const start = getQuarterStartDate(prevFY, prevQ);
      const end = getQuarterEndDate(prevFY, prevQ);
      startStr = start.toISOString().split('T')[0];
      endStr = end.toISOString().split('T')[0];
    } else if (period === 'ytd') {
      const { start, end } = getFiscalYearRange(fiscalYear);
      startStr = start.toISOString().split('T')[0];
      endStr = end.toISOString().split('T')[0];
    }

    // If manager_ids provided, resolve their direct reports to filter PBMs
    let managerPbmIds: string[] | null = null;
    if (managerIdsParam) {
      const managerIds = managerIdsParam.split(',').filter(Boolean);
      if (managerIds.length > 0) {
        const { data: hierarchyRows } = await db
          .from('user_hierarchy')
          .select('user_id')
          .in('manager_id', managerIds)
          .is('effective_to', null);
        managerPbmIds = (hierarchyRows ?? []).map(r => r.user_id);
      }
    }

    // Get PBMs filtered by region
    let pbmQuery = db
      .from('users')
      .select('id, full_name, region')
      .eq('role', 'pbm')
      .eq('is_active', true);

    if (region !== 'combined') {
      pbmQuery = pbmQuery.eq('region', region);
    }

    if (managerPbmIds !== null) {
      if (managerPbmIds.length === 0) {
        return NextResponse.json({ data: [] });
      }
      pbmQuery = pbmQuery.in('id', managerPbmIds);
    }

    const { data: allPBMs } = await pbmQuery;

    if (!allPBMs || allPBMs.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const pbmIds = allPBMs.map(p => p.id);

    // Resolve manager names for all PBMs via user_hierarchy
    const { data: hierarchyRows } = await db
      .from('user_hierarchy')
      .select('user_id, manager_id')
      .in('user_id', pbmIds)
      .is('effective_to', null);

    const managerIdSet = new Set((hierarchyRows ?? []).map(r => r.manager_id).filter(Boolean));
    const { data: managerUsers } = managerIdSet.size > 0
      ? await db.from('users').select('id, full_name').in('id', [...managerIdSet])
      : { data: [] };

    const managerNameMap: Record<string, string> = {};
    (managerUsers ?? []).forEach((m: { id: string; full_name: string }) => { managerNameMap[m.id] = m.full_name; });

    const pbmManagerMap: Record<string, string | null> = {};
    (hierarchyRows ?? []).forEach((r: { user_id: string; manager_id: string }) => {
      pbmManagerMap[r.user_id] = managerNameMap[r.manager_id] ?? null;
    });

    // === Shared: Resolve PBM salesforce_user_ids ===
    const { data: pbmSfUsers } = await db
      .from('users')
      .select('id, salesforce_user_id')
      .in('id', pbmIds)
      .not('salesforce_user_id', 'is', null);

    const pbmSfIdToLocalId = new Map<string, string>();
    (pbmSfUsers || []).forEach(u => pbmSfIdToLocalId.set(u.salesforce_user_id, u.id));
    const pbmSfIds = [...pbmSfIdToLocalId.keys()];

    // Debug: trace specific PBM
    const debugSfId = '005Vx000007yWVdIAM';
    console.log(`[PBM_LB] PBM count: ${allPBMs?.length}, pbmSfIds count: ${pbmSfIds.length}, debugPBM in map: ${pbmSfIdToLocalId.has(debugSfId)} → ${pbmSfIdToLocalId.get(debugSfId)}`);

    // === Shared: Load rv_accounts owner lookup (partner name → owner SF ID) ===
    const rvAccountOwnerMap = new Map<string, string>(); // rv_account name → owner_sf_id
    const rvPageSize = 1000;
    let rvOffset = 0;
    while (true) {
      const { data: rvPage } = await db
        .from('rv_accounts')
        .select('name, owner_sf_id')
        .not('owner_sf_id', 'is', null)
        .range(rvOffset, rvOffset + rvPageSize - 1);
      if (!rvPage || rvPage.length === 0) break;
      rvPage.forEach(ra => rvAccountOwnerMap.set(ra.name, ra.owner_sf_id));
      if (rvPage.length < rvPageSize) break;
      rvOffset += rvPageSize;
    }
    console.log(`[PBM_LB] rvAccountOwnerMap size: ${rvAccountOwnerMap.size}, Telarus owner: ${rvAccountOwnerMap.get('Telarus')}, Intelisys owner: ${rvAccountOwnerMap.get('Intelisys')}`);

    const entries: Array<{
      rank: number;
      user_id: string;
      full_name: string;
      region: string | null;
      manager_name: string | null;
      primary_metric: number;
      secondary_metrics: Record<string, number>;
      is_current_user: boolean;
    }> = [];

    /**
     * PBM credit model:
     * 1. Channel Owner (opportunities.channel_owner_sf_id) → 100% credit
     * 2. RV Account Owner (rv_accounts.owner_sf_id via opportunities.rv_account_sf_id = rv_accounts.name) → 100% credit
     * 3. De-duplicate: if both point to the same PBM on the same opp, count only once
     */

    if (board === 'revenue') {
      const pbmData: Record<string, { acv: number; deals: Set<string> }> = {};

      if (pbmSfIds.length > 0) {
        // Fetch closed-won opportunities that have a channel_owner or rv_account
        let oppQuery = db
          .from('opportunities')
          .select('salesforce_opportunity_id, channel_owner_sf_id, rv_account_sf_id, acv')
          .eq('is_closed_won', true)
          .or('channel_owner_sf_id.not.is.null,rv_account_sf_id.not.is.null');
        if (startStr) oppQuery = oppQuery.gte('close_date', startStr);
        if (endStr) oppQuery = oppQuery.lte('close_date', endStr);
        const { data: opps } = await oppQuery;

        (opps || []).forEach(o => {
          const acv = parseFloat(o.acv) || 0;
          const oppSfId = o.salesforce_opportunity_id;
          const creditedPbms = new Set<string>(); // track which PBMs got credit on this opp

          // Credit 1: Channel Owner
          if (o.channel_owner_sf_id) {
            const localId = pbmSfIdToLocalId.get(o.channel_owner_sf_id);
            if (localId) {
              if (!pbmData[localId]) pbmData[localId] = { acv: 0, deals: new Set() };
              pbmData[localId].acv += acv;
              pbmData[localId].deals.add(oppSfId);
              creditedPbms.add(localId);
            }
          }

          // Credit 2: RV Account Owner (partner account owner)
          if (o.rv_account_sf_id) {
            const rvOwnerSfId = rvAccountOwnerMap.get(o.rv_account_sf_id);
            if (rvOwnerSfId) {
              const localId = pbmSfIdToLocalId.get(rvOwnerSfId);
              if (localId && !creditedPbms.has(localId)) {
                if (!pbmData[localId]) pbmData[localId] = { acv: 0, deals: new Set() };
                pbmData[localId].acv += acv;
                pbmData[localId].deals.add(oppSfId);
              }
            }
          }
        });
      }

      allPBMs.forEach(pbm => {
        const data = pbmData[pbm.id] || { acv: 0, deals: new Set() };
        entries.push({
          rank: 0,
          user_id: pbm.id,
          full_name: pbm.full_name,
          region: pbm.region,
          manager_name: pbmManagerMap[pbm.id] ?? null,
          primary_metric: data.acv,
          secondary_metrics: {
            acv_closed: data.acv,
            deals_closed: data.deals.size,
          },
          is_current_user: pbm.id === (viewAsUser?.user_id ?? user.user_id),
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));

    } else if (board === 'pipeline') {
      const pbmData: Record<string, { total: number; partner_sourced: number; partner_influenced: number; deals: Set<string> }> = {};

      if (pbmSfIds.length > 0) {
        // Fetch open opportunities that have a channel_owner or rv_account
        const { data: opps } = await db
          .from('opportunities')
          .select('salesforce_opportunity_id, channel_owner_sf_id, rv_account_sf_id, acv, opportunity_source')
          .eq('is_closed_won', false)
          .eq('is_closed_lost', false)
          .gt('acv', 0)
          .or('channel_owner_sf_id.not.is.null,rv_account_sf_id.not.is.null');

        (opps || []).forEach(o => {
          const acv = parseFloat(o.acv) || 0;
          const oppSfId = o.salesforce_opportunity_id;
          const src = (o.opportunity_source || '').toLowerCase();
          const isPartnerSourced = src.includes('partner') || src.includes('channel');
          const creditedPbms = new Set<string>();

          const creditPbm = (localId: string) => {
            if (creditedPbms.has(localId)) return;
            creditedPbms.add(localId);
            if (!pbmData[localId]) pbmData[localId] = { total: 0, partner_sourced: 0, partner_influenced: 0, deals: new Set() };
            pbmData[localId].total += acv;
            pbmData[localId].deals.add(oppSfId);
            if (isPartnerSourced) {
              pbmData[localId].partner_sourced += acv;
            } else {
              pbmData[localId].partner_influenced += acv;
            }
          };

          // Credit 1: Channel Owner
          if (o.channel_owner_sf_id) {
            const localId = pbmSfIdToLocalId.get(o.channel_owner_sf_id);
            if (localId) creditPbm(localId);
          }

          // Credit 2: RV Account Owner
          if (o.rv_account_sf_id) {
            const rvOwnerSfId = rvAccountOwnerMap.get(o.rv_account_sf_id);
            if (rvOwnerSfId) {
              const localId = pbmSfIdToLocalId.get(rvOwnerSfId);
              if (localId) creditPbm(localId);
            }
          }
        });
      }

      // Debug: trace Ryan's pipeline credit
      const debugLocalId = pbmSfIdToLocalId.get(debugSfId);
      if (debugLocalId) {
        const rd = pbmData[debugLocalId];
        console.log(`[PBM_LB] Pipeline debug for ${debugSfId}: localId=${debugLocalId}, data=${rd ? JSON.stringify({ total: rd.total, deals: rd.deals.size }) : 'NONE'}`);
      }

      allPBMs.forEach(pbm => {
        const data = pbmData[pbm.id] || { total: 0, partner_sourced: 0, partner_influenced: 0, deals: new Set() };
        entries.push({
          rank: 0,
          user_id: pbm.id,
          full_name: pbm.full_name,
          region: pbm.region,
          manager_name: pbmManagerMap[pbm.id] ?? null,
          primary_metric: data.total,
          secondary_metrics: {
            partner_sourced: data.partner_sourced,
            partner_influenced: data.partner_influenced,
            open_deals: data.deals.size,
            avg_deal_size: data.deals.size > 0 ? data.total / data.deals.size : 0,
          },
          is_current_user: pbm.id === (viewAsUser?.user_id ?? user.user_id),
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));

    } else if (board === 'pilots') {
      const pbmData: Record<string, { booked: number; open: number; totalDuration: number; bookedCount: number; numCreated: number; countedOpps: Set<string> }> = {};

      if (pbmSfIds.length > 0) {
        // Fetch all paid pilot opportunities
        const { data: allPilotOpps } = await db
          .from('opportunities')
          .select('salesforce_opportunity_id, channel_owner_sf_id, rv_account_sf_id, is_closed_won, is_closed_lost, paid_pilot_start_date, close_date, sf_created_date, created_at')
          .eq('is_paid_pilot', true);

        const creditPilot = (pbmLocalId: string, opp: NonNullable<typeof allPilotOpps>[number]) => {
          if (!pbmData[pbmLocalId]) {
            pbmData[pbmLocalId] = { booked: 0, open: 0, totalDuration: 0, bookedCount: 0, numCreated: 0, countedOpps: new Set() };
          }
          if (pbmData[pbmLocalId].countedOpps.has(opp.salesforce_opportunity_id)) return;
          pbmData[pbmLocalId].countedOpps.add(opp.salesforce_opportunity_id);

          if (opp.is_closed_won) {
            pbmData[pbmLocalId].booked++;
            pbmData[pbmLocalId].bookedCount++;
            if (opp.paid_pilot_start_date && opp.close_date) {
              pbmData[pbmLocalId].totalDuration += Math.ceil(
                (new Date(opp.close_date).getTime() - new Date(opp.paid_pilot_start_date).getTime()) / (1000 * 60 * 60 * 24)
              );
            }
          } else if (!opp.is_closed_lost) {
            pbmData[pbmLocalId].open++;
          }

          const createdDate = (opp.sf_created_date || opp.created_at || '').split('T')[0];
          if (createdDate) {
            const inRange = (!startStr || createdDate >= startStr) && (!endStr || createdDate <= endStr);
            if (inRange) {
              pbmData[pbmLocalId].numCreated++;
            }
          }
        };

        (allPilotOpps || []).forEach(opp => {
          const creditedPbms = new Set<string>();

          // Credit 1: Channel Owner
          if (opp.channel_owner_sf_id) {
            const localId = pbmSfIdToLocalId.get(opp.channel_owner_sf_id);
            if (localId) {
              creditPilot(localId, opp);
              creditedPbms.add(localId);
            }
          }

          // Credit 2: RV Account Owner
          if (opp.rv_account_sf_id) {
            const rvOwnerSfId = rvAccountOwnerMap.get(opp.rv_account_sf_id);
            if (rvOwnerSfId) {
              const localId = pbmSfIdToLocalId.get(rvOwnerSfId);
              if (localId && !creditedPbms.has(localId)) {
                creditPilot(localId, opp);
              }
            }
          }
        });
      }

      allPBMs.forEach(pbm => {
        const data = pbmData[pbm.id] || { booked: 0, open: 0, totalDuration: 0, bookedCount: 0, numCreated: 0, countedOpps: new Set() };
        entries.push({
          rank: 0,
          user_id: pbm.id,
          full_name: pbm.full_name,
          region: pbm.region,
          manager_name: pbmManagerMap[pbm.id] ?? null,
          primary_metric: data.booked,
          secondary_metrics: {
            open_pilots: data.open,
            avg_duration: data.bookedCount > 0 ? Math.round(data.totalDuration / data.bookedCount) : 0,
            num_created: data.numCreated,
          },
          is_current_user: pbm.id === (viewAsUser?.user_id ?? user.user_id),
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));
    }

    // Assign ranks
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    return NextResponse.json({ data: entries });
  } catch (error) {
    return handleAuthError(error);
  }
}
