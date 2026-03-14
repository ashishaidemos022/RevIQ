import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, handleAuthError } from '@/lib/auth/middleware';
import { getQuarterStartDate, getQuarterEndDate, getFiscalYearRange, getCurrentFiscalPeriod } from '@/lib/fiscal';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const scope = await resolveDataScope(user);
    const db = getSupabaseClient();
    const url = request.nextUrl;

    const board = url.searchParams.get('board') || 'revenue'; // revenue | pipeline | pilots | activities
    const period = url.searchParams.get('period') || 'qtd'; // qtd | ytd | mtd | all_open | custom
    const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();

    // Date range
    let startStr: string | undefined;
    let endStr: string | undefined;

    if (period === 'qtd') {
      const start = getQuarterStartDate(fiscalYear, fiscalQuarter);
      const end = getQuarterEndDate(fiscalYear, fiscalQuarter);
      startStr = start.toISOString().split('T')[0];
      endStr = end.toISOString().split('T')[0];
    } else if (period === 'ytd') {
      const { start, end } = getFiscalYearRange(fiscalYear);
      startStr = start.toISOString().split('T')[0];
      endStr = end.toISOString().split('T')[0];
    } else if (period === 'mtd') {
      const now = new Date();
      startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      endStr = now.toISOString().split('T')[0];
    }

    // Get all AEs (for leaderboard, all AEs are shown company-wide)
    const { data: allAEs } = await db
      .from('users')
      .select('id, full_name, region')
      .eq('role', 'ae')
      .eq('is_active', true);

    if (!allAEs || allAEs.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const aeIds = allAEs.map(ae => ae.id);
    const entries: Array<{
      rank: number;
      user_id: string;
      full_name: string;
      region: string | null;
      primary_metric: number;
      secondary_metrics: Record<string, number>;
      is_current_user: boolean;
    }> = [];

    if (board === 'revenue') {
      let query = db
        .from('opportunities')
        .select('owner_user_id, acv')
        .eq('is_closed_won', true)
        .in('owner_user_id', aeIds);
      if (startStr) query = query.gte('close_date', startStr);
      if (endStr) query = query.lte('close_date', endStr);
      const { data: opps } = await query;

      // Aggregate per AE
      const aeData: Record<string, { acv: number; deals: number }> = {};
      (opps || []).forEach((o: { owner_user_id: string | null; acv: number | null }) => {
        const id = o.owner_user_id || '';
        if (!aeData[id]) aeData[id] = { acv: 0, deals: 0 };
        aeData[id].acv += o.acv || 0;
        aeData[id].deals++;
      });

      // Get quotas for attainment
      const { data: quotas } = await db
        .from('quotas')
        .select('user_id, quota_amount')
        .eq('fiscal_year', fiscalYear)
        .eq('quota_type', 'revenue')
        .is('fiscal_quarter', null)
        .in('user_id', aeIds);

      const quotaMap: Record<string, number> = {};
      (quotas || []).forEach((q: { user_id: string; quota_amount: number }) => {
        quotaMap[q.user_id] = q.quota_amount;
      });

      allAEs.forEach(ae => {
        const data = aeData[ae.id] || { acv: 0, deals: 0 };
        const quota = quotaMap[ae.id] || 0;
        entries.push({
          rank: 0,
          user_id: ae.id,
          full_name: ae.full_name,
          region: ae.region,
          primary_metric: data.acv,
          secondary_metrics: {
            deals_closed: data.deals,
            quota_attainment: quota > 0 ? (data.acv / quota) * 100 : 0,
          },
          is_current_user: ae.id === user.user_id,
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));
    } else if (board === 'pipeline') {
      let query = db
        .from('opportunities')
        .select('owner_user_id, acv, probability')
        .eq('is_closed_won', false)
        .eq('is_closed_lost', false)
        .in('owner_user_id', aeIds);
      const { data: opps } = await query;

      const aeData: Record<string, { acv: number; weighted: number; deals: number }> = {};
      (opps || []).forEach((o: { owner_user_id: string | null; arr: number | null; probability: number | null }) => {
        const id = o.owner_user_id || '';
        if (!aeData[id]) aeData[id] = { acv: 0, weighted: 0, deals: 0 };
        aeData[id].acv += o.acv || 0;
        aeData[id].weighted += (o.acv || 0) * ((o.probability || 0) / 100);
        aeData[id].deals++;
      });

      allAEs.forEach(ae => {
        const data = aeData[ae.id] || { acv: 0, weighted: 0, deals: 0 };
        entries.push({
          rank: 0,
          user_id: ae.id,
          full_name: ae.full_name,
          region: ae.region,
          primary_metric: data.acv,
          secondary_metrics: {
            weighted_pipeline: data.weighted,
            open_deals: data.deals,
            avg_deal_size: data.deals > 0 ? data.acv / data.deals : 0,
          },
          is_current_user: ae.id === user.user_id,
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));
    } else if (board === 'pilots') {
      let query = db
        .from('opportunities')
        .select('owner_user_id, acv, is_closed_won, paid_pilot_start_date, close_date')
        .eq('is_paid_pilot', true)
        .in('owner_user_id', aeIds);
      const { data: opps } = await query;

      const aeData: Record<string, { active: number; acv: number; converted: number; total: number; totalDuration: number }> = {};
      (opps || []).forEach((o: { owner_user_id: string | null; acv: number | null; is_closed_won: boolean; paid_pilot_start_date: string | null; close_date: string | null }) => {
        const id = o.owner_user_id || '';
        if (!aeData[id]) aeData[id] = { active: 0, acv: 0, converted: 0, total: 0, totalDuration: 0 };
        aeData[id].total++;
        if (o.is_closed_won) {
          aeData[id].converted++;
          if (o.paid_pilot_start_date && o.close_date) {
            aeData[id].totalDuration += Math.ceil(
              (new Date(o.close_date).getTime() - new Date(o.paid_pilot_start_date).getTime()) / (1000 * 60 * 60 * 24)
            );
          }
        }
        if (!o.is_closed_won) {
          aeData[id].active++;
          aeData[id].acv += o.acv || 0;
        }
      });

      allAEs.forEach(ae => {
        const data = aeData[ae.id] || { active: 0, arr: 0, converted: 0, total: 0, totalDuration: 0 };
        entries.push({
          rank: 0,
          user_id: ae.id,
          full_name: ae.full_name,
          region: ae.region,
          primary_metric: data.active,
          secondary_metrics: {
            pilot_arr: data.acv,
            conversion_rate: data.total > 0 ? (data.converted / data.total) * 100 : 0,
            avg_duration: data.converted > 0 ? Math.round(data.totalDuration / data.converted) : 0,
          },
          is_current_user: ae.id === user.user_id,
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));
    } else if (board === 'activities') {
      let query = db
        .from('activities')
        .select('owner_user_id, activity_type')
        .in('owner_user_id', aeIds);
      if (startStr) query = query.gte('activity_date', startStr);
      if (endStr) query = query.lte('activity_date', endStr);
      const { data: acts } = await query;

      const aeData: Record<string, { total: number; call: number; email: number; meeting: number; demo: number }> = {};
      (acts || []).forEach((a: { owner_user_id: string | null; activity_type: string }) => {
        const id = a.owner_user_id || '';
        if (!aeData[id]) aeData[id] = { total: 0, call: 0, email: 0, meeting: 0, demo: 0 };
        aeData[id].total++;
        const type = a.activity_type as 'call' | 'email' | 'meeting' | 'demo';
        if (type in aeData[id]) aeData[id][type]++;
      });

      allAEs.forEach(ae => {
        const data = aeData[ae.id] || { total: 0, call: 0, email: 0, meeting: 0, demo: 0 };
        entries.push({
          rank: 0,
          user_id: ae.id,
          full_name: ae.full_name,
          region: ae.region,
          primary_metric: data.total,
          secondary_metrics: {
            calls: data.call,
            emails: data.email,
            meetings: data.meeting,
            demos: data.demo,
          },
          is_current_user: ae.id === user.user_id,
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
