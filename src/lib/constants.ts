import { UserRole } from '@/types';

/** Roles that have data pages (Home, Pipeline, Pilots, Activities, Performance, Usage) */
const DATA_PAGE_ROLES: UserRole[] = ['commercial_ae', 'enterprise_ae', 'pbm', 'leader', 'cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];
/** Roles that have activity data (AE-side only, not PBM) */
const ACTIVITY_ROLES: UserRole[] = ['commercial_ae', 'enterprise_ae', 'leader', 'cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];

export const NAV_ITEMS = [
  { label: 'Home', href: '/home', icon: 'Home', roles: DATA_PAGE_ROLES, requiresAeReports: false },
  { label: 'Pipeline', href: '/pipeline', icon: 'BarChart3', roles: DATA_PAGE_ROLES, requiresAeReports: false },
  { label: 'Paid Pilots', href: '/pilots', icon: 'FlaskConical', roles: DATA_PAGE_ROLES, requiresAeReports: false },
  { label: 'Activities', href: '/activities', icon: 'Zap', roles: ACTIVITY_ROLES, requiresAeReports: true },
  { label: 'Performance', href: '/performance', icon: 'TrendingUp', roles: DATA_PAGE_ROLES, requiresAeReports: false },
  { label: 'AE Leaderboards', href: '/leaderboard', icon: 'Trophy', roles: 'all' as const, requiresAeReports: false },
  { label: 'PBM Leaderboards', href: '/pbm-leaderboard', icon: 'Handshake', roles: 'all' as const, requiresAeReports: false },
  { label: 'Partner Leaderboards', href: '/partner-leaderboard', icon: 'Building2', roles: 'all' as const, requiresAeReports: false },
  { label: 'Usage', href: '/usage', icon: 'Radio', roles: DATA_PAGE_ROLES, requiresAeReports: true },
  { label: 'Team View', href: '/team', icon: 'Users', roles: ['leader', 'cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'] as UserRole[], requiresAeReports: false },
  { label: 'Settings', href: '/settings', icon: 'Settings', roles: ['cro', 'c_level', 'revops_rw', 'enterprise_ro'] as UserRole[], requiresAeReports: false },
];

export const MOBILE_NAV_ITEMS = [
  { label: 'Home', href: '/home', icon: 'Home' },
  { label: 'Pipeline', href: '/pipeline', icon: 'BarChart3' },
  { label: 'Leaderboard', href: '/leaderboard', icon: 'Trophy' },
  { label: 'Usage', href: '/usage', icon: 'Radio' },
  { label: 'More', href: '/settings', icon: 'Menu' },
] as const;

export const PBM_ROLES: UserRole[] = ['pbm'];
export const AE_ROLES: UserRole[] = ['commercial_ae', 'enterprise_ae'];
export const MANAGER_PLUS_ROLES: UserRole[] = ['leader', 'cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];
export const SYNC_ROLES: UserRole[] = ['revops_rw'];
export const QUOTA_WRITE_ROLES: UserRole[] = ['revops_rw'];
export const COMMISSION_RATE_WRITE_ROLES: UserRole[] = ['revops_rw'];
export const FULL_ACCESS_ROLES: UserRole[] = ['cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];
export const VIEW_AS_ROLES: UserRole[] = ['revops_rw', 'revops_ro', 'cro', 'c_level'];
