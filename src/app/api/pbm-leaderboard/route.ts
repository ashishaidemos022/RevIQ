import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';
import { getQuarterStartDate, getQuarterEndDate, getFiscalYearRange, getCurrentFiscalPeriod } from '@/lib/fiscal';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
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

    if (board === 'revenue') {
      // PBM revenue is based on opportunity splits they own
      let query = db
        .from('opportunity_splits')
        .select('split_owner_user_id, split_amount, opportunity_id, salesforce_opportunity_id')
        .in('split_owner_user_id', pbmIds);
      const { data: splits } = await query;

      // Get the opportunities to check close_date and is_closed_won
      const oppSfIds = [...new Set((splits || []).map(s => s.salesforce_opportunity_id))];
      let closedWonOppSfIds = new Set<string>();

      if (oppSfIds.length > 0) {
        // Fetch opportunities in batches (Supabase 1000 row limit)
        const batchSize = 500;
        for (let i = 0; i < oppSfIds.length; i += batchSize) {
          const batch = oppSfIds.slice(i, i + batchSize);
          let oppQuery = db
            .from('opportunities')
            .select('salesforce_opportunity_id')
            .eq('is_closed_won', true)
            .in('salesforce_opportunity_id', batch);
          if (startStr) oppQuery = oppQuery.gte('close_date', startStr);
          if (endStr) oppQuery = oppQuery.lte('close_date', endStr);
          const { data: opps } = await oppQuery;
          (opps || []).forEach(o => closedWonOppSfIds.add(o.salesforce_opportunity_id));
        }
      }

      // Aggregate per PBM
      const pbmData: Record<string, { acv: number; deals: number }> = {};
      const countedOpps: Record<string, Set<string>> = {};
      (splits || []).forEach((s: { split_owner_user_id: string | null; split_amount: number | null; salesforce_opportunity_id: string }) => {
        const id = s.split_owner_user_id || '';
        if (!closedWonOppSfIds.has(s.salesforce_opportunity_id)) return;
        if (!pbmData[id]) { pbmData[id] = { acv: 0, deals: 0 }; countedOpps[id] = new Set(); }
        pbmData[id].acv += s.split_amount || 0;
        if (!countedOpps[id].has(s.salesforce_opportunity_id)) {
          countedOpps[id].add(s.salesforce_opportunity_id);
          pbmData[id].deals++;
        }
      });

      allPBMs.forEach(pbm => {
        const data = pbmData[pbm.id] || { acv: 0, deals: 0 };
        entries.push({
          rank: 0,
          user_id: pbm.id,
          full_name: pbm.full_name,
          region: pbm.region,
          manager_name: pbmManagerMap[pbm.id] ?? null,
          primary_metric: data.acv, // ACV Closed w/ Multiplier = same as ACV for now
          secondary_metrics: {
            acv_closed: data.acv,
            deals_closed: data.deals,
          },
          is_current_user: pbm.id === user.user_id,
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));
    } else if (board === 'pipeline') {
      // PBM pipeline from opportunity splits on open opportunities
      let query = db
        .from('opportunity_splits')
        .select('split_owner_user_id, split_amount, salesforce_opportunity_id')
        .in('split_owner_user_id', pbmIds);
      const { data: splits } = await query;

      const oppSfIds = [...new Set((splits || []).map(s => s.salesforce_opportunity_id))];
      // Fetch open opportunities with source info
      const openOppMap = new Map<string, { opportunity_source: string | null; acv: number | null }>();

      if (oppSfIds.length > 0) {
        const batchSize = 500;
        for (let i = 0; i < oppSfIds.length; i += batchSize) {
          const batch = oppSfIds.slice(i, i + batchSize);
          let oppQuery = db
            .from('opportunities')
            .select('salesforce_opportunity_id, opportunity_source, acv')
            .eq('is_closed_won', false)
            .eq('is_closed_lost', false)
            .gt('acv', 0)
            .in('salesforce_opportunity_id', batch);
          const { data: opps } = await oppQuery;
          (opps || []).forEach(o => openOppMap.set(o.salesforce_opportunity_id, { opportunity_source: o.opportunity_source, acv: o.acv }));
        }
      }

      const pbmData: Record<string, { total: number; partner_sourced: number; partner_influenced: number; deals: number }> = {};
      const countedOpps: Record<string, Set<string>> = {};
      (splits || []).forEach((s: { split_owner_user_id: string | null; split_amount: number | null; salesforce_opportunity_id: string }) => {
        const id = s.split_owner_user_id || '';
        const opp = openOppMap.get(s.salesforce_opportunity_id);
        if (!opp) return;
        const acv = s.split_amount || 0;
        if (!pbmData[id]) { pbmData[id] = { total: 0, partner_sourced: 0, partner_influenced: 0, deals: 0 }; countedOpps[id] = new Set(); }
        pbmData[id].total += acv;

        const src = (opp.opportunity_source || '').toLowerCase();
        if (src.includes('partner') || src.includes('channel')) {
          pbmData[id].partner_sourced += acv;
        } else {
          pbmData[id].partner_influenced += acv;
        }

        if (!countedOpps[id].has(s.salesforce_opportunity_id)) {
          countedOpps[id].add(s.salesforce_opportunity_id);
          pbmData[id].deals++;
        }
      });

      allPBMs.forEach(pbm => {
        const data = pbmData[pbm.id] || { total: 0, partner_sourced: 0, partner_influenced: 0, deals: 0 };
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
            open_deals: data.deals,
            avg_deal_size: data.deals > 0 ? data.total / data.deals : 0,
          },
          is_current_user: pbm.id === user.user_id,
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));
    } else if (board === 'pilots') {
      // PBM pilots from opportunity splits on paid pilot opportunities
      let query = db
        .from('opportunity_splits')
        .select('split_owner_user_id, salesforce_opportunity_id')
        .in('split_owner_user_id', pbmIds);
      const { data: splits } = await query;

      const oppSfIds = [...new Set((splits || []).map(s => s.salesforce_opportunity_id))];
      const pilotOppMap = new Map<string, {
        is_closed_won: boolean;
        is_closed_lost: boolean;
        paid_pilot_start_date: string | null;
        close_date: string | null;
        sf_created_date: string | null;
        created_at: string;
      }>();

      if (oppSfIds.length > 0) {
        const batchSize = 500;
        for (let i = 0; i < oppSfIds.length; i += batchSize) {
          const batch = oppSfIds.slice(i, i + batchSize);
          const { data: opps } = await db
            .from('opportunities')
            .select('salesforce_opportunity_id, is_closed_won, is_closed_lost, paid_pilot_start_date, close_date, sf_created_date, created_at')
            .eq('is_paid_pilot', true)
            .in('salesforce_opportunity_id', batch);
          (opps || []).forEach(o => pilotOppMap.set(o.salesforce_opportunity_id, o));
        }
      }

      const pbmData: Record<string, { booked: number; open: number; totalDuration: number; bookedCount: number; numCreated: number }> = {};
      const countedOpps: Record<string, Set<string>> = {};
      (splits || []).forEach((s: { split_owner_user_id: string | null; salesforce_opportunity_id: string }) => {
        const id = s.split_owner_user_id || '';
        const opp = pilotOppMap.get(s.salesforce_opportunity_id);
        if (!opp) return;

        if (!pbmData[id]) { pbmData[id] = { booked: 0, open: 0, totalDuration: 0, bookedCount: 0, numCreated: 0 }; countedOpps[id] = new Set(); }

        // Avoid double-counting if PBM has multiple splits on same opportunity
        if (countedOpps[id].has(s.salesforce_opportunity_id)) return;
        countedOpps[id].add(s.salesforce_opportunity_id);

        if (opp.is_closed_won) {
          pbmData[id].booked++;
          pbmData[id].bookedCount++;
          if (opp.paid_pilot_start_date && opp.close_date) {
            pbmData[id].totalDuration += Math.ceil(
              (new Date(opp.close_date).getTime() - new Date(opp.paid_pilot_start_date).getTime()) / (1000 * 60 * 60 * 24)
            );
          }
        } else if (!opp.is_closed_lost) {
          pbmData[id].open++;
        }

        // Count pilots created within the selected period
        const createdDate = (opp.sf_created_date || opp.created_at || '').split('T')[0];
        if (createdDate) {
          const inRange = (!startStr || createdDate >= startStr) && (!endStr || createdDate <= endStr);
          if (inRange) {
            pbmData[id].numCreated++;
          }
        }
      });

      allPBMs.forEach(pbm => {
        const data = pbmData[pbm.id] || { booked: 0, open: 0, totalDuration: 0, bookedCount: 0, numCreated: 0 };
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
          is_current_user: pbm.id === user.user_id,
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
