import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate, getFiscalYearRange } from '@/lib/fiscal';
import { COUNTABLE_DEAL_SUBTYPES } from '@/lib/deal-subtypes';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAuth();
    const { userId } = await params;
    const db = getSupabaseClient();
    const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
    const url = request.nextUrl;
    const board = url.searchParams.get('board') || 'revenue';
    const period = url.searchParams.get('period') || 'qtd';

    // Fetch user info
    const { data: userInfo, error: userError } = await db
      .from('users')
      .select('id, full_name, role, region, email, salesforce_user_id')
      .eq('id', userId)
      .single();

    if (userError || !userInfo) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Resolve manager name
    const { data: hierarchy } = await db
      .from('user_hierarchy')
      .select('manager_id')
      .eq('user_id', userId)
      .is('effective_to', null)
      .single();

    let managerName: string | null = null;
    if (hierarchy?.manager_id) {
      const { data: mgr } = await db
        .from('users')
        .select('full_name')
        .eq('id', hierarchy.manager_id)
        .single();
      if (mgr) managerName = mgr.full_name;
    }

    // Compute period date ranges
    const qStart = getQuarterStartDate(fiscalYear, fiscalQuarter);
    const qEnd = getQuarterEndDate(fiscalYear, fiscalQuarter);
    const { start: fyStart, end: fyEnd } = getFiscalYearRange(fiscalYear);

    let periodStartStr: string;
    let periodEndStr: string;

    if (period === 'ytd') {
      periodStartStr = fyStart.toISOString().split('T')[0];
      periodEndStr = fyEnd.toISOString().split('T')[0];
    } else if (period === 'prev_qtd') {
      let prevQ = fiscalQuarter - 1;
      let prevFY = fiscalYear;
      if (prevQ === 0) { prevQ = 4; prevFY--; }
      periodStartStr = getQuarterStartDate(prevFY, prevQ).toISOString().split('T')[0];
      periodEndStr = getQuarterEndDate(prevFY, prevQ).toISOString().split('T')[0];
    } else if (period === 'mtd') {
      const now = new Date();
      periodStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      periodEndStr = now.toISOString().split('T')[0];
    } else {
      periodStartStr = qStart.toISOString().split('T')[0];
      periodEndStr = qEnd.toISOString().split('T')[0];
    }

    const pbmSfId = userInfo.salesforce_user_id;
    if (!pbmSfId) {
      return NextResponse.json({
        data: {
          user: { id: userInfo.id, full_name: userInfo.full_name, role: userInfo.role, region: userInfo.region, manager_name: managerName },
          kpis: { acv_closed_qtd: 0, acv_closed_ytd: 0, deals_closed_qtd: 0, deals_closed_ytd: 0, pipeline_acv: 0, open_deals: 0 },
          board, period, deals: [], activities: [], fiscal_year: fiscalYear, fiscal_quarter: fiscalQuarter,
        },
      });
    }

    // Load RV accounts owned by this PBM
    const rvAccountOwnerMap = new Map<string, string>(); // rv_account name → owner_sf_id
    let rvOffset = 0;
    while (true) {
      const { data: rvPage } = await db
        .from('rv_accounts')
        .select('name, owner_sf_id')
        .not('owner_sf_id', 'is', null)
        .order('id')
        .range(rvOffset, rvOffset + 999);
      if (!rvPage || rvPage.length === 0) break;
      rvPage.forEach(ra => rvAccountOwnerMap.set(ra.name, ra.owner_sf_id));
      if (rvPage.length < 1000) break;
      rvOffset += rvPage.length;
    }

    // Load sf_partners where this PBM is channel owner
    const sfPartnerOppIds = new Set<string>();
    let partnerOffset = 0;
    while (true) {
      const { data: partnerPage } = await db
        .from('sf_partners')
        .select('salesforce_opportunity_id')
        .eq('channel_owner_sf_id', pbmSfId)
        .not('salesforce_opportunity_id', 'is', null)
        .order('id')
        .range(partnerOffset, partnerOffset + 999);
      if (!partnerPage || partnerPage.length === 0) break;
      partnerPage.forEach(p => sfPartnerOppIds.add(p.salesforce_opportunity_id));
      if (partnerPage.length < 1000) break;
      partnerOffset += partnerPage.length;
    }

    // Fetch all opportunities credited to this PBM via 3 paths
    // Path 1: channel_owner_sf_id on opportunity
    // Path 2: rv_account_sf_id where rv_account owner matches PBM
    // Path 3: sf_partners channel_owner_sf_id
    const allOppMap = new Map<string, Record<string, unknown>>();

    // Path 1: Channel owner
    const pageSize = 1000;
    let offset = 0;
    while (true) {
      const { data: page } = await db
        .from('opportunities')
        .select(`
          id, salesforce_opportunity_id, name, acv, close_date, stage,
          is_closed_won, is_closed_lost, is_paid_pilot, pilot_status,
          paid_pilot_start_date, record_type_name, opportunity_source,
          sf_created_date, account_id, channel_owner_sf_id, rv_account_sf_id, sub_type
        `)
        .eq('channel_owner_sf_id', pbmSfId)
        .gte('close_date', '2025-02-01')
        .order('id')
        .range(offset, offset + pageSize - 1);
      if (!page || page.length === 0) break;
      page.forEach(o => allOppMap.set(o.salesforce_opportunity_id, o));
      if (page.length < pageSize) break;
      offset += page.length;
    }

    // Path 2: RV account owner — find opps where rv_account_sf_id maps to an rv_account owned by this PBM
    const rvAccountNamesOwnedByPbm: string[] = [];
    rvAccountOwnerMap.forEach((ownerSfId, name) => {
      if (ownerSfId === pbmSfId) rvAccountNamesOwnedByPbm.push(name);
    });

    if (rvAccountNamesOwnedByPbm.length > 0) {
      for (let i = 0; i < rvAccountNamesOwnedByPbm.length; i += 100) {
        const batch = rvAccountNamesOwnedByPbm.slice(i, i + 100);
        let rvOffset2 = 0;
        while (true) {
          const { data: page } = await db
            .from('opportunities')
            .select(`
              id, salesforce_opportunity_id, name, acv, close_date, stage,
              is_closed_won, is_closed_lost, is_paid_pilot, pilot_status,
              paid_pilot_start_date, record_type_name, opportunity_source,
              sf_created_date, account_id, channel_owner_sf_id, rv_account_sf_id, sub_type
            `)
            .in('rv_account_sf_id', batch)
            .gte('close_date', '2025-02-01')
            .order('id')
            .range(rvOffset2, rvOffset2 + pageSize - 1);
          if (!page || page.length === 0) break;
          page.forEach(o => { if (!allOppMap.has(o.salesforce_opportunity_id)) allOppMap.set(o.salesforce_opportunity_id, o); });
          if (page.length < pageSize) break;
          rvOffset2 += page.length;
        }
      }
    }

    // Path 3: Partner__c channel owner
    const partnerOppIdArray = [...sfPartnerOppIds];
    if (partnerOppIdArray.length > 0) {
      for (let i = 0; i < partnerOppIdArray.length; i += 500) {
        const batch = partnerOppIdArray.slice(i, i + 500);
        const { data: page } = await db
          .from('opportunities')
          .select(`
            id, salesforce_opportunity_id, name, acv, close_date, stage,
            is_closed_won, is_closed_lost, is_paid_pilot, pilot_status,
            paid_pilot_start_date, record_type_name, opportunity_source,
            sf_created_date, account_id, channel_owner_sf_id, rv_account_sf_id, sub_type
          `)
          .in('salesforce_opportunity_id', batch)
          .gte('close_date', '2025-02-01');
        if (page) page.forEach(o => { if (!allOppMap.has(o.salesforce_opportunity_id)) allOppMap.set(o.salesforce_opportunity_id, o); });
      }
    }

    const allOpps = [...allOppMap.values()];

    // Resolve account names
    const accountIds = [...new Set(allOpps.map(o => o.account_id).filter(Boolean))] as string[];
    const accountNameMap = new Map<string, string>();
    if (accountIds.length > 0) {
      for (let i = 0; i < accountIds.length; i += 100) {
        const batch = accountIds.slice(i, i + 100);
        const { data: accounts } = await db
          .from('accounts')
          .select('id, name')
          .in('id', batch);
        (accounts || []).forEach(a => accountNameMap.set(a.id, a.name));
      }
    }

    // Filter deals based on board context
    let deals: Array<Record<string, unknown>>;
    if (board === 'revenue') {
      deals = allOpps.filter(o =>
        o.is_closed_won && o.close_date &&
        (o.close_date as string) >= periodStartStr && (o.close_date as string) <= periodEndStr
      );
    } else if (board === 'pipeline') {
      deals = allOpps.filter(o =>
        !o.is_closed_won && !o.is_closed_lost && o.close_date &&
        (o.close_date as string) >= periodStartStr && (o.close_date as string) <= periodEndStr
      );
    } else if (board === 'pilots') {
      deals = allOpps.filter(o => o.is_paid_pilot);
    } else {
      deals = [];
    }

    // Add account names
    const dealsWithNames = deals.map(o => ({
      ...o,
      account_name: accountNameMap.get(o.account_id as string) || null,
    }));

    // Compute summary KPIs from full opp set
    const qStartStr = qStart.toISOString().split('T')[0];
    const qEndStr = qEnd.toISOString().split('T')[0];
    const fyStartStr = fyStart.toISOString().split('T')[0];
    const fyEndStr = fyEnd.toISOString().split('T')[0];

    const closedWonQTD = allOpps.filter(o =>
      o.is_closed_won && o.close_date &&
      (o.close_date as string) >= qStartStr && (o.close_date as string) <= qEndStr
    );
    const closedWonYTD = allOpps.filter(o =>
      o.is_closed_won && o.close_date &&
      (o.close_date as string) >= fyStartStr && (o.close_date as string) <= fyEndStr
    );
    const openDeals = allOpps.filter(o => !o.is_closed_won && !o.is_closed_lost);

    const acvClosedQTD = closedWonQTD.reduce((s, o) => s + (parseFloat(o.acv as string) || 0), 0);
    const acvClosedYTD = closedWonYTD.reduce((s, o) => s + (parseFloat(o.acv as string) || 0), 0);
    const pipelineACV = openDeals.reduce((s, o) => s + (parseFloat(o.acv as string) || 0), 0);

    return NextResponse.json({
      data: {
        user: {
          id: userInfo.id,
          full_name: userInfo.full_name,
          role: userInfo.role,
          region: userInfo.region,
          manager_name: managerName,
        },
        kpis: {
          acv_closed_qtd: acvClosedQTD,
          acv_closed_ytd: acvClosedYTD,
          deals_closed_qtd: closedWonQTD.filter(o => o.sub_type && COUNTABLE_DEAL_SUBTYPES.includes(o.sub_type as typeof COUNTABLE_DEAL_SUBTYPES[number]) && (parseFloat(o.acv as string) || 0) > 0).length,
          deals_closed_ytd: closedWonYTD.filter(o => o.sub_type && COUNTABLE_DEAL_SUBTYPES.includes(o.sub_type as typeof COUNTABLE_DEAL_SUBTYPES[number]) && (parseFloat(o.acv as string) || 0) > 0).length,
          pipeline_acv: pipelineACV,
          open_deals: openDeals.length,
        },
        board,
        period,
        deals: dealsWithNames,
        activities: [],
        fiscal_year: fiscalYear,
        fiscal_quarter: fiscalQuarter,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
