import { getSalesforceConnection } from './client';
import { getSupabaseClient } from '@/lib/supabase/client';

interface SalesforceOpportunity {
  Id: string;
  Name: string;
  AccountId: string | null;
  OwnerId: string | null;
  StageName: string;
  CloseDate: string;
  CreatedDate: string;
  Reporting_ACV__c: number | null;
  AI_ACV__c: number | null;
  Trial_Status__c: string | null;       // Pilot Type
  Pilot_Status__c: string | null;
  Parent_Pilot_Opportunity__c: string | null;
  Account_Temperature__c: string | null;
  Amount: number | null;                // TCV
  CSM__c: string | null;
  Record_Type_Name__c: string | null;
  Type: string | null;                  // Subtype
  Primary_Quote_Status__c: string | null;
  Opportunity_Source__c: string | null;
  CreatedById: string | null;
  Estimated_Monthly_PAYGO__c: number | null;
  Estimated_ACV_PAYGO__c: number | null;
  CXA_Committed_ARR__c: number | null;
  Sales_Led_Renewal__c: boolean | null;
  AE_Forecast_Category__c: string | null;
  VP_Commit__c: string | null;          // MGMT Forecast Category
  Next_Step__c: string | null;
  Manager_Notes__c: string | null;
  RV_Account__c: string | null;
  RV_Partner_Type__c: string | null;
  Channel_Manager__c: string | null;
  IsClosed: boolean;
  IsWon: boolean;
}

const SOQL_FIELDS = [
  'Id', 'Name', 'AccountId', 'OwnerId', 'StageName', 'CloseDate', 'CreatedDate',
  'Reporting_ACV__c', 'AI_ACV__c', 'Trial_Status__c', 'Pilot_Status__c',
  'Parent_Pilot_Opportunity__c', 'Account_Temperature__c', 'Amount',
  'CSM__c', 'Record_Type_Name__c', 'Type', 'Primary_Quote_Status__c',
  'Opportunity_Source__c', 'CreatedById', 'Estimated_Monthly_PAYGO__c',
  'Estimated_ACV_PAYGO__c', 'CXA_Committed_ARR__c', 'Sales_Led_Renewal__c',
  'AE_Forecast_Category__c', 'VP_Commit__c', 'Next_Step__c', 'Manager_Notes__c',
  'RV_Account__c', 'RV_Partner_Type__c', 'Channel_Manager__c',
  'IsClosed', 'IsWon',
].join(', ');

export interface OpportunitySyncResult {
  total_opportunities: number;
  synced: number;
  errors: string[];
}

export async function syncSalesforceOpportunities(): Promise<OpportunitySyncResult> {
  const conn = await getSalesforceConnection();
  const db = getSupabaseClient();

  // Query opportunities: close date >= 2025-02-01, record types New Business/Amendment/Renewal, exclude Dead-Duplicate
  const sfOpps: SalesforceOpportunity[] = [];
  const soql = `SELECT ${SOQL_FIELDS}
    FROM Opportunity
    WHERE CloseDate >= 2025-02-01
    AND Record_Type_Name__c IN ('New Business', 'Amendment', 'Renewal')
    AND StageName != 'Dead-Duplicate'
    AND (NOT Account.Name LIKE '%Test%')
    AND Account.Sales_Region__c != 'Test Accounts'`;

  const query = conn.query<SalesforceOpportunity>(soql);

  await new Promise<void>((resolve, reject) => {
    query.on('record', (record: SalesforceOpportunity) => {
      sfOpps.push(record);
    });
    query.on('end', () => resolve());
    query.on('error', (err: Error) => reject(err));
    query.run({ autoFetch: true, maxFetch: 100000 });
  });

  const result: OpportunitySyncResult = {
    total_opportunities: sfOpps.length,
    synced: 0,
    errors: [],
  };


  // Build lookups: SF User ID → local user ID, SF Account ID → local account ID
  const { data: localUsers } = await db
    .from('users')
    .select('id, salesforce_user_id')
    .not('salesforce_user_id', 'is', null);

  const userMap = new Map(
    (localUsers || []).map((u) => [u.salesforce_user_id, u.id])
  );

  // Paginate account fetch — Supabase defaults to 1,000 row limit
  const accountMap = new Map<string, string>();
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: page } = await db
      .from('accounts')
      .select('id, salesforce_account_id')
      .order('id')
      .range(offset, offset + pageSize - 1);

    if (!page || page.length === 0) {
      hasMore = false;
    } else {
      for (const a of page) {
        accountMap.set(a.salesforce_account_id, a.id);
      }
      offset += page.length;
      if (page.length < pageSize) hasMore = false;
    }
  }

  // Batch upsert
  const now = new Date().toISOString();
  const batchSize = 200;

  const records = sfOpps.map((opp) => ({
    salesforce_opportunity_id: opp.Id,
    name: opp.Name,
    account_id: accountMap.get(opp.AccountId ?? '') || null,
    owner_user_id: userMap.get(opp.OwnerId ?? '') || null,
    stage: opp.StageName,
    amount: opp.Amount,
    acv: opp.Reporting_ACV__c,
    close_date: opp.CloseDate,
    is_closed_won: opp.IsClosed && opp.IsWon,
    is_closed_lost: opp.IsClosed && !opp.IsWon,
    is_paid_pilot: opp.Trial_Status__c === 'Paid Pilot',
    pilot_type: opp.Trial_Status__c,
    forecast_category: opp.AE_Forecast_Category__c,
    type: opp.Record_Type_Name__c?.toLowerCase().replace(' ', '_') || null,
    reporting_acv: opp.Reporting_ACV__c,
    ai_acv: opp.AI_ACV__c,
    pilot_status: opp.Pilot_Status__c,
    parent_pilot_opportunity_sf_id: opp.Parent_Pilot_Opportunity__c,
    account_temperature: opp.Account_Temperature__c,
    tcv: opp.Amount,
    csm_sf_id: opp.CSM__c,
    record_type_name: opp.Record_Type_Name__c,
    sub_type: opp.Type,
    primary_quote_status: opp.Primary_Quote_Status__c,
    opportunity_source: opp.Opportunity_Source__c,
    created_by_sf_id: opp.CreatedById,
    estimated_monthly_paygo: opp.Estimated_Monthly_PAYGO__c,
    estimated_acv_paygo: opp.Estimated_ACV_PAYGO__c,
    cxa_committed_arr: opp.CXA_Committed_ARR__c,
    sales_led_renewal: opp.Sales_Led_Renewal__c,
    ae_forecast_category: opp.AE_Forecast_Category__c,
    mgmt_forecast_category: opp.VP_Commit__c,
    next_steps: opp.Next_Step__c,
    manager_notes: opp.Manager_Notes__c,
    rv_account_sf_id: opp.RV_Account__c,
    rv_account_type: opp.RV_Partner_Type__c,
    channel_owner_sf_id: opp.Channel_Manager__c,
    sf_created_date: opp.CreatedDate,
    last_synced_at: now,
  }));

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await db
      .from('opportunities')
      .upsert(batch, { onConflict: 'salesforce_opportunity_id' });

    if (error) {
      result.errors.push(`Batch ${i / batchSize + 1}: ${error.message}`);
    } else {
      result.synced += batch.length;
    }
  }

  return result;
}
