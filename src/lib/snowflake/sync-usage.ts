import { executeSnowflakeQuery } from './client';
import { getSupabaseClient } from '@/lib/supabase/client';

interface SnowflakeUsageRow {
  PERIOD_NAME: string;
  SF_ACCOUNT_OWNER_ID: string | null;
  SF_ACCOUNT_OWNER: string | null;
  SF_ACCOUNT_ID: string;
  SF_ACCOUNT_NAME: string | null;
  TD_BILLING_ACCOUNT_ID: string;
  TD_BILLING_ACCOUNT_NAME: string | null;
  TAXONOMY_NAME: string | null;
  MACRO_SKU_NAME_OLD: string | null;
  MACRO_SKU_NAME_NEW: string | null;
  WALLET_NAME: string;
  USAGE_TYPE: string | null;
  CURRENCY: string | null;
  CONTRACT_EXCHANGE_RATE: number | null;
  NS_EXCHANGE_RATE: number | null;
  TOTAL_CONSUMPTION_AMOUNT_CUR: number | null;
  TOTAL_OVERAGE_AMOUNT_CUR: number | null;
  TOTAL_CHARGED_AMOUNT_CUR: number | null;
  TOTAL_CONSUMPTION_AMOUNT_USD: number | null;
  TOTAL_OVERAGE_AMOUNT_USD: number | null;
  TOTAL_CHARGED_AMOUNT_NS_USD: number | null;
  TOTAL_CHARGED_AMOUNT_SF_USD: number | null;
}

export interface UsageSyncResult {
  synced: number;
  errors: string[];
}

/**
 * Sync usage billing data from Snowflake.
 * - 'initial' mode: fetch all data from Feb 2024 onward (PERIOD_NAME >= '202402')
 * - 'monthly' mode: fetch only the previous month's data
 */
export async function syncSnowflakeUsage(
  mode: 'initial' | 'monthly' = 'monthly'
): Promise<UsageSyncResult> {
  const view = process.env.SNOWFLAKE_USAGE_VIEW;
  if (!view) {
    throw new Error('SNOWFLAKE_USAGE_VIEW env var is not set');
  }

  // Build period filter based on mode
  let periodFilter: string;
  if (mode === 'initial') {
    periodFilter = "PERIOD_NAME >= '202402'";
  } else {
    // Previous month in YYYYMM format
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const yyyymm = `${prevMonth.getFullYear()}${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
    periodFilter = `PERIOD_NAME = '${yyyymm}'`;
  }

  const sql = `
    SELECT PERIOD_NAME, SF_ACCOUNT_OWNER_ID, SF_ACCOUNT_OWNER,
           SF_ACCOUNT_ID, SF_ACCOUNT_NAME,
           TD_BILLING_ACCOUNT_ID, TD_BILLING_ACCOUNT_NAME,
           TAXONOMY_NAME, MACRO_SKU_NAME_OLD, MACRO_SKU_NAME_NEW,
           WALLET_NAME, USAGE_TYPE, CURRENCY,
           CONTRACT_EXCHANGE_RATE, NS_EXCHANGE_RATE,
           TOTAL_CONSUMPTION_AMOUNT_CUR, TOTAL_OVERAGE_AMOUNT_CUR, TOTAL_CHARGED_AMOUNT_CUR,
           TOTAL_CONSUMPTION_AMOUNT_USD, TOTAL_OVERAGE_AMOUNT_USD,
           TOTAL_CHARGED_AMOUNT_NS_USD, TOTAL_CHARGED_AMOUNT_SF_USD
    FROM ${view}
    WHERE ${periodFilter}
    ORDER BY PERIOD_NAME DESC
  `;

  const rows = await executeSnowflakeQuery<SnowflakeUsageRow>(sql);

  if (rows.length === 0) {
    return { synced: 0, errors: [] };
  }

  const db = getSupabaseClient();
  const result: UsageSyncResult = { synced: 0, errors: [] };
  const batchSize = 200;

  // Map Snowflake rows to Supabase records
  const allRecords = rows.map((row) => ({
    period_name: String(row.PERIOD_NAME),
    sf_account_owner_id: row.SF_ACCOUNT_OWNER_ID || null,
    sf_account_owner: row.SF_ACCOUNT_OWNER || null,
    sf_account_id: String(row.SF_ACCOUNT_ID),
    sf_account_name: row.SF_ACCOUNT_NAME || null,
    td_billing_account_id: String(row.TD_BILLING_ACCOUNT_ID),
    td_billing_account_name: row.TD_BILLING_ACCOUNT_NAME || null,
    taxonomy_name: row.TAXONOMY_NAME || null,
    macro_sku_name_old: row.MACRO_SKU_NAME_OLD || null,
    macro_sku_name_new: row.MACRO_SKU_NAME_NEW || null,
    wallet_name: String(row.WALLET_NAME),
    usage_type: row.USAGE_TYPE || null,
    currency: row.CURRENCY || null,
    contract_exchange_rate: row.CONTRACT_EXCHANGE_RATE,
    ns_exchange_rate: row.NS_EXCHANGE_RATE,
    total_consumption_amount_cur: row.TOTAL_CONSUMPTION_AMOUNT_CUR,
    total_overage_amount_cur: row.TOTAL_OVERAGE_AMOUNT_CUR,
    total_charged_amount_cur: row.TOTAL_CHARGED_AMOUNT_CUR,
    total_consumption_amount_usd: row.TOTAL_CONSUMPTION_AMOUNT_USD,
    total_overage_amount_usd: row.TOTAL_OVERAGE_AMOUNT_USD,
    total_charged_amount_ns_usd: row.TOTAL_CHARGED_AMOUNT_NS_USD,
    total_charged_amount_sf_usd: row.TOTAL_CHARGED_AMOUNT_SF_USD,
    synced_at: new Date().toISOString(),
  }));

  // Deduplicate by unique key — prefer USD rows over other currencies
  const deduped = new Map<string, typeof allRecords[number]>();
  for (const rec of allRecords) {
    const key = `${rec.period_name}|${rec.td_billing_account_id}|${rec.wallet_name}`;
    const existing = deduped.get(key);
    if (!existing || (rec.currency === 'USD' && existing.currency !== 'USD')) {
      deduped.set(key, rec);
    }
  }
  const records = [...deduped.values()];

  // Batch upsert
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await db
      .from('usage_billing_summary')
      .upsert(batch, { onConflict: 'period_name,td_billing_account_id,wallet_name' });

    if (error) {
      result.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
    } else {
      result.synced += batch.length;
    }
  }

  return result;
}
