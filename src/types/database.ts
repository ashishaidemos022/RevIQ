export type UserRole =
  | 'other'
  | 'commercial_ae'
  | 'enterprise_ae'
  | 'pbm'
  | 'leader'
  | 'cro'
  | 'c_level'
  | 'revops_ro'
  | 'revops_rw'
  | 'enterprise_ro';

export type QuotaType = 'revenue' | 'pilots' | 'pipeline' | 'activities';
export type ForecastCategory = 'commit' | 'best_case' | 'pipeline' | 'omitted';
export type OpportunityType = 'new_business' | 'renewal' | 'expansion';
export type ActivityType = 'call' | 'email' | 'linkedin' | 'meeting';
export type SyncType = 'salesforce' | 'scim' | 'snowflake';
export type SyncStatus = 'running' | 'success' | 'partial' | 'failed' | 'warning';
export type Theme = 'light' | 'dark';

export interface User {
  id: string;
  okta_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  salesforce_user_id: string | null;
  region: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserHierarchy {
  id: string;
  user_id: string;
  manager_id: string;
  effective_from: string;
  effective_to: string | null;
}

export interface Quota {
  id: string;
  user_id: string;
  fiscal_year: number;
  fiscal_quarter: number | null;
  quota_amount: number;
  quota_type: QuotaType;
  entered_by: string;
  created_at: string;
  updated_at: string;
  quota_scope_type: string | null;
  quota_scope_id: string | null;
}

export interface Account {
  id: string;
  salesforce_account_id: string;
  name: string;
  industry: string | null;
  region: string | null;
  owner_user_id: string | null;
  sales_region: string | null;
  account_arr: number | null;
  customer_status: string | null;
  sales_segment: string | null;
  segment_industry: string | null;
  td_industry: string | null;
  td_subindustry: string | null;
  customer_success_manager_sf_id: string | null;
  sdr_sf_id: string | null;
  exec_sponsor_sf_id: string | null;
  parent_account_sf_id: string | null;
  vmo_support_sf_id: string | null;
  rv_account_sf_id: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export interface RVAccount {
  id: string;
  salesforce_rv_id: string;
  name: string;
  sf_account_id: string | null;
  partner_subtype: string | null;
  region: string | null;
  owner_sf_id: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export interface Opportunity {
  id: string;
  salesforce_opportunity_id: string;
  account_id: string | null;
  owner_user_id: string | null;
  name: string;
  stage: string;
  amount: number | null;
  acv: number | null;
  close_date: string | null;
  is_closed_won: boolean;
  is_closed_lost: boolean;
  is_paid_pilot: boolean;
  pilot_type: string | null;
  paid_pilot_start_date: string | null;
  paid_pilot_end_date: string | null;
  forecast_category: ForecastCategory | null;
  probability: number | null;
  type: OpportunityType | null;
  last_stage_changed_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  reporting_acv: number | null;
  ai_acv: number | null;
  pilot_status: string | null;
  parent_pilot_opportunity_sf_id: string | null;
  account_temperature: string | null;
  tcv: number | null;
  csm_sf_id: string | null;
  record_type_name: string | null;
  sub_type: string | null;
  primary_quote_status: string | null;
  opportunity_source: string | null;
  created_by_sf_id: string | null;
  estimated_monthly_paygo: number | null;
  estimated_acv_paygo: number | null;
  cxa_committed_arr: number | null;
  sales_led_renewal: boolean | null;
  ae_forecast_category: string | null;
  mgmt_forecast_category: string | null;
  next_steps: string | null;
  manager_notes: string | null;
  rv_account_sf_id: string | null;
  rv_account_type: string | null;
  sf_created_date: string | null;
}

export interface OpportunitySplit {
  id: string;
  salesforce_split_id: string;
  opportunity_id: string | null;
  salesforce_opportunity_id: string;
  split_owner_user_id: string | null;
  split_owner_sf_id: string | null;
  split_amount: number | null;
  split_percentage: number | null;
  split_type: string | null;
  sf_created_date: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  salesforce_activity_id: string;
  opportunity_id: string | null;
  account_id: string | null;
  owner_user_id: string | null;
  activity_type: ActivityType;
  activity_date: string;
  subject: string | null;
  description: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export interface ActivityDailySummary {
  id: string;
  owner_sf_id: string;
  ae_name: string;
  activity_date: string;
  activity_count: number;
  call_count: number;
  email_count: number;
  linkedin_count: number;
  meeting_count: number;
  synced_at: string;
}

export interface CommissionRate {
  id: string;
  user_id: string | null;
  fiscal_year: number;
  fiscal_quarter: number | null;
  deal_type: string | null;
  rate: number;
  entered_by: string;
  created_at: string;
  updated_at: string;
}

export interface Commission {
  id: string;
  user_id: string;
  opportunity_id: string;
  fiscal_year: number;
  fiscal_quarter: number;
  base_amount: number | null;
  usage_multiplier: number | null;
  commission_rate: number | null;
  commission_amount: number | null;
  calculation_date: string | null;
  is_finalized: boolean;
  notes: string | null;
  created_at: string;
}

export interface UsageMetric {
  id: string;
  account_id: string;
  opportunity_id: string | null;
  metric_date: string;
  product_type: string;
  interaction_count: number;
  fetched_at: string;
}

export interface SyncLog {
  id: string;
  sync_type: SyncType;
  triggered_by: string | null;
  target_user_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: SyncStatus;
  records_synced: number | null;
  error_message: string | null;
  raw_payload: Record<string, unknown> | null;
}

export interface PermissionOverride {
  id: string;
  user_id: string;
  granted_by: string;
  effective_role: string;
  allow_writes: boolean;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
}

export interface UserPreference {
  user_id: string;
  theme: Theme;
  updated_at: string;
}

export interface FiscalConfig {
  id: string;
  fy_start_month: number;
  fy_start_day: number;
  updated_by: string | null;
  updated_at: string | null;
}

// Joined / extended types for API responses
export interface OpportunityWithAccount extends Opportunity {
  account?: Account;
  owner?: Pick<User, 'id' | 'full_name' | 'email'>;
}

export interface CommissionWithDetails extends Commission {
  opportunity?: Opportunity;
  user?: Pick<User, 'id' | 'full_name' | 'email'>;
}
