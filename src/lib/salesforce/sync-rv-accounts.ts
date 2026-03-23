import { getSalesforceConnection } from './client';
import { getSupabaseClient } from '@/lib/supabase/client';

interface SalesforceRVAccount {
  Id: string;
  Name: string;
  rvpe__SFAccount__c: string | null;
  Partner_type__c: string | null;
  Partner_Subtype__c: string | null;
  Region__c: string | null;
  OwnerId: string | null;
}

export interface RVAccountSyncResult {
  total_rv_accounts: number;
  synced: number;
  errors: string[];
}

export async function syncRVAccounts(): Promise<RVAccountSyncResult> {
  const conn = await getSalesforceConnection();
  const db = getSupabaseClient();

  // Query all RV Accounts
  const rvAccounts: SalesforceRVAccount[] = [];
  const query = conn.query<SalesforceRVAccount>(
    "SELECT Id, Name, rvpe__SFAccount__c, Partner_type__c, Partner_Subtype__c, Region__c, OwnerId FROM rvpe__RVAccount__c"
  );

  await new Promise<void>((resolve, reject) => {
    query.on('record', (record: SalesforceRVAccount) => {
      rvAccounts.push(record);
    });
    query.on('end', () => resolve());
    query.on('error', (err: Error) => reject(err));
    query.run({ autoFetch: true, maxFetch: 10000 });
  });

  const result: RVAccountSyncResult = {
    total_rv_accounts: rvAccounts.length,
    synced: 0,
    errors: [],
  };

  // Batch upsert RV Accounts
  const now = new Date().toISOString();
  const batchSize = 200;

  const records = rvAccounts.map((rv) => ({
    salesforce_rv_id: rv.Id,
    name: rv.Name,
    sf_account_id: rv.rvpe__SFAccount__c,
    partner_type: rv.Partner_type__c,
    partner_subtype: rv.Partner_Subtype__c,
    region: rv.Region__c,
    owner_sf_id: rv.OwnerId,
    last_synced_at: now,
  }));

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await db
      .from('rv_accounts')
      .upsert(batch, { onConflict: 'salesforce_rv_id' });

    if (error) {
      result.errors.push(`Batch ${i / batchSize + 1}: ${error.message}`);
    } else {
      result.synced += batch.length;
    }
  }

  return result;
}
