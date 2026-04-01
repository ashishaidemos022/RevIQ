import { SyncLog, FiscalConfig, UserPreference, PermissionOverride } from '@/types/database';

// ---------------------------------------------------------------------------
// Miscellaneous mock records
// ---------------------------------------------------------------------------

export const MOCK_FISCAL_CONFIG: FiscalConfig[] = [
  {
    id: 'demo-fiscal-001',
    fy_start_month: 2,
    fy_start_day: 1,
    updated_by: 'demo-usr-003',
    updated_at: '2024-01-15T00:00:00Z',
  },
];

export const MOCK_USER_PREFERENCES: UserPreference[] = [
  { user_id: 'demo-usr-001', theme: 'light', updated_at: '2026-01-01T00:00:00Z' },
  { user_id: 'demo-usr-002', theme: 'light', updated_at: '2026-01-01T00:00:00Z' },
  { user_id: 'demo-usr-003', theme: 'dark',  updated_at: '2026-01-01T00:00:00Z' },
  { user_id: 'demo-usr-004', theme: 'light', updated_at: '2026-01-01T00:00:00Z' },
  { user_id: 'demo-usr-008', theme: 'light', updated_at: '2026-01-01T00:00:00Z' },
];

// No active overrides in demo mode
export const MOCK_PERMISSION_OVERRIDES: PermissionOverride[] = [];

export const MOCK_SYNC_LOGS: SyncLog[] = [
  {
    id: 'demo-sync-001',
    sync_type: 'salesforce',
    triggered_by: 'demo-usr-003',
    target_user_id: null,
    started_at: '2026-03-27T06:00:00Z',
    completed_at: '2026-03-27T06:02:34Z',
    status: 'success',
    records_synced: 247,
    error_message: null,
    raw_payload: null,
  },
  {
    id: 'demo-sync-002',
    sync_type: 'snowflake',
    triggered_by: 'demo-usr-003',
    target_user_id: null,
    started_at: '2026-03-27T06:02:40Z',
    completed_at: '2026-03-27T06:04:15Z',
    status: 'success',
    records_synced: 184,
    error_message: null,
    raw_payload: null,
  },
  {
    id: 'demo-sync-003',
    sync_type: 'salesforce',
    triggered_by: null,
    target_user_id: null,
    started_at: '2026-03-26T06:00:00Z',
    completed_at: '2026-03-26T06:03:01Z',
    status: 'success',
    records_synced: 243,
    error_message: null,
    raw_payload: null,
  },
  {
    id: 'demo-sync-004',
    sync_type: 'salesforce',
    triggered_by: null,
    target_user_id: null,
    started_at: '2026-03-25T06:00:00Z',
    completed_at: '2026-03-25T06:02:48Z',
    status: 'success',
    records_synced: 241,
    error_message: null,
    raw_payload: null,
  },
];
