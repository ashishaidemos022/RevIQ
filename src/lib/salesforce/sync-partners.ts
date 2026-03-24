import { getSalesforceConnection } from './client';
import { getSupabaseClient } from '@/lib/supabase/client';

interface SalesforcePartner {
  Id: string;
  Name: string;
  Opportunity__c: string | null;
  Channel_Owner__c: string | null;
  RV_Account__c: string | null;
  Engagement__c: string | null;
  Primary_Partner__c: boolean;
  Partner_Account_Type__c: string | null;
  Master_Agent__c: string | null;
  Partner_Program__c: string | null;
  Source_Split__c: number | null;
  Influencer_Split__c: number | null;
  Fulfillment_Split__c: number | null;
  Opportunity_Close_Date__c: string | null;
  Opportunity_Total_ACV__c: number | null;
  RV_Partner_Type__c: string | null;
}

export interface PartnerSyncResult {
  total_partners: number;
  synced: number;
  matched_opportunities: number;
  unmatched_opportunities: number;
  errors: string[];
}

export async function syncPartners(): Promise<PartnerSyncResult> {
  const conn = await getSalesforceConnection();
  const db = getSupabaseClient();

  // Fetch all Partner__c records
  const sfPartners: SalesforcePartner[] = [];

  await new Promise<void>((resolve, reject) => {
    const q = conn.query<SalesforcePartner>(
      `SELECT Id, Name, Opportunity__c, Channel_Owner__c, RV_Account__c,
              Engagement__c, Primary_Partner__c, Partner_Account_Type__c,
              Master_Agent__c, Partner_Program__c, Source_Split__c,
              Influencer_Split__c, Fulfillment_Split__c,
              Opportunity_Close_Date__c, Opportunity_Total_ACV__c,
              RV_Partner_Type__c
       FROM Partner__c`
    );
    q.on('record', (record: SalesforcePartner) => {
      sfPartners.push(record);
    });
    q.on('end', () => resolve());
    q.on('error', (err: Error) => reject(err));
    q.run({ autoFetch: true, maxFetch: 100000 });
  });

  console.log(`[PARTNER_SYNC] Fetched ${sfPartners.length} Partner__c records from Salesforce`);

  const result: PartnerSyncResult = {
    total_partners: sfPartners.length,
    synced: 0,
    matched_opportunities: 0,
    unmatched_opportunities: 0,
    errors: [],
  };

  if (sfPartners.length === 0) {
    return result;
  }

  // Build opportunity lookup map (SF opp ID → local UUID)
  const to15 = (id: string) => id?.length === 18 ? id.substring(0, 15) : id;
  const oppMap = new Map<string, string>();

  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data: opps, error: oppErr } = await db
      .from('opportunities')
      .select('id, salesforce_opportunity_id')
      .order('id')
      .range(offset, offset + pageSize - 1);
    if (oppErr) {
      console.error('[PARTNER_SYNC] Error loading opportunities:', oppErr.message);
    }
    if (!opps || opps.length === 0) break;
    opps.forEach(o => {
      oppMap.set(o.salesforce_opportunity_id, o.id);
      oppMap.set(to15(o.salesforce_opportunity_id), o.id);
    });
    if (opps.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`[PARTNER_SYNC] Opp lookup map size: ${oppMap.size}`);

  // Map records
  const now = new Date().toISOString();
  let matchedCount = 0;

  const records = sfPartners.map((p) => {
    const oppId = p.Opportunity__c
      ? (oppMap.get(p.Opportunity__c) || oppMap.get(to15(p.Opportunity__c)) || null)
      : null;
    if (oppId) matchedCount++;

    return {
      salesforce_partner_id: p.Id,
      name: p.Name,
      salesforce_opportunity_id: p.Opportunity__c,
      opportunity_id: oppId,
      channel_owner_sf_id: p.Channel_Owner__c,
      rv_account_sf_id: p.RV_Account__c,
      engagement: p.Engagement__c,
      is_primary: p.Primary_Partner__c,
      partner_account_type: p.Partner_Account_Type__c,
      master_agent: p.Master_Agent__c,
      partner_program: p.Partner_Program__c,
      source_split: p.Source_Split__c,
      influencer_split: p.Influencer_Split__c,
      fulfillment_split: p.Fulfillment_Split__c,
      opportunity_close_date: p.Opportunity_Close_Date__c,
      opportunity_total_acv: p.Opportunity_Total_ACV__c,
      rv_partner_type: p.RV_Partner_Type__c,
      last_synced_at: now,
    };
  });

  result.matched_opportunities = matchedCount;
  result.unmatched_opportunities = records.length - matchedCount;
  console.log(`[PARTNER_SYNC] Matched: ${matchedCount}, Unmatched: ${records.length - matchedCount}`);

  // Upsert in batches
  const batchSize = 200;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await db
      .from('sf_partners')
      .upsert(batch, { onConflict: 'salesforce_partner_id' });

    if (error) {
      result.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
    } else {
      result.synced += batch.length;
    }
  }

  return result;
}
