import { getSalesforceConnection } from './client';
import { getSupabaseClient } from '@/lib/supabase/client';

interface SalesforceOpportunitySplit {
  Id: string;
  OpportunityId: string;
  SplitOwnerId: string;
  SplitAmount: number | null;
  SplitPercentage: number | null;
  SplitType: { Name: string } | null;
  CreatedDate: string;
}

const SOQL_FIELDS = [
  'Id', 'OpportunityId', 'SplitOwnerId', 'SplitAmount',
  'SplitPercentage', 'SplitType.Name', 'CreatedDate',
].join(', ');

export interface OpportunitySplitSyncResult {
  total_splits: number;
  synced: number;
  errors: string[];
}

export async function syncOpportunitySplits(): Promise<OpportunitySplitSyncResult> {
  const conn = await getSalesforceConnection();
  const db = getSupabaseClient();

  // Get all synced Salesforce Opportunity IDs from local DB
  const sfOppIds: string[] = [];
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: page } = await db
      .from('opportunities')
      .select('salesforce_opportunity_id')
      .range(offset, offset + pageSize - 1);

    if (!page || page.length === 0) {
      hasMore = false;
    } else {
      for (const o of page) {
        sfOppIds.push(o.salesforce_opportunity_id);
      }
      offset += page.length;
      if (page.length < pageSize) hasMore = false;
    }
  }

  if (sfOppIds.length === 0) {
    return { total_splits: 0, synced: 0, errors: [] };
  }

  // Query OpportunitySplit in batches (SOQL IN clause limit ~20,000 chars)
  // Use chunks of 200 IDs per query
  const sfSplits: SalesforceOpportunitySplit[] = [];
  const idChunkSize = 200;

  for (let i = 0; i < sfOppIds.length; i += idChunkSize) {
    const chunk = sfOppIds.slice(i, i + idChunkSize);
    const idList = chunk.map(id => `'${id}'`).join(',');
    const soql = `SELECT ${SOQL_FIELDS} FROM OpportunitySplit WHERE OpportunityId IN (${idList})`;

    await new Promise<void>((resolve, reject) => {
      const q = conn.query<SalesforceOpportunitySplit>(soql);
      q.on('record', (record: SalesforceOpportunitySplit) => {
        sfSplits.push(record);
      });
      q.on('end', () => resolve());
      q.on('error', (err: Error) => reject(err));
      q.run({ autoFetch: true, maxFetch: 100000 });
    });
  }

  const result: OpportunitySplitSyncResult = {
    total_splits: sfSplits.length,
    synced: 0,
    errors: [],
  };

  if (sfSplits.length === 0) {
    return result;
  }

  // Build lookups: SF Opportunity ID → local opportunity ID, SF User ID → local user ID
  const oppMap = new Map<string, string>();
  offset = 0;
  hasMore = true;
  while (hasMore) {
    const { data: page } = await db
      .from('opportunities')
      .select('id, salesforce_opportunity_id')
      .range(offset, offset + pageSize - 1);

    if (!page || page.length === 0) {
      hasMore = false;
    } else {
      for (const o of page) {
        oppMap.set(o.salesforce_opportunity_id, o.id);
      }
      offset += page.length;
      if (page.length < pageSize) hasMore = false;
    }
  }

  const { data: localUsers } = await db
    .from('users')
    .select('id, salesforce_user_id')
    .not('salesforce_user_id', 'is', null);

  const userMap = new Map(
    (localUsers || []).map((u) => [u.salesforce_user_id, u.id])
  );

  // Map and batch upsert
  const now = new Date().toISOString();
  const batchSize = 200;

  const records = sfSplits.map((split) => ({
    salesforce_split_id: split.Id,
    salesforce_opportunity_id: split.OpportunityId,
    opportunity_id: oppMap.get(split.OpportunityId) || null,
    split_owner_sf_id: split.SplitOwnerId,
    split_owner_user_id: userMap.get(split.SplitOwnerId) || null,
    split_amount: split.SplitAmount,
    split_percentage: split.SplitPercentage,
    split_type: split.SplitType?.Name || null,
    sf_created_date: split.CreatedDate,
    last_synced_at: now,
  }));

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await db
      .from('opportunity_splits')
      .upsert(batch, { onConflict: 'salesforce_split_id' });

    if (error) {
      result.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
    } else {
      result.synced += batch.length;
    }
  }

  return result;
}
