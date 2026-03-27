import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { REVENUE_SPLIT_TYPE, splitAcv, flattenSplitRows } from '@/lib/splits/query-helpers';

const BOOKED_STAGES = [
  'Stage 8-Closed Won: Finance',
  'Stage 7-Closed Won',
  'Stage 6-Closed-Won: Finance Approved',
  'Stage 5-Closed Won',
];

const SPLIT_SELECT = [
  'split_owner_user_id',
  'split_percentage',
  'opportunities!inner(id, name, salesforce_opportunity_id, stage, acv, close_date, sf_created_date,',
  'is_closed_won, is_closed_lost, is_paid_pilot, paid_pilot_start_date, paid_pilot_end_date,',
  'parent_pilot_opportunity_sf_id,',
  'accounts(id, name, industry, region),',
  'users!opportunities_owner_user_id_fkey(id, full_name, email))',
].join(' ');

interface OppRow {
  id: string;
  salesforce_opportunity_id: string;
  name: string;
  stage: string;
  acv: number | null;
  close_date: string | null;
  sf_created_date: string | null;
  is_closed_won: boolean;
  is_closed_lost: boolean;
  is_paid_pilot: boolean;
  paid_pilot_start_date: string | null;
  paid_pilot_end_date: string | null;
  parent_pilot_opportunity_sf_id: string | null;
  accounts: { id: string; name: string } | null;
  users: { id: string; full_name: string; email: string } | null;
  split_owner_user_id: string;
  split_pct: number;
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();

    // Fetch all paid pilot opportunities via opportunity_splits
    const rawSplits = await fetchAll<{
      split_owner_user_id: string;
      split_percentage: number | string;
      opportunities: Record<string, unknown>;
    }>(() => {
      let q = db
        .from('opportunity_splits')
        .select(SPLIT_SELECT)
        .eq('split_type', REVENUE_SPLIT_TYPE)
        .eq('opportunities.is_paid_pilot', true);
      q = scopedQuery(q, 'split_owner_user_id', scope);
      return q.order('opportunities(close_date)', { ascending: false });
    });

    const pilots = flattenSplitRows(rawSplits) as OppRow[];

    // Booked pilots = won stages
    const bookedPilots = pilots.filter(p => BOOKED_STAGES.includes(p.stage));
    const bookedSfIds = bookedPilots.map(p => p.salesforce_opportunity_id);

    // Paid Pilot Win Rate = won pilots / (won + lost) — count-based, unweighted
    const wonPilots = pilots.filter(p => p.is_closed_won);
    const lostPilots = pilots.filter(p => p.is_closed_lost);
    const winRate = (wonPilots.length + lostPilots.length) > 0
      ? (wonPilots.length / (wonPilots.length + lostPilots.length)) * 100
      : 0;

    // Paid Pilot Conversion Rate = won child opps (referencing parent pilot) / total booked pilots
    let conversionRate = 0;
    if (bookedSfIds.length > 0) {
      // Find opportunities that reference booked pilots as parent and are won
      let wonChildCount = 0;
      for (let i = 0; i < bookedSfIds.length; i += 500) {
        const batch = bookedSfIds.slice(i, i + 500);
        const { count } = await db
          .from('opportunities')
          .select('id', { count: 'exact', head: true })
          .in('parent_pilot_opportunity_sf_id', batch)
          .eq('is_closed_won', true);
        wonChildCount += count || 0;
      }
      conversionRate = bookedPilots.length > 0
        ? (wonChildCount / bookedPilots.length) * 100
        : 0;
    }

    // Avg Pilot Deal Duration (Age) = days from sf_created_date to now or close_date
    const now = Date.now();
    const ages = pilots
      .map(p => {
        if (!p.sf_created_date) return null;
        const created = new Date(p.sf_created_date).getTime();
        const end = p.close_date ? new Date(p.close_date).getTime() : now;
        return Math.floor((end - created) / (1000 * 60 * 60 * 24));
      })
      .filter((a): a is number => a !== null && a >= 0);
    const avgDealDuration = ages.length > 0
      ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length)
      : 0;

    // Enrich with computed age and split-adjusted ACV
    const enriched = pilots.map(p => {
      let age: number | null = null;
      if (p.sf_created_date) {
        const created = new Date(p.sf_created_date).getTime();
        const end = p.close_date ? new Date(p.close_date).getTime() : now;
        age = Math.floor((end - created) / (1000 * 60 * 60 * 24));
      }
      return {
        ...p,
        age,
        split_acv: splitAcv(p.acv, p.split_pct),
      };
    });

    return NextResponse.json({
      data: enriched,
      kpis: {
        booked_pilots: bookedPilots.length,
        win_rate: winRate,
        conversion_rate: conversionRate,
        avg_deal_duration: avgDealDuration,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
