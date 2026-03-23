import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';
import { getQuarterStartDate, getQuarterEndDate, getFiscalYearRange, getCurrentFiscalPeriod } from '@/lib/fiscal';

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

interface PartnerEntry {
  rank: number;
  partner_id: string;
  partner_name: string;
  partner_type: string | null;
  pbm_name: string | null;
  region: string | null;
  primary_metric: number;
  secondary_metrics: Record<string, number>;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const db = getSupabaseClient();
    const url = request.nextUrl;

    const board = url.searchParams.get('board') || 'revenue';
    const period = url.searchParams.get('period') || 'qtd';
    const region = url.searchParams.get('region') || 'combined';
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

    // Fetch all RV accounts (partners)
    // Region values are granular (e.g., "Americas Regional East", "EMEA UKI", "APAC")
    // Map filter values to prefixes
    const regionPrefixMap: Record<string, string[]> = {
      AMER: ['Americas', 'LATAM'],
      EMEA: ['EMEA'],
      APAC: ['APAC'],
    };

    let rvQuery = db.from('rv_accounts').select('id, salesforce_rv_id, name, region, owner_sf_id, partner_type, partner_subtype');
    if (region !== 'combined') {
      const prefixes = regionPrefixMap[region] || [region];
      // Use OR filter with ilike for prefix matching
      const orFilter = prefixes.map(p => `region.ilike.${p}%`).join(',');
      rvQuery = rvQuery.or(orFilter);
    }
    const { data: rvAccounts } = await rvQuery;
    if (!rvAccounts || rvAccounts.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Build RV account name map (by salesforce_rv_id and by name)
    const rvMap = new Map<string, { id: string; name: string; region: string | null; owner_sf_id: string | null; partner_type: string | null; partner_subtype: string | null }>();
    const rvNameMap = new Map<string, { id: string; name: string; region: string | null; owner_sf_id: string | null; partner_type: string | null; partner_subtype: string | null }>();
    for (const rv of rvAccounts) {
      rvMap.set(rv.salesforce_rv_id, rv);
      rvNameMap.set(rv.name, rv);
    }

    // Opportunities linked to RV accounts via rv_account_sf_id (name-based match from sync)
    // The rv_account_sf_id field stores the RV Account name (from RV_Account__c which is a string field)
    const rvNames = rvAccounts.map(rv => rv.name);
    const rvSfIds = rvAccounts.map(rv => rv.salesforce_rv_id);

    // Fetch opportunities linked to these RV accounts
    // rv_account_sf_id can contain either the SF ID or the name - we need to handle both
    // Since FY starts Feb 2025 = FY2026, we use close_date >= 2025-02-01
    const minDate = '2025-02-01';

    // Paginate opportunity fetch
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;
    const allOpps: Array<{
      id: string;
      rv_account_sf_id: string;
      rv_account_type: string | null;
      opportunity_source: string | null;
      acv: number | null;
      close_date: string | null;
      is_closed_won: boolean;
      is_closed_lost: boolean;
      is_paid_pilot: boolean;
      paid_pilot_start_date: string | null;
      sf_created_date: string | null;
      created_at: string;
      stage: string;
      owner_user_id: string | null;
    }> = [];

    while (hasMore) {
      const { data: page } = await db
        .from('opportunities')
        .select('id, rv_account_sf_id, rv_account_type, opportunity_source, acv, close_date, is_closed_won, is_closed_lost, is_paid_pilot, paid_pilot_start_date, sf_created_date, created_at, stage, owner_user_id')
        .not('rv_account_sf_id', 'is', null)
        .gte('close_date', minDate)
        .range(offset, offset + pageSize - 1);

      if (!page || page.length === 0) {
        hasMore = false;
      } else {
        allOpps.push(...page);
        offset += page.length;
        if (page.length < pageSize) hasMore = false;
      }
    }

    // Resolve which RV account each opportunity belongs to
    // rv_account_sf_id stores the partner name (string field from SF)
    const oppsByPartner = new Map<string, typeof allOpps>();
    for (const opp of allOpps) {
      const rvId = opp.rv_account_sf_id;
      if (!rvId) continue;

      // Try matching by name first (rv_account_sf_id is a text field that stores the name)
      let partnerId: string | null = null;
      const byName = rvNameMap.get(rvId);
      if (byName) {
        partnerId = byName.id;
      } else {
        // Try matching by salesforce_rv_id
        const bySfId = rvMap.get(rvId);
        if (bySfId) partnerId = bySfId.id;
      }

      if (partnerId) {
        if (!oppsByPartner.has(partnerId)) oppsByPartner.set(partnerId, []);
        oppsByPartner.get(partnerId)!.push(opp);
      }
    }

    // Resolve PBM names from owner_sf_id on RV accounts
    const ownerSfIds = [...new Set(rvAccounts.map(rv => rv.owner_sf_id).filter(Boolean))];
    const pbmNameMap = new Map<string, string>();
    if (ownerSfIds.length > 0) {
      const { data: pbmUsers } = await db
        .from('users')
        .select('salesforce_user_id, full_name')
        .in('salesforce_user_id', ownerSfIds);
      (pbmUsers || []).forEach(u => pbmNameMap.set(u.salesforce_user_id, u.full_name));
    }

    // Filter partners: must have at least one active opp or sourced/influenced opp since Feb 2025
    const qualifiedPartners = rvAccounts.filter(rv => {
      const opps = oppsByPartner.get(rv.id) || [];
      return opps.length > 0;
    });

    const entries: PartnerEntry[] = [];

    if (board === 'revenue') {
      for (const rv of qualifiedPartners) {
        const opps = (oppsByPartner.get(rv.id) || []).filter(o => {
          if (!o.is_closed_won || !o.close_date) return false;
          if (startStr && o.close_date < startStr) return false;
          if (endStr && o.close_date > endStr) return false;
          return true;
        });

        const acv = opps.reduce((sum, o) => sum + (o.acv || 0), 0);
        const deals = opps.length;

        entries.push({
          rank: 0,
          partner_id: rv.id,
          partner_name: rv.name,
          partner_type: rv.partner_type || rv.partner_subtype || null,
          pbm_name: rv.owner_sf_id ? (pbmNameMap.get(rv.owner_sf_id) || null) : null,
          region: normalizeRegion(rv.region),
          primary_metric: acv,
          secondary_metrics: {
            acv_closed_multiplier: acv, // Same as ACV for now
            acv_closed: acv,
            deals,
          },
        });
      }
    } else if (board === 'pipeline') {
      for (const rv of qualifiedPartners) {
        const opps = (oppsByPartner.get(rv.id) || []).filter(o => {
          if (o.is_closed_won || o.is_closed_lost) return false;
          if (!o.close_date) return false;
          if (startStr && o.close_date < startStr) return false;
          if (endStr && o.close_date > endStr) return false;
          return true;
        });

        let totalAcv = 0;
        let partnerSourced = 0;
        let partnerInfluenced = 0;

        for (const opp of opps) {
          const acv = opp.acv || 0;
          totalAcv += acv;

          const src = (opp.opportunity_source || '').toLowerCase();
          if (src.includes('partner') || src.includes('channel')) {
            partnerSourced += acv;
          } else {
            partnerInfluenced += acv;
          }
        }

        const deals = opps.length;

        entries.push({
          rank: 0,
          partner_id: rv.id,
          partner_name: rv.name,
          partner_type: rv.partner_type || rv.partner_subtype || null,
          pbm_name: rv.owner_sf_id ? (pbmNameMap.get(rv.owner_sf_id) || null) : null,
          region: normalizeRegion(rv.region),
          primary_metric: totalAcv,
          secondary_metrics: {
            total_acv_created: totalAcv,
            partner_sourced: partnerSourced,
            partner_influenced: partnerInfluenced,
            deals,
            avg_size: deals > 0 ? totalAcv / deals : 0,
          },
        });
      }
    } else if (board === 'pilots') {
      for (const rv of qualifiedPartners) {
        const pilotOpps = (oppsByPartner.get(rv.id) || []).filter(o => o.is_paid_pilot);

        let booked = 0;
        let openPilots = 0;
        let totalDuration = 0;
        let bookedWithDuration = 0;
        let numCreated = 0;

        for (const opp of pilotOpps) {
          if (opp.is_closed_won) {
            booked++;
            if (opp.paid_pilot_start_date && opp.close_date) {
              const duration = Math.ceil(
                (new Date(opp.close_date).getTime() - new Date(opp.paid_pilot_start_date).getTime()) / (1000 * 60 * 60 * 24)
              );
              totalDuration += duration;
              bookedWithDuration++;
            }
          } else if (!opp.is_closed_lost) {
            openPilots++;
          }

          // Count pilots created within selected period
          const createdDate = (opp.sf_created_date || opp.created_at || '').split('T')[0];
          if (createdDate) {
            const inRange = (!startStr || createdDate >= startStr) && (!endStr || createdDate <= endStr);
            if (inRange) numCreated++;
          }
        }

        entries.push({
          rank: 0,
          partner_id: rv.id,
          partner_name: rv.name,
          partner_type: rv.partner_type || rv.partner_subtype || null,
          pbm_name: rv.owner_sf_id ? (pbmNameMap.get(rv.owner_sf_id) || null) : null,
          region: normalizeRegion(rv.region),
          primary_metric: booked,
          secondary_metrics: {
            booked_pilots: booked,
            open_pilots: openPilots,
            avg_duration: bookedWithDuration > 0 ? Math.round(totalDuration / bookedWithDuration) : 0,
            num_created: numCreated,
          },
        });
      }
    }

    // Sort and rank
    entries.sort((a, b) => b.primary_metric - a.primary_metric || a.partner_name.localeCompare(b.partner_name));
    entries.forEach((e, i) => { e.rank = i + 1; });

    return NextResponse.json({ data: entries });
  } catch (error) {
    return handleAuthError(error);
  }
}
