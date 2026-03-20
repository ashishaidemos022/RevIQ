import { getSalesforceConnection } from './client';
import { getSupabaseClient } from '@/lib/supabase/client';

interface SalesforceOpportunityPartner {
  Id: string;
  OpportunityId: string;
  AccountToId: string | null;
  AccountTo: { Name: string } | null;
  Role: string | null;
  IsPrimary: boolean;
  CreatedDate: string;
}

export interface OpportunityPartnerSyncResult {
  total_partners: number;
  synced: number;
  matched_opportunities: number;
  unmatched_opportunities: number;
  errors: string[];
  debug?: { sample_partner_opp_id?: string; sample_opp_table_id?: string; opp_table_count?: number };
}

export async function syncOpportunityPartners(): Promise<OpportunityPartnerSyncResult> {
  const conn = await getSalesforceConnection();
  const db = getSupabaseClient();

  // Fetch all OpportunityPartner records with account name
  const sfPartners: SalesforceOpportunityPartner[] = [];

  await new Promise<void>((resolve, reject) => {
    const q = conn.query<SalesforceOpportunityPartner>(
      'SELECT Id, OpportunityId, AccountToId, AccountTo.Name, Role, IsPrimary, CreatedDate FROM OpportunityPartner'
    );
    q.on('record', (record: SalesforceOpportunityPartner) => {
      sfPartners.push(record);
    });
    q.on('end', () => resolve());
    q.on('error', (err: Error) => reject(err));
    q.run({ autoFetch: true, maxFetch: 100000 });
  });

  const result: OpportunityPartnerSyncResult = {
    total_partners: sfPartners.length,
    synced: 0,
    matched_opportunities: 0,
    unmatched_opportunities: 0,
    errors: [],
  };

  if (sfPartners.length === 0) {
    return result;
  }

  // Load ALL opportunities into a lookup map (keyed by salesforce_opportunity_id)
  // Also key by 15-char truncation to handle 15/18-char ID mismatches
  const to15 = (id: string) => id?.length === 18 ? id.substring(0, 15) : id;
  const oppMap = new Map<string, string>(); // SF opp ID → local UUID

  const pageSize = 1000; // Supabase default max_rows is 1000
  let offset = 0;
  let oppTableCount = 0;
  while (true) {
    const { data: opps, error: oppErr } = await db
      .from('opportunities')
      .select('id, salesforce_opportunity_id')
      .range(offset, offset + pageSize - 1);
    if (oppErr) {
      console.error('[OPP_PARTNER_SYNC] Error loading opportunities page:', oppErr.message);
    }
    if (!opps || opps.length === 0) break;
    oppTableCount += opps.length;
    console.log(`[OPP_PARTNER_SYNC] Loaded ${opps.length} opps (page ${Math.floor(offset / pageSize) + 1}, total so far: ${oppTableCount})`);
    opps.forEach(o => {
      oppMap.set(o.salesforce_opportunity_id, o.id);
      oppMap.set(to15(o.salesforce_opportunity_id), o.id);
    });
    if (opps.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`[OPP_PARTNER_SYNC] Opp map size: ${oppMap.size}, total opps loaded: ${oppTableCount}`);
  // Log a few sample keys from the opp map
  const sampleKeys = Array.from(oppMap.keys()).slice(0, 5);
  console.log(`[OPP_PARTNER_SYNC] Sample opp map keys: ${JSON.stringify(sampleKeys)}`);
  // Log a few sample partner OpportunityIds
  const samplePartnerIds = sfPartners.slice(0, 5).map(p => p.OpportunityId);
  console.log(`[OPP_PARTNER_SYNC] Sample partner OpportunityIds: ${JSON.stringify(samplePartnerIds)}`);
  // Test a specific lookup
  if (sfPartners.length > 0) {
    const testId = sfPartners[0].OpportunityId;
    const testId15 = to15(testId);
    console.log(`[OPP_PARTNER_SYNC] Test lookup: "${testId}" → ${oppMap.get(testId)}, to15="${testId15}" → ${oppMap.get(testId15)}`);
  }

  // Map and upsert
  const now = new Date().toISOString();
  const batchSize = 200;
  let matchedCount = 0;

  const records = sfPartners.map((p) => {
    const oppId = oppMap.get(p.OpportunityId) || oppMap.get(to15(p.OpportunityId)) || null;
    if (oppId) matchedCount++;
    return {
      salesforce_partner_id: p.Id,
      salesforce_opportunity_id: p.OpportunityId,
      opportunity_id: oppId,
      partner_account_sf_id: p.AccountToId,
      partner_account_name: p.AccountTo?.Name || null,
      role: p.Role,
      engagement: p.Role,
      is_primary: p.IsPrimary,
      sf_created_date: p.CreatedDate,
      last_synced_at: now,
    };
  });

  result.matched_opportunities = matchedCount;
  result.unmatched_opportunities = records.length - matchedCount;
  console.log(`[OPP_PARTNER_SYNC] Matched: ${matchedCount}, Unmatched: ${records.length - matchedCount}, Total partners: ${sfPartners.length}`);
  result.debug = {
    sample_partner_opp_id: sfPartners[0]?.OpportunityId,
    sample_opp_table_id: oppMap.keys().next().value,
    opp_table_count: oppTableCount,
  };

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await db
      .from('sf_opportunity_partners')
      .upsert(batch, { onConflict: 'salesforce_partner_id' });

    if (error) {
      result.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
    } else {
      result.synced += batch.length;
    }
  }

  return result;
}
