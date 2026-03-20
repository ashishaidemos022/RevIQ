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

    // === Shared: Resolve PBM salesforce_user_ids ===
    const { data: pbmSfUsers } = await db
      .from('users')
      .select('id, salesforce_user_id')
      .in('id', pbmIds)
      .not('salesforce_user_id', 'is', null);

    const pbmSfIdToLocalId = new Map<string, string>();
    (pbmSfUsers || []).forEach(u => pbmSfIdToLocalId.set(u.salesforce_user_id, u.id));
    const pbmSfIds = [...pbmSfIdToLocalId.keys()];

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

    // Helper: credit a PBM on a specific opportunity, avoiding double credit
    // Returns the set of (pbmLocalId, oppSfId) pairs already credited
    type CreditMap = Record<string, { acv: number; deals: Set<string> }>;

    /**
     * For a set of opportunities, find additional PBM credits via sf_opportunity_partners.
     * Each partner record has its own channel_owner_sf_id — credit that PBM directly.
     * Skip if the partner's Channel Owner is the same as the opportunity-level Channel Owner
     * (to avoid double credit). Each unique Channel Owner gets 100% credit (full ACV).
     */
    async function addOpportunityPartnerCredits(
      oppSfIds: string[],
      oppChannelOwnerMap: Map<string, string | null>, // opp SF ID → opp-level channel_owner_sf_id
      oppAcvMap: Map<string, number>, // opp SF ID → ACV
      pbmData: CreditMap,
    ) {
      if (oppSfIds.length === 0) return;

      const batchSize = 500;
      for (let i = 0; i < oppSfIds.length; i += batchSize) {
        const batch = oppSfIds.slice(i, i + batchSize);
        const { data: partners } = await db
          .from('sf_opportunity_partners')
          .select('salesforce_opportunity_id, channel_owner_sf_id')
          .in('salesforce_opportunity_id', batch)
          .not('channel_owner_sf_id', 'is', null);

        (partners || []).forEach(p => {
          const partnerChannelOwnerSfId = p.channel_owner_sf_id;
          if (!partnerChannelOwnerSfId) return;

          const pbmLocalId = pbmSfIdToLocalId.get(partnerChannelOwnerSfId);
          if (!pbmLocalId) return; // Channel Owner is not a PBM in our list

          // Skip if this PBM is already the opp-level Channel Owner (avoid double credit)
          const oppChannelOwner = oppChannelOwnerMap.get(p.salesforce_opportunity_id);
          if (oppChannelOwner === partnerChannelOwnerSfId) return;

          const acv = oppAcvMap.get(p.salesforce_opportunity_id) || 0;
          if (!pbmData[pbmLocalId]) pbmData[pbmLocalId] = { acv: 0, deals: new Set() };
          pbmData[pbmLocalId].acv += acv;
          pbmData[pbmLocalId].deals.add(p.salesforce_opportunity_id);
        });
      }
    }

    if (board === 'revenue') {
      // Credit PBMs for closed-won opportunities via:
      // 1. Channel Owner (channel_owner_sf_id)
      // 2. OpportunityPartner → rv_accounts owner (skip if same as Channel Owner)
      const pbmData: CreditMap = {};

      if (pbmSfIds.length > 0) {
        const batchSize = 500;
        const allClosedOppSfIds: string[] = [];
        const oppChannelOwnerMap = new Map<string, string | null>();
        const oppAcvMap = new Map<string, number>();

        for (let i = 0; i < pbmSfIds.length; i += batchSize) {
          const batch = pbmSfIds.slice(i, i + batchSize);
          let oppQuery = db
            .from('opportunities')
            .select('salesforce_opportunity_id, channel_owner_sf_id, acv')
            .eq('is_closed_won', true)
            .in('channel_owner_sf_id', batch);
          if (startStr) oppQuery = oppQuery.gte('close_date', startStr);
          if (endStr) oppQuery = oppQuery.lte('close_date', endStr);
          const { data: opps } = await oppQuery;
          (opps || []).forEach(o => {
            const localId = pbmSfIdToLocalId.get(o.channel_owner_sf_id);
            if (!localId) return;
            if (!pbmData[localId]) pbmData[localId] = { acv: 0, deals: new Set() };
            pbmData[localId].acv += o.acv || 0;
            pbmData[localId].deals.add(o.salesforce_opportunity_id);
            allClosedOppSfIds.push(o.salesforce_opportunity_id);
            oppChannelOwnerMap.set(o.salesforce_opportunity_id, o.channel_owner_sf_id);
            oppAcvMap.set(o.salesforce_opportunity_id, o.acv || 0);
          });
        }

        // Also find closed-won opportunities that have OpportunityPartner records
        // but where the Channel Owner is NOT one of our PBMs (so we didn't already fetch them)
        // We need ALL closed-won opportunities that have partner records pointing to rv_accounts owned by our PBMs
        let allClosedQuery = db
          .from('opportunities')
          .select('salesforce_opportunity_id, channel_owner_sf_id, acv')
          .eq('is_closed_won', true);
        if (startStr) allClosedQuery = allClosedQuery.gte('close_date', startStr);
        if (endStr) allClosedQuery = allClosedQuery.lte('close_date', endStr);
        const { data: allClosedOpps } = await allClosedQuery;

        const closedOppSfIdsForPartners: string[] = [];
        (allClosedOpps || []).forEach(o => {
          if (!oppAcvMap.has(o.salesforce_opportunity_id)) {
            oppChannelOwnerMap.set(o.salesforce_opportunity_id, o.channel_owner_sf_id);
            oppAcvMap.set(o.salesforce_opportunity_id, o.acv || 0);
          }
          closedOppSfIdsForPartners.push(o.salesforce_opportunity_id);
        });

        await addOpportunityPartnerCredits(closedOppSfIdsForPartners, oppChannelOwnerMap, oppAcvMap, pbmData);
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
          is_current_user: pbm.id === user.user_id,
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));
    } else if (board === 'pipeline') {
      // Credit PBMs for open pipeline via:
      // 1. Channel Owner (channel_owner_sf_id)
      // 2. OpportunityPartner → rv_accounts owner (skip if same as Channel Owner)
      const pbmData: Record<string, { total: number; partner_sourced: number; partner_influenced: number; deals: Set<string> }> = {};

      if (pbmSfIds.length > 0) {
        const oppChannelOwnerMap = new Map<string, string | null>();
        const oppAcvMap = new Map<string, number>();
        const oppSourceMap = new Map<string, string | null>();

        // Fetch open opportunities where channel_owner_sf_id matches a PBM
        const batchSize = 500;
        for (let i = 0; i < pbmSfIds.length; i += batchSize) {
          const batch = pbmSfIds.slice(i, i + batchSize);
          const { data: opps } = await db
            .from('opportunities')
            .select('salesforce_opportunity_id, channel_owner_sf_id, acv, opportunity_source')
            .eq('is_closed_won', false)
            .eq('is_closed_lost', false)
            .gt('acv', 0)
            .in('channel_owner_sf_id', batch);
          (opps || []).forEach(o => {
            const localId = pbmSfIdToLocalId.get(o.channel_owner_sf_id);
            if (!localId) return;
            const acv = o.acv || 0;
            if (!pbmData[localId]) pbmData[localId] = { total: 0, partner_sourced: 0, partner_influenced: 0, deals: new Set() };
            pbmData[localId].total += acv;
            pbmData[localId].deals.add(o.salesforce_opportunity_id);

            const src = (o.opportunity_source || '').toLowerCase();
            if (src.includes('partner') || src.includes('channel')) {
              pbmData[localId].partner_sourced += acv;
            } else {
              pbmData[localId].partner_influenced += acv;
            }

            oppChannelOwnerMap.set(o.salesforce_opportunity_id, o.channel_owner_sf_id);
            oppAcvMap.set(o.salesforce_opportunity_id, acv);
            oppSourceMap.set(o.salesforce_opportunity_id, o.opportunity_source);
          });
        }

        // Fetch ALL open opportunities for OpportunityPartner credit
        let allOpenQuery = db
          .from('opportunities')
          .select('salesforce_opportunity_id, channel_owner_sf_id, acv, opportunity_source')
          .eq('is_closed_won', false)
          .eq('is_closed_lost', false)
          .gt('acv', 0);
        const { data: allOpenOpps } = await allOpenQuery;

        const openOppSfIdsForPartners: string[] = [];
        (allOpenOpps || []).forEach(o => {
          if (!oppAcvMap.has(o.salesforce_opportunity_id)) {
            oppChannelOwnerMap.set(o.salesforce_opportunity_id, o.channel_owner_sf_id);
            oppAcvMap.set(o.salesforce_opportunity_id, o.acv || 0);
            oppSourceMap.set(o.salesforce_opportunity_id, o.opportunity_source);
          }
          openOppSfIdsForPartners.push(o.salesforce_opportunity_id);
        });

        // Add OpportunityPartner credits via partner-level channel_owner_sf_id
        if (openOppSfIdsForPartners.length > 0) {
          for (let i = 0; i < openOppSfIdsForPartners.length; i += batchSize) {
            const batch = openOppSfIdsForPartners.slice(i, i + batchSize);
            const { data: partners } = await db
              .from('sf_opportunity_partners')
              .select('salesforce_opportunity_id, channel_owner_sf_id')
              .in('salesforce_opportunity_id', batch)
              .not('channel_owner_sf_id', 'is', null);

            (partners || []).forEach(p => {
              const partnerChannelOwnerSfId = p.channel_owner_sf_id;
              if (!partnerChannelOwnerSfId) return;
              const pbmLocalId = pbmSfIdToLocalId.get(partnerChannelOwnerSfId);
              if (!pbmLocalId) return;
              const oppChannelOwner = oppChannelOwnerMap.get(p.salesforce_opportunity_id);
              if (oppChannelOwner === partnerChannelOwnerSfId) return; // Skip double credit

              const acv = oppAcvMap.get(p.salesforce_opportunity_id) || 0;
              if (!pbmData[pbmLocalId]) pbmData[pbmLocalId] = { total: 0, partner_sourced: 0, partner_influenced: 0, deals: new Set() };
              pbmData[pbmLocalId].total += acv;
              pbmData[pbmLocalId].deals.add(p.salesforce_opportunity_id);

              const src = (oppSourceMap.get(p.salesforce_opportunity_id) || '').toLowerCase();
              if (src.includes('partner') || src.includes('channel')) {
                pbmData[pbmLocalId].partner_sourced += acv;
              } else {
                pbmData[pbmLocalId].partner_influenced += acv;
              }
            });
          }
        }
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
          is_current_user: pbm.id === user.user_id,
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));
    } else if (board === 'pilots') {
      // Credit PBMs for paid pilot opportunities via:
      // 1. Channel Owner (channel_owner_sf_id)
      // 2. OpportunityPartner → rv_accounts owner (skip if same as Channel Owner)
      const pbmData: Record<string, { booked: number; open: number; totalDuration: number; bookedCount: number; numCreated: number; countedOpps: Set<string> }> = {};

      if (pbmSfIds.length > 0) {
        const oppChannelOwnerMap = new Map<string, string | null>();

        // Fetch all paid pilot opportunities
        const { data: allPilotOpps } = await db
          .from('opportunities')
          .select('salesforce_opportunity_id, channel_owner_sf_id, is_closed_won, is_closed_lost, paid_pilot_start_date, close_date, sf_created_date, created_at')
          .eq('is_paid_pilot', true);

        const pilotOppMap = new Map<string, {
          salesforce_opportunity_id: string;
          channel_owner_sf_id: string | null;
          is_closed_won: boolean;
          is_closed_lost: boolean;
          paid_pilot_start_date: string | null;
          close_date: string | null;
          sf_created_date: string | null;
          created_at: string;
        }>();

        (allPilotOpps || []).forEach(o => {
          pilotOppMap.set(o.salesforce_opportunity_id, o);
          oppChannelOwnerMap.set(o.salesforce_opportunity_id, o.channel_owner_sf_id);
        });

        // Helper to credit a PBM for a pilot opportunity
        const creditPilot = (pbmLocalId: string, opp: typeof pilotOppMap extends Map<string, infer V> ? V : never) => {
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

        // 1. Credit via Channel Owner
        pilotOppMap.forEach(opp => {
          if (!opp.channel_owner_sf_id) return;
          const localId = pbmSfIdToLocalId.get(opp.channel_owner_sf_id);
          if (!localId) return;
          creditPilot(localId, opp);
        });

        // 2. Credit via OpportunityPartner partner-level channel_owner_sf_id
        const pilotSfIds = [...pilotOppMap.keys()];
        const batchSize = 500;
        for (let i = 0; i < pilotSfIds.length; i += batchSize) {
          const batch = pilotSfIds.slice(i, i + batchSize);
          const { data: partners } = await db
            .from('sf_opportunity_partners')
            .select('salesforce_opportunity_id, channel_owner_sf_id')
            .in('salesforce_opportunity_id', batch)
            .not('channel_owner_sf_id', 'is', null);

          (partners || []).forEach(p => {
            const partnerChannelOwnerSfId = p.channel_owner_sf_id;
            if (!partnerChannelOwnerSfId) return;
            const pbmLocalId = pbmSfIdToLocalId.get(partnerChannelOwnerSfId);
            if (!pbmLocalId) return;
            const oppChannelOwner = oppChannelOwnerMap.get(p.salesforce_opportunity_id);
            if (oppChannelOwner === partnerChannelOwnerSfId) return; // Skip double credit

            const opp = pilotOppMap.get(p.salesforce_opportunity_id);
            if (!opp) return;
            creditPilot(pbmLocalId, opp);
          });
        }
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
