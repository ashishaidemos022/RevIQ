import { getSalesforceConnection } from './client';
import { getSupabaseClient } from '@/lib/supabase/client';

interface SalesforceAccount {
  Id: string;
  Name: string;
  Sales_Region__c: string | null;
  Account_ARR__c: number | null;
  Customer_Status__c: string | null;
  Sales_Segment__c: string | null;
  Segment_Industry__c: string | null;
  TD_Industry__c: string | null;
  TD_Subvertical__c: string | null;
  Customer_Success_Manager__c: string | null;
  SDR__c: string | null;
  ExecSponsor__c: string | null;
  ParentId: string | null;
  CX_Strategist__c: string | null;
  Master_Agent_RV_Account__c: string | null;
  OwnerId: string | null;
}

export interface AccountSyncResult {
  total_accounts: number;
  synced: number;
  errors: string[];
}

export async function syncSalesforceAccounts(): Promise<AccountSyncResult> {
  const conn = await getSalesforceConnection();
  const db = getSupabaseClient();

  // Step 1: Get Account IDs that have opportunities with close_date >= 2025-02-01
  const oppAccountIds = new Set<string>();
  const oppQuery = conn.query<{ AccountId: string }>(
    "SELECT AccountId FROM Opportunity WHERE CloseDate >= 2025-02-01 AND AccountId != null"
  );

  await new Promise<void>((resolve, reject) => {
    oppQuery.on('record', (record: { AccountId: string }) => {
      oppAccountIds.add(record.AccountId);
    });
    oppQuery.on('end', () => resolve());
    oppQuery.on('error', (err: Error) => reject(err));
    oppQuery.run({ autoFetch: true, maxFetch: 50000 });
  });

  if (oppAccountIds.size === 0) {
    return { total_accounts: 0, synced: 0, errors: [] };
  }

  // Step 2: Query those accounts, excluding "Test Accounts" region
  // SOQL IN clause has a 20,000 ID limit; batch if needed
  const accountIdArray = Array.from(oppAccountIds);
  const sfAccounts: SalesforceAccount[] = [];
  const batchSize = 500; // Safe batch size for SOQL IN clause

  for (let i = 0; i < accountIdArray.length; i += batchSize) {
    const batch = accountIdArray.slice(i, i + batchSize);
    const idList = batch.map((id) => `'${id}'`).join(',');

    const soql = `SELECT Id, Name, Sales_Region__c, Account_ARR__c, Customer_Status__c,
      Sales_Segment__c, Segment_Industry__c, TD_Industry__c, TD_Subvertical__c,
      Customer_Success_Manager__c, SDR__c, ExecSponsor__c, ParentId,
      CX_Strategist__c, Master_Agent_RV_Account__c, OwnerId
      FROM Account
      WHERE Id IN (${idList})
      AND (Sales_Region__c != 'Test Accounts' OR Sales_Region__c = null)`;

    const query = conn.query<SalesforceAccount>(soql);

    await new Promise<void>((resolve, reject) => {
      query.on('record', (record: SalesforceAccount) => {
        sfAccounts.push(record);
      });
      query.on('end', () => resolve());
      query.on('error', (err: Error) => reject(err));
      query.run({ autoFetch: true, maxFetch: 50000 });
    });
  }

  const result: AccountSyncResult = {
    total_accounts: sfAccounts.length,
    synced: 0,
    errors: [],
  };

  // Step 3: Build owner lookup — map SF User ID to local user ID
  const { data: localUsers } = await db
    .from('users')
    .select('id, salesforce_user_id')
    .not('salesforce_user_id', 'is', null);

  const ownerMap = new Map(
    (localUsers || []).map((u) => [u.salesforce_user_id, u.id])
  );

  // Step 4: Upsert accounts into Supabase in batches
  const now = new Date().toISOString();
  const upsertBatchSize = 200;

  const records = sfAccounts.map((sfAccount) => ({
    salesforce_account_id: sfAccount.Id,
    name: sfAccount.Name,
    region: sfAccount.Sales_Region__c,
    sales_region: sfAccount.Sales_Region__c,
    account_arr: sfAccount.Account_ARR__c,
    customer_status: sfAccount.Customer_Status__c,
    sales_segment: sfAccount.Sales_Segment__c,
    segment_industry: sfAccount.Segment_Industry__c,
    td_industry: sfAccount.TD_Industry__c,
    td_subindustry: sfAccount.TD_Subvertical__c,
    customer_success_manager_sf_id: sfAccount.Customer_Success_Manager__c,
    sdr_sf_id: sfAccount.SDR__c,
    exec_sponsor_sf_id: sfAccount.ExecSponsor__c,
    parent_account_sf_id: sfAccount.ParentId,
    vmo_support_sf_id: sfAccount.CX_Strategist__c,
    rv_account_sf_id: sfAccount.Master_Agent_RV_Account__c,
    owner_user_id: ownerMap.get(sfAccount.OwnerId ?? '') || null,
    last_synced_at: now,
  }));

  for (let i = 0; i < records.length; i += upsertBatchSize) {
    const batch = records.slice(i, i + upsertBatchSize);
    const { error } = await db
      .from('accounts')
      .upsert(batch, { onConflict: 'salesforce_account_id' });

    if (error) {
      result.errors.push(`Batch ${i / upsertBatchSize + 1}: ${error.message}`);
    } else {
      result.synced += batch.length;
    }
  }

  return result;
}
