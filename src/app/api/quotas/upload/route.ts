import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, requireRole, handleAuthError } from '@/lib/auth/middleware';
import { getCurrentFiscalPeriod } from '@/lib/fiscal';
import { logAudit } from '@/lib/audit';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    requireRole(user, 'revops_rw');

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    // Detect columns - support flexible naming
    const keys = Object.keys(rows[0]);
    const nameCol = keys.find(k => /^name$/i.test(k.trim()));
    const oktaIdCol = keys.find(k => /okta.*id/i.test(k.trim()));
    const quotaCol = keys.find(k => /quota|assigned/i.test(k.trim()));
    const icrCol = keys.find(k => /icr|commission|rate/i.test(k.trim()));
    const q1Col = keys.find(k => /^q1$/i.test(k.trim()));
    const q2Col = keys.find(k => /^q2$/i.test(k.trim()));
    const q3Col = keys.find(k => /^q3$/i.test(k.trim()));
    const q4Col = keys.find(k => /^q4$/i.test(k.trim()));

    if (!oktaIdCol) {
      return NextResponse.json({ error: 'Missing Okta User ID column' }, { status: 400 });
    }
    if (!quotaCol) {
      return NextResponse.json({ error: 'Missing quota column (e.g., "Assigned Quota (USD)")' }, { status: 400 });
    }

    const db = getSupabaseClient();
    const { fiscalYear } = getCurrentFiscalPeriod();

    // Resolve okta_ids to user UUIDs
    const oktaIds = rows
      .map(r => String(r[oktaIdCol] || '').trim())
      .filter(Boolean);

    const { data: users, error: usersError } = await db
      .from('users')
      .select('id, okta_id, full_name, role')
      .in('okta_id', oktaIds);

    if (usersError) {
      return NextResponse.json({ error: `User lookup failed: ${usersError.message}` }, { status: 500 });
    }

    const userMap = new Map((users || []).map(u => [u.okta_id, u]));

    const results = {
      processed: 0,
      quotas_upserted: 0,
      commission_rates_upserted: 0,
      skipped: [] as string[],
      errors: [] as string[],
    };

    for (const row of rows) {
      const oktaId = String(row[oktaIdCol] || '').trim();
      const name = nameCol ? String(row[nameCol] || '').trim() : oktaId;

      if (!oktaId) {
        results.skipped.push(name || 'Unknown - no Okta ID');
        continue;
      }

      const dbUser = userMap.get(oktaId);
      if (!dbUser) {
        results.skipped.push(`${name} (Okta ID not found in users table)`);
        continue;
      }

      // Parse quota amount - handle currency formatting
      const rawQuota = row[quotaCol];
      const quotaAmount = typeof rawQuota === 'number'
        ? rawQuota
        : parseFloat(String(rawQuota).replace(/[$,]/g, ''));

      if (isNaN(quotaAmount) || quotaAmount <= 0) {
        results.skipped.push(`${name} (invalid quota: ${rawQuota})`);
        continue;
      }

      const fallbackQuarterly = Math.round((quotaAmount / 4) * 100) / 100;

      // Parse Q1-Q4 from file; fall back to annual/4 if null
      const parseAmount = (raw: unknown): number | null => {
        if (raw == null || String(raw).trim() === '') return null;
        const val = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[$,]/g, ''));
        return isNaN(val) ? null : val;
      };

      const q1 = (q1Col ? parseAmount(row[q1Col]) : null) ?? fallbackQuarterly;
      const q2 = (q2Col ? parseAmount(row[q2Col]) : null) ?? fallbackQuarterly;
      const q3 = (q3Col ? parseAmount(row[q3Col]) : null) ?? fallbackQuarterly;
      const q4 = (q4Col ? parseAmount(row[q4Col]) : null) ?? fallbackQuarterly;

      // Delete existing quotas for this user/fy/type, then insert fresh
      await db
        .from('quotas')
        .delete()
        .eq('user_id', dbUser.id)
        .eq('fiscal_year', fiscalYear)
        .eq('quota_type', 'revenue');

      // Insert annual + 4 quarterly quotas
      const quotaRows = [
        { user_id: dbUser.id, fiscal_year: fiscalYear, fiscal_quarter: null, quota_amount: quotaAmount, quota_type: 'revenue', entered_by: user.user_id },
        { user_id: dbUser.id, fiscal_year: fiscalYear, fiscal_quarter: 1, quota_amount: q1, quota_type: 'revenue', entered_by: user.user_id },
        { user_id: dbUser.id, fiscal_year: fiscalYear, fiscal_quarter: 2, quota_amount: q2, quota_type: 'revenue', entered_by: user.user_id },
        { user_id: dbUser.id, fiscal_year: fiscalYear, fiscal_quarter: 3, quota_amount: q3, quota_type: 'revenue', entered_by: user.user_id },
        { user_id: dbUser.id, fiscal_year: fiscalYear, fiscal_quarter: 4, quota_amount: q4, quota_type: 'revenue', entered_by: user.user_id },
      ];

      const { error: quotaErr } = await db.from('quotas').insert(quotaRows);

      if (quotaErr) {
        results.errors.push(`${name}: quota insert - ${quotaErr.message}`);
        continue;
      }

      results.quotas_upserted += 5;

      // Insert commission rate if ICR column exists
      if (icrCol && row[icrCol] != null && String(row[icrCol]).trim() !== '') {
        const rawRate = row[icrCol];
        let rate = typeof rawRate === 'number'
          ? rawRate
          : parseFloat(String(rawRate).replace(/[%]/g, ''));

        // If rate > 1, assume it's a percentage (e.g., 8 = 8%)
        if (rate > 1) {
          rate = rate / 100;
        }

        if (!isNaN(rate) && rate > 0) {
          // Delete existing rate for this user/fy (annual, all deal types)
          await db
            .from('commission_rates')
            .delete()
            .eq('user_id', dbUser.id)
            .eq('fiscal_year', fiscalYear)
            .is('fiscal_quarter', null)
            .is('deal_type', null);

          const { error: rateErr } = await db
            .from('commission_rates')
            .insert({
              user_id: dbUser.id,
              fiscal_year: fiscalYear,
              fiscal_quarter: null,
              deal_type: null,
              rate,
              entered_by: user.user_id,
            });

          if (rateErr) {
            results.errors.push(`${name}: commission rate - ${rateErr.message}`);
          } else {
            results.commission_rates_upserted++;
          }
        }
      }

      results.processed++;
    }

    logAudit({
      event_type: 'quota.upload',
      actor_id: user.user_id,
      actor_email: user.email,
      target_type: 'quota',
      metadata: {
        fiscal_year: fiscalYear,
        processed: results.processed,
        quotas_upserted: results.quotas_upserted,
        commission_rates_upserted: results.commission_rates_upserted,
        skipped_count: results.skipped.length,
        error_count: results.errors.length,
      },
    });

    return NextResponse.json({
      success: true,
      fiscal_year: fiscalYear,
      ...results,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
