import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveDataScope, resolveViewAs, handleAuthError, scopedQuery } from '@/lib/auth/middleware';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { REVENUE_SPLIT_TYPE, splitAcv, flattenSplitRows } from '@/lib/splits/query-helpers';

/**
 * GET /api/pilots/conversions
 *
 * Returns booked/closed pilots paired with their child conversion deals
 * (linked via parent_pilot_opportunity_sf_id), plus funnel-level conversion metrics.
 *
 * This powers the "Pilot → Conversion Flow" view — showing how pilots
 * turn into full-size deals and the ACV uplift from pilot to conversion.
 */

const BOOKED_STAGES = [
  'Stage 8-Closed Won: Finance',
  'Stage 7-Closed Won',
  'Stage 6-Closed-Won: Finance Approved',
  'Stage 5-Closed Won',
];

const PILOT_SELECT = [
  'split_owner_user_id',
  'split_percentage',
  'opportunities!inner(id, salesforce_opportunity_id, name, stage, acv, close_date,',
  'paid_pilot_start_date, paid_pilot_end_date, pilot_status,',
  'is_closed_won, is_closed_lost, is_paid_pilot, sf_created_date, account_id,',
  'parent_pilot_opportunity_sf_id,',
  'accounts(id, name, industry, region),',
  'users!opportunities_owner_user_id_fkey(id, full_name, email))',
].join(' ');

interface PilotRow {
  id: string;
  salesforce_opportunity_id: string;
  name: string;
  stage: string;
  acv: number | null;
  close_date: string | null;
  paid_pilot_start_date: string | null;
  paid_pilot_end_date: string | null;
  pilot_status: string | null;
  is_closed_won: boolean;
  is_closed_lost: boolean;
  is_paid_pilot: boolean;
  sf_created_date: string | null;
  account_id: string | null;
  parent_pilot_opportunity_sf_id: string | null;
  accounts: { id: string; name: string; industry: string | null; region: string | null } | null;
  users: { id: string; full_name: string; email: string } | null;
  split_owner_user_id: string;
  split_pct: number;
  [key: string]: unknown;
}

interface ChildOpp {
  id: string;
  salesforce_opportunity_id: string;
  name: string;
  stage: string;
  acv: number | null;
  close_date: string | null;
  is_closed_won: boolean;
  is_closed_lost: boolean;
  parent_pilot_opportunity_sf_id: string | null;
  account_id: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const scope = await resolveDataScope(user, viewAsUser);
    const db = getSupabaseClient();

    // 1. Fetch all paid pilot opportunities (booked = closed-won stages)
    const rawSplits = await fetchAll<{
      split_owner_user_id: string;
      split_percentage: number | string;
      opportunities: Record<string, unknown>;
    }>(() => {
      let q = db
        .from('opportunity_splits')
        .select(PILOT_SELECT)
        .eq('split_type', REVENUE_SPLIT_TYPE)
        .eq('opportunities.is_paid_pilot', true);
      q = scopedQuery(q, 'split_owner_user_id', scope);
      return q.order('opportunities(close_date)', { ascending: false });
    });

    const allPilots = flattenSplitRows(rawSplits) as PilotRow[];

    // We care about booked pilots (closed-won stages) for conversion tracking
    const bookedPilots = allPilots.filter(p => BOOKED_STAGES.includes(p.stage));
    const bookedSfIds = bookedPilots.map(p => p.salesforce_opportunity_id);

    // 2. Fetch all child opportunities that reference these pilots
    const childOpps: ChildOpp[] = [];
    for (let i = 0; i < bookedSfIds.length; i += 50) {
      const batch = bookedSfIds.slice(i, i + 50);
      const { data, error } = await db
        .from('opportunities')
        .select('id, salesforce_opportunity_id, name, stage, acv, close_date, is_closed_won, is_closed_lost, parent_pilot_opportunity_sf_id, account_id')
        .in('parent_pilot_opportunity_sf_id', batch);
      if (error) throw error;
      if (data) childOpps.push(...(data as ChildOpp[]));
    }

    // Also check for open pipeline on the same accounts (potential future conversions)
    // These are non-pilot, non-closed opps on accounts that have booked pilots
    const pilotAccountIds = [...new Set(
      bookedPilots
        .map(p => p.account_id || p.accounts?.id)
        .filter((id): id is string => !!id)
    )];

    const pendingConversions: ChildOpp[] = [];
    for (let i = 0; i < pilotAccountIds.length; i += 50) {
      const batch = pilotAccountIds.slice(i, i + 50);
      const { data, error } = await db
        .from('opportunities')
        .select('id, salesforce_opportunity_id, name, stage, acv, close_date, is_closed_won, is_closed_lost, parent_pilot_opportunity_sf_id, account_id')
        .in('account_id', batch)
        .eq('is_paid_pilot', false)
        .eq('is_closed_won', false)
        .eq('is_closed_lost', false)
        .is('parent_pilot_opportunity_sf_id', null);
      if (error) throw error;
      if (data) pendingConversions.push(...(data as ChildOpp[]));
    }

    // Index children and pending by parent SF ID / account
    const childrenByParentSfId: Record<string, ChildOpp[]> = {};
    for (const c of childOpps) {
      const key = c.parent_pilot_opportunity_sf_id!;
      if (!childrenByParentSfId[key]) childrenByParentSfId[key] = [];
      childrenByParentSfId[key].push(c);
    }

    const pendingByAccount: Record<string, ChildOpp[]> = {};
    for (const c of pendingConversions) {
      const key = c.account_id!;
      if (!pendingByAccount[key]) pendingByAccount[key] = [];
      pendingByAccount[key].push(c);
    }

