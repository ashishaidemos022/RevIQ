import { getSupabaseClient } from '@/lib/supabase/client';

export interface PbmCreditInfo {
  pbm_local_id: string;
  credit_path: 'Channel Owner' | 'RV Account Owner' | 'Partner Channel Owner';
  partner_name: string | null;
}

/**
 * Resolves all opportunities credited to a set of PBMs via 3 credit paths.
 * Returns a Map from salesforce_opportunity_id → array of PbmCreditInfo (one per credited PBM).
 * De-duplicated: each PBM gets credit once per opp even if multiple paths match.
 */
export async function resolvePbmCreditedOpps(
  pbmSfIdToLocalId: Map<string, string>
): Promise<Map<string, PbmCreditInfo[]>> {
  const db = getSupabaseClient();
  const pbmSfIds = [...pbmSfIdToLocalId.keys()];
  const result = new Map<string, PbmCreditInfo[]>();

  if (pbmSfIds.length === 0) return result;

  const addCredit = (oppSfId: string, info: PbmCreditInfo) => {
    if (!result.has(oppSfId)) result.set(oppSfId, []);
    const existing = result.get(oppSfId)!;
    // De-duplicate: skip if this PBM already credited on this opp
    if (existing.some(e => e.pbm_local_id === info.pbm_local_id)) return;
    existing.push(info);
  };

  // === Path 1: Channel Owner on Opportunity ===
  // Fetch all opps where channel_owner_sf_id matches a PBM
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data: opps } = await db
      .from('opportunities')
      .select('salesforce_opportunity_id, channel_owner_sf_id')
      .not('channel_owner_sf_id', 'is', null)
      .in('channel_owner_sf_id', pbmSfIds)
      .range(offset, offset + pageSize - 1);
    if (!opps || opps.length === 0) break;
    opps.forEach(o => {
      const localId = pbmSfIdToLocalId.get(o.channel_owner_sf_id);
      if (localId) {
        addCredit(o.salesforce_opportunity_id, {
          pbm_local_id: localId,
          credit_path: 'Channel Owner',
          partner_name: null,
        });
      }
    });
    if (opps.length < pageSize) break;
    offset += pageSize;
  }

  // === Path 2: RV Account Owner ===
  // Load rv_accounts owned by PBMs
  const rvAccountMap = new Map<string, { ownerLocalId: string; name: string }>(); // rv name → { ownerLocalId, name }
  offset = 0;
  while (true) {
    const { data: rvPage } = await db
      .from('rv_accounts')
      .select('name, owner_sf_id')
      .not('owner_sf_id', 'is', null)
      .in('owner_sf_id', pbmSfIds)
      .range(offset, offset + pageSize - 1);
    if (!rvPage || rvPage.length === 0) break;
    rvPage.forEach(ra => {
      const localId = pbmSfIdToLocalId.get(ra.owner_sf_id);
      if (localId) rvAccountMap.set(ra.name, { ownerLocalId: localId, name: ra.name });
    });
    if (rvPage.length < pageSize) break;
    offset += pageSize;
  }

  if (rvAccountMap.size > 0) {
    const rvNames = [...rvAccountMap.keys()];
    // Fetch opps referencing these RV accounts
    for (let i = 0; i < rvNames.length; i += 500) {
      const batch = rvNames.slice(i, i + 500);
      offset = 0;
      while (true) {
        const { data: opps } = await db
          .from('opportunities')
          .select('salesforce_opportunity_id, rv_account_sf_id')
          .in('rv_account_sf_id', batch)
          .range(offset, offset + pageSize - 1);
        if (!opps || opps.length === 0) break;
        opps.forEach(o => {
          const rv = rvAccountMap.get(o.rv_account_sf_id);
          if (rv) {
            addCredit(o.salesforce_opportunity_id, {
              pbm_local_id: rv.ownerLocalId,
              credit_path: 'RV Account Owner',
              partner_name: rv.name,
            });
          }
        });
        if (opps.length < pageSize) break;
        offset += pageSize;
      }
    }
  }

  // === Path 3: Partner__c Channel Owner ===
  offset = 0;
  while (true) {
    const { data: partners } = await db
      .from('sf_partners')
      .select('salesforce_opportunity_id, channel_owner_sf_id, name')
      .not('channel_owner_sf_id', 'is', null)
      .not('salesforce_opportunity_id', 'is', null)
      .in('channel_owner_sf_id', pbmSfIds)
      .range(offset, offset + pageSize - 1);
    if (!partners || partners.length === 0) break;
    partners.forEach(p => {
      const localId = pbmSfIdToLocalId.get(p.channel_owner_sf_id);
      if (localId) {
        addCredit(p.salesforce_opportunity_id, {
          pbm_local_id: localId,
          credit_path: 'Partner Channel Owner',
          partner_name: p.name,
        });
      }
    });
    if (partners.length < pageSize) break;
    offset += pageSize;
  }

  return result;
}

/**
 * Helper to resolve PBM SF IDs from local user IDs.
 */
export async function getPbmSfIdMap(pbmLocalIds: string[]): Promise<Map<string, string>> {
  const db = getSupabaseClient();
  const pbmSfIdToLocalId = new Map<string, string>();

  const { data: pbmUsers } = await db
    .from('users')
    .select('id, salesforce_user_id')
    .in('id', pbmLocalIds)
    .not('salesforce_user_id', 'is', null);

  (pbmUsers || []).forEach(u => pbmSfIdToLocalId.set(u.salesforce_user_id, u.id));
  return pbmSfIdToLocalId;
}
