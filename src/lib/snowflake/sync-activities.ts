import { executeSnowflakeQuery } from './client';
import { getSupabaseClient } from '@/lib/supabase/client';

interface SnowflakeActivityRow {
  OWNER_ID: string;
  AE_NAME: string;
  ACTIVITY_DATE: string;
  ACTIVITY_COUNT: number;
  CALL_COUNT: number;
  EMAIL_COUNT: number;
  LINKEDIN_COUNT: number;
  MEETING_COUNT: number;
}

export interface ActivitySyncResult {
  synced: number;
  errors: string[];
}

export async function syncSnowflakeActivities(
  mode: 'initial' | 'daily' = 'daily'
): Promise<ActivitySyncResult> {
  const table = process.env.SNOWFLAKE_ACTIVITY_TABLE;
  if (!table) {
    throw new Error('SNOWFLAKE_ACTIVITY_TABLE env var is not set');
  }

  // Build date filter based on mode
  const dateFilter =
    mode === 'initial'
      ? "ACTIVITY_DATE >= DATEADD(month, -6, CURRENT_DATE())"
      : "ACTIVITY_DATE >= DATEADD(day, -2, CURRENT_DATE())";

  const sql = `
    SELECT OWNER_ID, AE_NAME, ACTIVITY_DATE, ACTIVITY_COUNT,
           CALL_COUNT, EMAIL_COUNT, LINKEDIN_COUNT, MEETING_COUNT
    FROM ${table}
    WHERE ${dateFilter}
    ORDER BY ACTIVITY_DATE DESC
  `;

  const rows = await executeSnowflakeQuery<SnowflakeActivityRow>(sql);

  if (rows.length === 0) {
    return { synced: 0, errors: [] };
  }

  const db = getSupabaseClient();
  const result: ActivitySyncResult = { synced: 0, errors: [] };
  const batchSize = 200;

  // Map Snowflake rows to Supabase records
  const records = rows.map((row) => ({
    owner_sf_id: row.OWNER_ID,
    ae_name: row.AE_NAME,
    activity_date: typeof row.ACTIVITY_DATE === 'string'
      ? row.ACTIVITY_DATE.split('T')[0]
      : new Date(row.ACTIVITY_DATE).toISOString().split('T')[0],
    activity_count: row.ACTIVITY_COUNT || 0,
    call_count: row.CALL_COUNT || 0,
    email_count: row.EMAIL_COUNT || 0,
    linkedin_count: row.LINKEDIN_COUNT || 0,
    meeting_count: row.MEETING_COUNT || 0,
    synced_at: new Date().toISOString(),
  }));

  // Batch upsert
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await db
      .from('activity_daily_summary')
      .upsert(batch, { onConflict: 'owner_sf_id,activity_date' });

    if (error) {
      result.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
    } else {
      result.synced += batch.length;
    }
  }

  return result;
}