    // 3. Build conversion flow rows
    const now = Date.now();
    const conversions = bookedPilots.map(pilot => {
      const sfId = pilot.salesforce_opportunity_id;
      const acctId = pilot.account_id || pilot.accounts?.id || '';
      const linkedChildren = childrenByParentSfId[sfId] || [];
      const accountPending = pendingByAccount[acctId] || [];

      const wonChildren = linkedChildren.filter(c => c.is_closed_won);
      const lostChildren = linkedChildren.filter(c => c.is_closed_lost);
      const openChildren = linkedChildren.filter(c => !c.is_closed_won && !c.is_closed_lost);

      const conversionAcv = wonChildren.reduce((s, c) => s + (Number(c.acv) || 0), 0);
      const pendingAcv = [...openChildren, ...accountPending].reduce((s, c) => s + (Number(c.acv) || 0), 0);
      const pilotAcv = splitAcv(pilot.acv, pilot.split_pct);

      // Uplift multiplier: conversion ACV / pilot ACV
      const uplift = pilotAcv > 0 && conversionAcv > 0 ? conversionAcv / pilotAcv : null;

      // Days from pilot close to conversion close (for won children)
      const conversionDays = wonChildren
        .map(c => {
          if (!c.close_date || !pilot.close_date) return null;
          const diff = new Date(c.close_date).getTime() - new Date(pilot.close_date).getTime();
          return Math.floor(diff / (1000 * 60 * 60 * 24));
        })
        .filter((d): d is number => d !== null);
      const avgConversionDays = conversionDays.length > 0
        ? Math.round(conversionDays.reduce((s, d) => s + d, 0) / conversionDays.length)
        : null;

      // Pilot duration (start to end or now)
      let pilotDurationDays: number | null = null;
      if (pilot.paid_pilot_start_date) {
        const startMs = new Date(pilot.paid_pilot_start_date).getTime();
        const endMs = pilot.paid_pilot_end_date
          ? new Date(pilot.paid_pilot_end_date).getTime()
          : now;
        pilotDurationDays = Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
      }

      // Determine conversion status
      let conversionStatus: string;
      if (wonChildren.length > 0) conversionStatus = 'Converted';
      else if (lostChildren.length > 0 && openChildren.length === 0 && accountPending.length === 0) conversionStatus = 'Lost';
      else if (openChildren.length > 0 || accountPending.length > 0) conversionStatus = 'Pending';
      else conversionStatus = 'No Pipeline';

      return {
        pilot_id: pilot.id,
        pilot_sf_id: sfId,
        pilot_name: pilot.name,
        pilot_stage: pilot.stage,
        pilot_acv: pilotAcv,
        pilot_close_date: pilot.close_date,
        pilot_start_date: pilot.paid_pilot_start_date,
        pilot_end_date: pilot.paid_pilot_end_date,
        pilot_duration_days: pilotDurationDays,
        account_id: acctId,
        account_name: pilot.accounts?.name || '—',
        ae_name: pilot.users?.full_name || '—',
        conversion_status: conversionStatus,
        conversion_acv: conversionAcv,
        pending_acv: pendingAcv,
        uplift_multiplier: uplift,
        avg_conversion_days: avgConversionDays,
        won_deals: wonChildren.map(c => ({
          id: c.id,
          name: c.name,
          stage: c.stage,
          acv: Number(c.acv) || 0,
          close_date: c.close_date,
        })),
        open_deals: [...openChildren, ...accountPending].map(c => ({
          id: c.id,
          name: c.name,
          stage: c.stage,
          acv: Number(c.acv) || 0,
          close_date: c.close_date,
        })),
        lost_deals: lostChildren.map(c => ({
          id: c.id,
          name: c.name,
          stage: c.stage,
          acv: Number(c.acv) || 0,
          close_date: c.close_date,
        })),
      };
    });

    // Sort: Converted first, then Pending, then rest
    const statusOrder: Record<string, number> = { Converted: 0, Pending: 1, Lost: 2, 'No Pipeline': 3 };
    conversions.sort((a, b) => (statusOrder[a.conversion_status] ?? 9) - (statusOrder[b.conversion_status] ?? 9));

    // 4. Summary KPIs
    const totalBookedPilots = bookedPilots.length;
    const convertedCount = conversions.filter(c => c.conversion_status === 'Converted').length;
    const conversionRate = totalBookedPilots > 0 ? (convertedCount / totalBookedPilots) * 100 : 0;
    const totalConversionAcv = conversions.reduce((s, c) => s + c.conversion_acv, 0);
    const totalPilotAcv = conversions.reduce((s, c) => s + c.pilot_acv, 0);
    const avgUplift = totalPilotAcv > 0 ? totalConversionAcv / totalPilotAcv : 0;
    const allConvDays = conversions
      .map(c => c.avg_conversion_days)
      .filter((d): d is number => d !== null);
    const avgDaysToConvert = allConvDays.length > 0
      ? Math.round(allConvDays.reduce((s, d) => s + d, 0) / allConvDays.length)
      : null;
    const totalPendingAcv = conversions.reduce((s, c) => s + c.pending_acv, 0);

    return NextResponse.json({
      data: conversions,
      kpis: {
        total_booked_pilots: totalBookedPilots,
        converted_count: convertedCount,
        conversion_rate: conversionRate,
        total_conversion_acv: totalConversionAcv,
        total_pilot_acv: totalPilotAcv,
        avg_uplift_multiplier: avgUplift,
        avg_days_to_convert: avgDaysToConvert,
        total_pending_acv: totalPendingAcv,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
