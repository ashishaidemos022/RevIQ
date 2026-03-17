import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, handleAuthError } from '@/lib/auth/middleware';
import { getQuarterStartDate, getQuarterEndDate, getFiscalYearRange, getCurrentFiscalPeriod, getQuarterLabel } from '@/lib/fiscal';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const scope = await resolveDataScope(user);
    const db = getSupabaseClient();
    const url = request.nextUrl;

    const board = url.searchParams.get('board') || 'revenue'; // revenue | pipeline | pilots | activities
    const period = url.searchParams.get('period') || 'qtd'; // qtd | ytd | mtd | prev_qtd | all_open | custom
    const aeType = url.searchParams.get('ae_type') || 'combined'; // combined | commercial | enterprise
    const region = url.searchParams.get('region') || 'combined'; // combined | AMER | EMEA | APAC
    const managerIdsParam = url.searchParams.get('manager_ids'); // comma-separated manager user IDs, empty = all
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
      // Previous fiscal quarter
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
    } else if (period === 'mtd') {
      const now = new Date();
      startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      endStr = now.toISOString().split('T')[0];
    }

    // Determine which AE roles to include (combined = both commercial + enterprise only)
    const aeRoles =
      aeType === 'commercial' ? ['commercial_ae'] :
      aeType === 'enterprise' ? ['enterprise_ae'] :
      ['commercial_ae', 'enterprise_ae']; // combined

    // If manager_ids provided, resolve their direct reports to filter AEs
    let managerAeIds: string[] | null = null;
    if (managerIdsParam) {
      const managerIds = managerIdsParam.split(',').filter(Boolean);
      if (managerIds.length > 0) {
        const { data: hierarchyRows } = await db
          .from('user_hierarchy')
          .select('user_id')
          .in('manager_id', managerIds)
          .is('effective_to', null);
        managerAeIds = (hierarchyRows ?? []).map(r => r.user_id);
      }
    }

    // Get AEs filtered by role type and optionally region
    let aeQuery = db
      .from('users')
      .select('id, full_name, region')
      .in('role', aeRoles)
      .eq('is_active', true);

    if (region !== 'combined') {
      aeQuery = aeQuery.eq('region', region);
    }

    if (managerAeIds !== null) {
      if (managerAeIds.length === 0) {
        return NextResponse.json({ data: [] });
      }
      aeQuery = aeQuery.in('id', managerAeIds);
    }

    const { data: allAEs } = await aeQuery;

    if (!allAEs || allAEs.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const aeIds = allAEs.map(ae => ae.id);

    // Resolve manager names for all AEs via user_hierarchy
    const { data: hierarchyRows } = await db
      .from('user_hierarchy')
      .select('user_id, manager_id')
      .in('user_id', aeIds)
      .is('effective_to', null);

    const managerIdSet = new Set((hierarchyRows ?? []).map(r => r.manager_id).filter(Boolean));
    const { data: managerUsers } = managerIdSet.size > 0
      ? await db.from('users').select('id, full_name').in('id', [...managerIdSet])
      : { data: [] };

    const managerNameMap: Record<string, string> = {};
    (managerUsers ?? []).forEach((m: { id: string; full_name: string }) => { managerNameMap[m.id] = m.full_name; });

    const aeManagerMap: Record<string, string | null> = {};
    (hierarchyRows ?? []).forEach((r: { user_id: string; manager_id: string }) => {
      aeManagerMap[r.user_id] = managerNameMap[r.manager_id] ?? null;
    });

    const entries: Array<{
      rank: number;
      user_id: string;
      full_name: string;
      region: string | null;
      manager_name: string | null;
      primary_metric: number;
      secondary_metrics: Record<string, number>;
      secondary_labels?: Record<string, string>;
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

      allAEs.forEach(ae => {
        const data = aeData[ae.id] || { acv: 0, deals: 0 };
        // For now, ACV with multiplier = same as ACV closed (multiplier logic TBD)
        const acvWithMultiplier = data.acv;
        entries.push({
          rank: 0,
          user_id: ae.id,
          full_name: ae.full_name,
          region: ae.region,
          manager_name: aeManagerMap[ae.id] ?? null,
          primary_metric: acvWithMultiplier,
          secondary_metrics: {
            acv_closed: data.acv,
            deals_closed: data.deals,
          },
          is_current_user: ae.id === user.user_id,
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));
    } else if (board === 'pipeline') {
      let query = db
        .from('opportunities')
        .select('owner_user_id, acv, opportunity_source')
        .eq('is_closed_won', false)
        .eq('is_closed_lost', false)
        .gt('acv', 0)
        .in('owner_user_id', aeIds);
      const { data: opps } = await query;

      const aeData: Record<string, { total: number; ae_sourced: number; sales_sourced: number; marketing_sourced: number; partner_sourced: number; deals: number }> = {};
      (opps || []).forEach((o: { owner_user_id: string | null; acv: number | null; opportunity_source: string | null }) => {
        const id = o.owner_user_id || '';
        const acv = o.acv || 0;
        if (!aeData[id]) aeData[id] = { total: 0, ae_sourced: 0, sales_sourced: 0, marketing_sourced: 0, partner_sourced: 0, deals: 0 };
        aeData[id].total += acv;
        aeData[id].deals++;
        // Categorize by opportunity source
        const src = (o.opportunity_source || '').toLowerCase();
        if (src.includes('ae') || src.includes('account executive')) {
          aeData[id].ae_sourced += acv;
        } else if (src.includes('marketing')) {
          aeData[id].marketing_sourced += acv;
        } else if (src.includes('partner') || src.includes('channel')) {
          aeData[id].partner_sourced += acv;
        } else {
          // Default bucket: sales sourced (SDR, outbound, sales, etc.)
          aeData[id].sales_sourced += acv;
        }
      });

      allAEs.forEach(ae => {
        const data = aeData[ae.id] || { total: 0, ae_sourced: 0, sales_sourced: 0, marketing_sourced: 0, partner_sourced: 0, deals: 0 };
        entries.push({
          rank: 0,
          user_id: ae.id,
          full_name: ae.full_name,
          region: ae.region,
          manager_name: aeManagerMap[ae.id] ?? null,
          primary_metric: data.total,
          secondary_metrics: {
            ae_sourced: data.ae_sourced,
            sales_sourced: data.sales_sourced,
            marketing_sourced: data.marketing_sourced,
            partner_sourced: data.partner_sourced,
            open_deals: data.deals,
            avg_deal_size: data.deals > 0 ? data.total / data.deals : 0,
          },
          is_current_user: ae.id === user.user_id,
        });
      });

      entries.sort((a, b) => b.primary_metric - a.primary_metric || a.full_name.localeCompare(b.full_name));
    } else if (board === 'pilots') {
      let query = db
        .from('opportunities')
        .select('owner_user_id, is_closed_won, is_closed_lost, paid_pilot_start_date, close_date, sf_created_date, created_at')
        .eq('is_paid_pilot', true)
        .in('owner_user_id', aeIds);
      const { data: opps } = await query;

      // Track per-quarter booked counts for each AE
      const aeData: Record<string, { booked: number; open: number; totalDuration: number; bookedCount: number; quarterCounts: Record<string, number> }> = {};
      (opps || []).forEach((o: { owner_user_id: string | null; is_closed_won: boolean; is_closed_lost: boolean; paid_pilot_start_date: string | null; close_date: string | null; sf_created_date: string | null; created_at: string }) => {
        const id = o.owner_user_id || '';
        if (!aeData[id]) aeData[id] = { booked: 0, open: 0, totalDuration: 0, bookedCount: 0, quarterCounts: {} };

        if (o.is_closed_won) {
          // Booked Paid Pilot = paid pilot + won
          aeData[id].booked++;
          aeData[id].bookedCount++;
          if (o.paid_pilot_start_date && o.close_date) {
            aeData[id].totalDuration += Math.ceil(
              (new Date(o.close_date).getTime() - new Date(o.paid_pilot_start_date).getTime()) / (1000 * 60 * 60 * 24)
            );
          }
        } else if (!o.is_closed_lost) {
          // Open Pilot = paid pilot + not closed (won or lost)
          aeData[id].open++;
        }

        // Track created-in-quarter using sf_created_date or fallback to created_at
        const createdDate = o.sf_created_date || o.created_at;
        if (createdDate) {
          const qLabel = getQuarterLabel(new Date(createdDate));
          aeData[id].quarterCounts[qLabel] = (aeData[id].quarterCounts[qLabel] || 0) + 1;
        }
      });

      // Find the current fiscal quarter label for the "Created in Quarter" column
      const currentQLabel = `Q${fiscalQuarter} FY${fiscalYear}`;

      allAEs.forEach(ae => {
        const data = aeData[ae.id] || { booked: 0, open: 0, totalDuration: 0, bookedCount: 0, quarterCounts: {} };

        // Build "Created in Quarter" label, e.g. "FY27Q1: 2, FY27Q2: 1"
        // Format quarter labels as FY27Q1 (compact) from "Q1 FY2027"
        const quarterEntries = Object.entries(data.quarterCounts)
          .map(([label, count]) => {
            // Convert "Q1 FY2027" → "FY27Q1"
            const match = label.match(/Q(\d)\s+FY(\d{4})/);
            const compact = match ? `FY${match[2].slice(2)}Q${match[1]}` : label;
            return { compact, count };
          })
          .sort((a, b) => b.compact.localeCompare(a.compact)); // newest first
        const createdLabel = quarterEntries.length > 0
          ? quarterEntries.map(q => q.count > 1 ? `${q.compact}: ${q.count}` : q.compact).join(', ')
          : '—';

        entries.push({
          rank: 0,
          user_id: ae.id,
          full_name: ae.full_name,
          region: ae.region,
          manager_name: aeManagerMap[ae.id] ?? null,
          primary_metric: data.booked,
          secondary_metrics: {
            open_pilots: data.open,
            avg_duration: data.bookedCount > 0 ? Math.round(data.totalDuration / data.bookedCount) : 0,
          },
          secondary_labels: {
            created_in_quarter: createdLabel,
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

      const aeData: Record<string, { total: number; call: number; email: number; meeting: number; linkedin: number }> = {};
      (acts || []).forEach((a: { owner_user_id: string | null; activity_type: string }) => {
        const id = a.owner_user_id || '';
        if (!aeData[id]) aeData[id] = { total: 0, call: 0, email: 0, meeting: 0, linkedin: 0 };
        aeData[id].total++;
        const type = a.activity_type?.toLowerCase();
        if (type === 'call') aeData[id].call++;
        else if (type === 'email') aeData[id].email++;
        else if (type === 'meeting') aeData[id].meeting++;
        else if (type === 'linkedin') aeData[id].linkedin++;
      });

      allAEs.forEach(ae => {
        const data = aeData[ae.id] || { total: 0, call: 0, email: 0, meeting: 0, linkedin: 0 };
        entries.push({
          rank: 0,
          user_id: ae.id,
          full_name: ae.full_name,
          region: ae.region,
          manager_name: aeManagerMap[ae.id] ?? null,
          primary_metric: data.total,
          secondary_metrics: {
            calls: data.call,
            emails: data.email,
            meetings: data.meeting,
            linkedin: data.linkedin,
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
