/**
 * Mock data barrel — re-exports all mock datasets.
 * The mock Supabase client (client.ts) imports directly from each data
 * file to avoid a circular dependency.
 */

// Data
export { MOCK_USERS, MOCK_USER_HIERARCHY, ORG_SUBTREE_MAP } from './users';
export { MOCK_ACCOUNTS } from './accounts';
export { MOCK_OPPORTUNITIES, MOCK_OPPORTUNITY_SPLITS } from './opportunities';
export { MOCK_QUOTAS } from './quotas';
export { MOCK_ACTIVITY_SUMMARIES } from './activity-summaries';
export { MOCK_USAGE_BILLING } from './usage-billing';
export { MOCK_COMMISSIONS, MOCK_COMMISSION_RATES } from './commissions';
export { MOCK_FISCAL_CONFIG, MOCK_SYNC_LOGS, MOCK_PERMISSION_OVERRIDES, MOCK_USER_PREFERENCES } from './misc';

// Client — import directly to avoid circular dep: client.ts ← index.ts ← client.ts
export { createMockSupabaseClient } from './client';
