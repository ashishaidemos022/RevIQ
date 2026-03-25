import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate, getFiscalYearRange } from '@/lib/fiscal';
import { COUNTABLE_DEAL_SUBTYPES } from '@/lib/deal-subtypes';

const ALLOWED_ROLES = ['revops_rw', 'revops_ro', 'enterprise_ro'];

function normalizeRegion(region: string | null): string | null {
  if (!region) return null;
  const r = region.toLowerCase();
  if (r.startsWith('america')) return 'AMER';
  if (r.startsWith('emea')) return 'EMEA';
  if (r.startsWith('apac')) return 'APAC';
  if (r.startsWith('latam')) return 'AMER';
  return region;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  try {
    const user = await requireAuth();
    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { partnerId } = await params;
    const db = getSupabaseClient();
    const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
    const url = request.nextUrl;
    const board = url.searchParams.get('board') || null;
    const period = url.searchParams.get('period') || 'qtd';

    // Fetch the RV account (partner)
    const { data: rvAccount, error: rvError } = await db
      .from('rv_accounts')
      .select('id, salesforce_rv_id, name, region, partner_type, partner_subtype, owner_sf_id')
      .eq('id', partnerId)
      .single();

    if (rvError || !rvAccount) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    // Resolve PBM name from owner_sf_id
    let pbmName: string | null = null;
    if (rvAccount.owner_sf_id) {
      const { data: pbmUser } = await db
        .from('users')
        .select('full_name')
        .eq('salesforce_user_id', rvAccount.owner_sf_id)
        .single();
      if (pbmUser) pbmName = pbmUser.full_name;
    }

    // Fetch all opportunities linked to this partner
    const minDate = '2025-02-01';
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;
    const allOpps: Array<Record<string, unknown>> = [];

    while (hasMore) {
      const { data: page } = await db
        .from('opportunities')
        .select(`
          id, name, acv, close_date, stage, is_closed_won, is_closed_lost,
          is_paid_pilot, pilot_status, paid_pilot_start_date,
          rv_account_sf_id, rv_account_type, opportunity_source,
          sf_created_date, created_at, record_type_name, sub_type,
          owner_user_id, account_id
        `)
        .not('rv_account_sf_id', 'is', null)
        .gte('close_date', minDate)
        .order('id')
        .range(offset, offset + pageSize - 1);

      if (!page || page.length === 0) {
        hasMore = false;
      } else {
        allOpps.push(...page);
        offset += page.length;
        if (page.length < pageSize) hasMore = false;
      }
    }

    // Filter opps that belong to this partner (by name or SF ID match)
    const partnerOpps = allOpps.filter(o => {
      const rvId = o.rv_account_sf_id as string;
      return rvId === rvAccount.name || rvId === rvAccount.salesforce_rv_id;
    });

    // Resolve account names and AE names
    const accountIds = [...new Set(partnerOpps.map(o => o.account_id).filter(Boolean))] as string[];
    const ownerIds = [...new Set(partnerOpps.map(o => o.owner_user_id).filter(Boolean))] as string[];

    const accountNameMap = new Map<string, string>();
    const aeNameMap = new Map<string, string>();

    if (accountIds.length > 0) {
      const { data: accounts } = await db
        .from('accounts')
        .select('id, name')
        .in('id', accountIds);
      (accounts || []).forEach(a => accountNameMap.set(a.id, a.name));
    }

    if (ownerIds.length > 0) {
      const { data: owners } = await db
        .from('users')
        .select('id, full_name')
        .in('id', ownerIds);
      (owners || []).forEach(u => aeNameMap.set(u.id, u.full_name));
    }

    // Build deals list with resolved names
    const allDeals = partnerOpps.map(o => ({
      id: o.id,
      name: o.name,
      account_name: accountNameMap.get(o.account_id as string) || null,
      ae_name: aeNameMap.get(o.owner_user_id as string) || null,
      acv: o.acv,
      close_date: o.close_date,
      stage: o.stage,
      is_closed_won: o.is_closed_won,
      is_closed_lost: o.is_closed_lost,
      is_paid_pilot: o.is_paid_pilot,
      record_type_name: o.record_type_name,
      opportunity_source: o.opportunity_source,
      rv_account_type: o.rv_account_type,
      sf_created_date: o.sf_created_date,
      sub_type: o.sub_type,
    }));

    // Compute date range for the selected period
    const { start: fyStart, end: fyEnd } = getFiscalYearRange(fiscalYear);
    const qStart = getQuarterStartDate(fiscalYear, fiscalQuarter);
    const qEnd = getQuarterEndDate(fiscalYear, fiscalQuarter);
    const fyStartStr = fyStart.toISOString().split('T')[0];
    const fyEndStr = fyEnd.toISOString().split('T')[0];
    const qStartStr = qStart.toISOString().split('T')[0];
    const qEndStr = qEnd.toISOString().split('T')[0];

    // Compute period date range based on period param
    let periodStartStr = qStartStr;
    let periodEndStr = qEndStr;
    if (period === 'ytd') {
      periodStartStr = fyStartStr;
      periodEndStr = fyEndStr;
    } else if (period === 'prev_qtd') {
      let prevQ = fiscalQuarter - 1;
      let prevFY = fiscalYear;
      if (prevQ === 0) { prevQ = 4; prevFY--; }
      periodStartStr = getQuarterStartDate(prevFY, prevQ).toISOString().split('T')[0];
      periodEndStr = getQuarterEndDate(prevFY, prevQ).toISOString().split('T')[0];
    }

    // Filter deals based on board context
    let deals = allDeals;
    if (board === 'revenue') {
      deals = allDeals.filter(d =>
        d.is_closed_won && d.close_date &&
        d.close_date >= periodStartStr && d.close_date <= periodEndStr
      );
    } else if (board === 'pipeline') {
      deals = allDeals.filter(d =>
        !d.is_closed_won && !d.is_closed_lost && d.close_date &&
        d.close_date >= periodStartStr && d.close_date <= periodEndStr
      );
    } else if (board === 'pilots') {
      deals = allDeals.filter(d => d.is_paid_pilot);
    }

    // Compute KPIs (always from full deal set for context)
    const closedWonQTD = allDeals.filter(d =>
      d.is_closed_won && d.close_date && d.close_date >= qStartStr && d.close_date <= qEndStr
    );
    const closedWonYTD = allDeals.filter(d =>
      d.is_closed_won && d.close_date && d.close_date >= fyStartStr && d.close_date <= fyEndStr
    );
    const openDeals = allDeals.filter(d => !d.is_closed_won && !d.is_closed_lost);
    const activePilots = allDeals.filter(d => d.is_paid_pilot && !d.is_closed_won && !d.is_closed_lost);

    const acvClosedQTD = closedWonQTD.reduce((s, d) => s + ((d.acv as number) || 0), 0);
    const acvClosedYTD = closedWonYTD.reduce((s, d) => s + ((d.acv as number) || 0), 0);
    const pipelineACV = openDeals.reduce((s, d) => s + ((d.acv as number) || 0), 0);

    // Quarterly trend: ACV closed per quarter for the current FY
    const quarterlyTrend = [];
    for (let q = 1; q <= 4; q++) {
      const qs = getQuarterStartDate(fiscalYear, q).toISOString().split('T')[0];
      const qe = getQuarterEndDate(fiscalYear, q).toISOString().split('T')[0];
      const qDeals = deals.filter(d =>
        d.is_closed_won && d.close_date && d.close_date >= qs && d.close_date <= qe
      );
      quarterlyTrend.push({
        quarter: `Q${q}`,
        acv: qDeals.reduce((s, d) => s + ((d.acv as number) || 0), 0),
        deals: qDeals.filter(d => d.sub_type && COUNTABLE_DEAL_SUBTYPES.includes(d.sub_type as typeof COUNTABLE_DEAL_SUBTYPES[number]) && ((d.acv as number) || 0) > 0).length,
      });
    }

    return NextResponse.json({
      data: {
        partner: {
          id: rvAccount.id,
          name: rvAccount.name,
          region: normalizeRegion(rvAccount.region),
          partner_type: rvAccount.partner_type || null,
          partner_subtype: rvAccount.partner_subtype || null,
          pbm_name: pbmName,
        },
        kpis: {
          acv_closed_qtd: acvClosedQTD,
          acv_closed_ytd: acvClosedYTD,
          deals_closed_qtd: closedWonQTD.filter(d => d.sub_type && COUNTABLE_DEAL_SUBTYPES.includes(d.sub_type as typeof COUNTABLE_DEAL_SUBTYPES[number]) && ((d.acv as number) || 0) > 0).length,
          deals_closed_ytd: closedWonYTD.filter(d => d.sub_type && COUNTABLE_DEAL_SUBTYPES.includes(d.sub_type as typeof COUNTABLE_DEAL_SUBTYPES[number]) && ((d.acv as number) || 0) > 0).length,
          pipeline_acv: pipelineACV,
          open_deals: openDeals.length,
          active_pilots: activePilots.length,
        },
        quarterly_trend: quarterlyTrend,
        deals,
        fiscal_year: fiscalYear,
        fiscal_quarter: fiscalQuarter,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
