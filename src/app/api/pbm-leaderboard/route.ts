import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';
import { getQuarterStartDate, getQuarterEndDate, getFiscalYearRange, getCurrentFiscalPeriod } from '@/lib/fiscal';
import { COUNTABLE_DEAL_SUBTYPES } from '@/lib/deal-subtypes';

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

    // === Shared: Load rv_accounts owner lookup (partner name → owner SF ID) ===
    const rvAccountOwnerMap = new Map<string, string>(); // rv_account name → owner_sf_id
    const rvPageSize = 1000;
    let rvOffset = 0;
    while (true) {
      const { data: rvPage } = await db
        .from('rv_accounts')
        .select('name, owner_sf_id')
        .not('owner_sf_id', 'is', null)
        .order('id')
        .range(rvOffset, rvOffset + rvPageSize - 1);
      if (!rvPage || rvPage.length === 0) break;
      rvPage.forEach(ra => rvAccountOwnerMap.set(ra.name, ra.owner_sf_id));
      if (rvPage.length < rvPageSize) break;
      rvOffset += rvPageSize;
    }

    // === Shared: Load sf_partners Channel Owner lookup (opp SF ID → set of channel_owner_sf_ids) ===
    // Only load partners whose channel_owner_sf_id matches a PBM
    const sfPartnersByOpp = new Map<string, Set<string>>(); // salesforce_opportunity_id → Set<channel_owner_sf_id>
    if (pbmSfIds.length > 0) {
      const partnerPageSize = 1000;
      let partnerOffset = 0;
      while (true) {
        const { data: partnerPage } = await db
          .from('sf_partners')
          .select('salesforce_opportunity_id, channel_owner_sf_id')
          .not('channel_owner_sf_id', 'is', null)
          .not('salesforce_opportunity_id', 'is', null)
          .in('channel_owner_sf_id', pbmSfIds)
          .order('id')
          .range(partnerOffset, partnerOffset + partnerPageSize - 1);
        if (!partnerPage || partnerPage.length === 0) break;
        partnerPage.forEach(p => {
          if (!sfPartnersByOpp.has(p.salesforce_opportunity_id)) {
            sfPartnersByOpp.set(p.salesforce_opportunity_id, new Set());
          }
          sfPartnersByOpp.get(p.salesforce_opportunity_id)!.add(p.channel_owner_sf_id);
        });
        if (partnerPage.length < partnerPageSize) break;
        partnerOffset += partnerPageSize;
      }
    }

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
     * PBM credit model (3 paths, de-duplicated per opp):
     * 1. Channel Owner on Opportunity (opportunities.channel_owner_sf_id)
     * 2. RV Account Owner (rv_accounts.owner_sf_id via opportunities.rv_account_sf_id = rv_accounts.name)
     * 3. Partner__c Channel Owner (sf_partners.channel_owner_sf_id via sf_partners.salesforce_opportunity_id)
     */

    if (board === 'revenue') {
      const pbmData: Record<string, { acv: number; deals: Set<string>; countableDeals: Set<string> }> = {};

      if (pbmSfIds.length > 0) {
        let oppQuery = db
          .from('opportunities')
          .select('salesforce_opportunity_id, channel_owner_sf_id, rv_account_sf_id, acv, sub_type')
          .eq('is_closed_won', true)
          .or('channel_owner_sf_id.not.is.null,rv_account_sf_id.not.is.null');
        if (startStr) oppQuery = oppQuery.gte('close_date', startStr);
        if (endStr) oppQuery = oppQuery.lte('close_date', endStr);
        const { data: opps } = await oppQuery;

        // Also fetch opps that only have Partner__c credit (no channel_owner or rv_account on opp itself)
        const oppSfIdsFromPartners = [...sfPartnersByOpp.keys()];
        let partnerOnlyOpps: typeof opps = [];
        if (oppSfIdsFromPartners.length > 0) {
          // Fetch in batches to avoid query size limits
          for (let i = 0; i < oppSfIdsFromPartners.length; i += 500) {
            const batch = oppSfIdsFromPartners.slice(i, i + 500);
            let q = db
              .from('opportunities')
              .select('salesforce_opportunity_id, channel_owner_sf_id, rv_account_sf_id, acv, sub_type')
              .eq('is_closed_won', true)
              .in('salesforce_opportunity_id', batch);
            if (startStr) q = q.gte('close_date', startStr);
            if (endStr) q = q.lte('close_date', endStr);
            const { data: batchOpps } = await q;
            if (batchOpps) partnerOnlyOpps = partnerOnlyOpps!.concat(batchOpps);
          }
        }

        // Merge and de-duplicate opps
        const allOpps = new Map<string, NonNullable<typeof opps>[number]>();
        (opps || []).forEach(o => allOpps.set(o.salesforce_opportunity_id, o));
        (partnerOnlyOpps || []).forEach(o => {
          if (!allOpps.has(o.salesforce_opportunity_id)) allOpps.set(o.salesforce_opportunity_id, o);
        });

        allOpps.forEach(o => {
          const acv = parseFloat(o.acv) || 0;
          const oppSfId = o.salesforce_opportunity_id;
          const creditedPbms = new Set<string>();

          const isCountable = o.sub_type && COUNTABLE_DEAL_SUBTYPES.includes(o.sub_type as typeof COUNTABLE_DEAL_SUBTYPES[number]) && acv > 0;

          const creditPbm = (localId: string) => {
            if (creditedPbms.has(localId)) return;
            creditedPbms.add(localId);
            if (!pbmData[localId]) pbmData[localId] = { acv: 0, deals: new Set(), countableDeals: new Set() };
            pbmData[localId].acv += acv;
            pbmData[localId].deals.add(oppSfId);
            if (isCountable) pbmData[localId].countableDeals.add(oppSfId);
          };

          // Credit 1: Channel Owner on Opportunity
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

          // Credit 3: Partner__c Channel Owner
          const partnerOwners = sfPartnersByOpp.get(oppSfId);
          if (partnerOwners) {
            partnerOwners.forEach(sfId => {
              const localId = pbmSfIdToLocalId.get(sfId);
              if (localId) creditPbm(localId);
            });
          }
        });
      }

      allPBMs.forEach(pbm => {
        const data = pbmData[pbm.id] || { acv: 0, deals: new Set(), countableDeals: new Set() };
        entries.push({
          rank: 0,
          user_id: pbm.id,
          full_name: pbm.full_name,
          region: pbm.region,
          manager_name: pbmManagerMap[pbm.id] ?? null,
          primary_metric: data.acv,
          secondary_metrics: {
            acv_closed: data.acv,
            deals_closed: data.countableDeals.size,
          },
          is_current_user: pbm.id === (viewAsUser?.user_id ?? user.user_id),
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));

    } else if (board === 'pipeline') {
      // Pipeline leaderboard: credited opportunities created (sf_created_date) within the period
      const pbmData: Record<string, { total: number; ae_created: number; sales_sourced: number; marketing_sourced: number; partner_sourced: number; deals: Set<string> }> = {};

      if (pbmSfIds.length > 0) {
        let baseQuery = db
          .from('opportunities')
          .select('salesforce_opportunity_id, channel_owner_sf_id, rv_account_sf_id, acv, reporting_acv, opportunity_source, created_by_sf_id, sf_created_date')
          .gt('acv', 0)
          .or('channel_owner_sf_id.not.is.null,rv_account_sf_id.not.is.null');
        if (startStr) baseQuery = baseQuery.gte('sf_created_date', startStr);
        if (endStr) baseQuery = baseQuery.lte('sf_created_date', endStr);
        const { data: opps } = await baseQuery;

        // Also fetch opps that only have Partner__c credit
        const oppSfIdsFromPartners = [...sfPartnersByOpp.keys()];
        let partnerOnlyOpps: typeof opps = [];
        if (oppSfIdsFromPartners.length > 0) {
          for (let i = 0; i < oppSfIdsFromPartners.length; i += 500) {
            const batch = oppSfIdsFromPartners.slice(i, i + 500);
            let batchQuery = db
              .from('opportunities')
              .select('salesforce_opportunity_id, channel_owner_sf_id, rv_account_sf_id, acv, reporting_acv, opportunity_source, created_by_sf_id, sf_created_date')
              .gt('acv', 0)
              .in('salesforce_opportunity_id', batch);
            if (startStr) batchQuery = batchQuery.gte('sf_created_date', startStr);
            if (endStr) batchQuery = batchQuery.lte('sf_created_date', endStr);
            const { data: batchOpps } = await batchQuery;
            if (batchOpps) partnerOnlyOpps = partnerOnlyOpps!.concat(batchOpps);
          }
        }

        const allOpps = new Map<string, NonNullable<typeof opps>[number]>();
        (opps || []).forEach(o => allOpps.set(o.salesforce_opportunity_id, o));
        (partnerOnlyOpps || []).forEach(o => {
          if (!allOpps.has(o.salesforce_opportunity_id)) allOpps.set(o.salesforce_opportunity_id, o);
        });

        // Resolve creator roles via created_by_sf_id
        const creatorSfIds = [...new Set([...allOpps.values()].map(o => o.created_by_sf_id).filter(Boolean))] as string[];
        const creatorRoleMap: Record<string, string> = {};
        if (creatorSfIds.length > 0) {
          for (let i = 0; i < creatorSfIds.length; i += 500) {
            const batch = creatorSfIds.slice(i, i + 500);
            const { data: creators } = await db
              .from('users')
              .select('salesforce_user_id, role')
              .in('salesforce_user_id', batch);
            (creators || []).forEach(u => { creatorRoleMap[u.salesforce_user_id] = u.role; });
          }
        }

        allOpps.forEach(o => {
          const acv = parseFloat(o.reporting_acv) || parseFloat(o.acv) || 0;
          const oppSfId = o.salesforce_opportunity_id;
          const creditedPbms = new Set<string>();

          const creditPbm = (localId: string) => {
            if (creditedPbms.has(localId)) return;
            creditedPbms.add(localId);
            if (!pbmData[localId]) pbmData[localId] = { total: 0, ae_created: 0, sales_sourced: 0, marketing_sourced: 0, partner_sourced: 0, deals: new Set() };
            pbmData[localId].total += acv;
            pbmData[localId].deals.add(oppSfId);
            // AE Created Deals
            if (o.created_by_sf_id) {
              const creatorRole = (creatorRoleMap[o.created_by_sf_id] || '').toLowerCase();
              if (creatorRole.includes('ae')) {
                pbmData[localId].ae_created += acv;
              }
            }
            // Categorize by opportunity_source
            const src = (o.opportunity_source || '').trim();
            if (src === 'Sales') {
              pbmData[localId].sales_sourced += acv;
            } else if (src === 'Marketing') {
              pbmData[localId].marketing_sourced += acv;
            } else if (src === 'Partner') {
              pbmData[localId].partner_sourced += acv;
            }
          };

          // Credit 1: Channel Owner on Opportunity
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

          // Credit 3: Partner__c Channel Owner
          const partnerOwners = sfPartnersByOpp.get(oppSfId);
          if (partnerOwners) {
            partnerOwners.forEach(sfId => {
              const localId = pbmSfIdToLocalId.get(sfId);
              if (localId) creditPbm(localId);
            });
          }
        });
      }

      allPBMs.forEach(pbm => {
        const data = pbmData[pbm.id] || { total: 0, ae_created: 0, sales_sourced: 0, marketing_sourced: 0, partner_sourced: 0, deals: new Set() };
        entries.push({
          rank: 0,
          user_id: pbm.id,
          full_name: pbm.full_name,
          region: pbm.region,
          manager_name: pbmManagerMap[pbm.id] ?? null,
          primary_metric: data.total,
          secondary_metrics: {
            ae_created: data.ae_created,
            sales_sourced: data.sales_sourced,
            marketing_sourced: data.marketing_sourced,
            partner_sourced: data.partner_sourced,
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
            if (opp.sf_created_date) {
              const created = new Date(opp.sf_created_date).getTime();
              const end = opp.close_date ? new Date(opp.close_date).getTime() : Date.now();
              pbmData[pbmLocalId].totalDuration += Math.floor((end - created) / (1000 * 60 * 60 * 24));
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

          const tryCreditPilot = (localId: string) => {
            if (creditedPbms.has(localId)) return;
            creditedPbms.add(localId);
            creditPilot(localId, opp);
          };

          // Credit 1: Channel Owner on Opportunity
          if (opp.channel_owner_sf_id) {
            const localId = pbmSfIdToLocalId.get(opp.channel_owner_sf_id);
            if (localId) tryCreditPilot(localId);
          }

          // Credit 2: RV Account Owner
          if (opp.rv_account_sf_id) {
            const rvOwnerSfId = rvAccountOwnerMap.get(opp.rv_account_sf_id);
            if (rvOwnerSfId) {
              const localId = pbmSfIdToLocalId.get(rvOwnerSfId);
              if (localId) tryCreditPilot(localId);
            }
          }

          // Credit 3: Partner__c Channel Owner
          const partnerOwners = sfPartnersByOpp.get(opp.salesforce_opportunity_id);
          if (partnerOwners) {
            partnerOwners.forEach(sfId => {
              const localId = pbmSfIdToLocalId.get(sfId);
              if (localId) tryCreditPilot(localId);
            });
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
