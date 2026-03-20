import { getSalesforceConnection } from './client';
import { getSupabaseClient } from '@/lib/supabase/client';

interface SalesforceOpportunityPartner {
  Id: string;
  OpportunityId: string;
  AccountToId: string | null;
  AccountTo: { Name: string } | null;
  Role: string | null;
  IsPrimary: boolean;
  Channel_Owner__c: string | null;
  Engagement__c: string | null;
  CreatedDate: string;
}

export interface OpportunityPartnerSyncResult {
  total_partners: number;
  synced: number;
  errors: string[];
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
    errors: [],
  };

  if (sfPartners.length === 0) {
    return result;
  }

  // Build opportunity ID lookup
  const oppSfIds = [...new Set(sfPartners.map(p => p.OpportunityId))];
  const oppMap = new Map<string, string>();
  const pageSize = 1000;

  for (let i = 0; i < oppSfIds.length; i += pageSize) {
    const batch = oppSfIds.slice(i, i + pageSize);
    const { data: opps } = await db
      .from('opportunities')
      .select('id, salesforce_opportunity_id')
      .in('salesforce_opportunity_id', batch);
    (opps || []).forEach(o => oppMap.set(o.salesforce_opportunity_id, o.id));
  }

  // Map and upsert
  const now = new Date().toISOString();
  const batchSize = 200;

  const records = sfPartners.map((p) => ({
    salesforce_partner_id: p.Id,
    salesforce_opportunity_id: p.OpportunityId,
    opportunity_id: oppMap.get(p.OpportunityId) || null,
    partner_account_sf_id: p.AccountToId,
    partner_account_name: p.AccountTo?.Name || null,
    role: p.Role,
    is_primary: p.IsPrimary,
    channel_owner_sf_id: p.Channel_Owner__c,
    engagement: p.Engagement__c,
    sf_created_date: p.CreatedDate,
    last_synced_at: now,
  }));

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
