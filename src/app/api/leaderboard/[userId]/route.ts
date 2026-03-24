import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';
import { getCurrentFiscalPeriod, getQuarterStartDate, getQuarterEndDate, getFiscalYearRange } from '@/lib/fiscal';

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
      .select('id, full_name, role, region, email')
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

    // Compute period date range
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

    // Fetch opportunities owned by this user
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
          record_type_name, opportunity_source, sf_created_date,
          account_id
        `)
        .eq('owner_user_id', userId)
        .gte('close_date', '2025-02-01')
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

    // Resolve account names
    const accountIds = [...new Set(allOpps.map(o => o.account_id).filter(Boolean))] as string[];
    const accountNameMap = new Map<string, string>();
    if (accountIds.length > 0) {
      // Batch fetch in chunks of 100
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
      // activities board — no deals to show
      deals = [];
    }

    // Add account names
    const dealsWithNames = deals.map(o => ({
      ...o,
      account_name: accountNameMap.get(o.account_id as string) || null,
    }));

    // Fetch activities for activities board
    let activities: Array<Record<string, unknown>> = [];
    if (board === 'activities') {
      const { data: actData } = await db
        .from('activities')
        .select('id, activity_type, activity_date, subject, account_id')
        .eq('owner_user_id', userId)
        .gte('activity_date', periodStartStr)
        .lte('activity_date', periodEndStr)
        .order('activity_date', { ascending: false })
        .limit(50);

      activities = (actData || []).map(a => ({
        ...a,
        account_name: accountNameMap.get(a.account_id as string) || null,
      }));
    }

    // Compute summary KPIs
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

    const acvClosedQTD = closedWonQTD.reduce((s, o) => s + ((o.acv as number) || 0), 0);
    const acvClosedYTD = closedWonYTD.reduce((s, o) => s + ((o.acv as number) || 0), 0);
    const pipelineACV = openDeals.reduce((s, o) => s + ((o.acv as number) || 0), 0);

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
          deals_closed_qtd: closedWonQTD.length,
          deals_closed_ytd: closedWonYTD.length,
          pipeline_acv: pipelineACV,
          open_deals: openDeals.length,
        },
        board,
        period,
        deals: dealsWithNames,
        activities,
        fiscal_year: fiscalYear,
        fiscal_quarter: fiscalQuarter,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
