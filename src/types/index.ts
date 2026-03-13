export * from './database';

// Session types
export interface SessionUser {
  user_id: string;
  role: import('./database').UserRole;
  email: string;
  full_name: string;
}

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// Dashboard metric types
export interface KpiMetric {
  label: string;
  value: number | string;
  format?: 'currency' | 'number' | 'percent';
  trend?: {
    direction: 'up' | 'down' | 'flat';
    value: number;
    label: string;
  };
}

// Leaderboard
export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  full_name: string;
  region: string | null;
  primary_metric: number;
  secondary_metrics: Record<string, number>;
  is_current_user: boolean;
}

// Org tree node
export interface OrgTreeNode {
  user: Pick<import('./database').User, 'id' | 'full_name' | 'email' | 'role' | 'region' | 'is_active'>;
  children: OrgTreeNode[];
  direct_report_count: number;
  has_permission_override: boolean;
}
