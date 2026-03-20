import { UserRole } from '@/types';

export const NAV_ITEMS = [
  { label: 'Home', href: '/home', icon: 'Home', roles: 'all' as const },
  { label: 'Pipeline', href: '/pipeline', icon: 'BarChart3', roles: 'all' as const },
  { label: 'Paid Pilots', href: '/pilots', icon: 'FlaskConical', roles: 'all' as const },
  { label: 'Activities', href: '/activities', icon: 'Zap', roles: 'all' as const },
  { label: 'Performance', href: '/performance', icon: 'TrendingUp', roles: 'all' as const },
  { label: 'AE Leaderboard', href: '/leaderboard', icon: 'Trophy', roles: 'all' as const },
  { label: 'PBM Leaderboard', href: '/pbm-leaderboard', icon: 'Handshake', roles: 'all' as const },
  {
    label: 'Partner Leaderboard',
    href: '/partner-leaderboard',
    icon: 'Building2',
    roles: ['revops_rw', 'revops_ro', 'enterprise_ro'] as UserRole[],
  },
  { label: 'Usage', href: '/usage', icon: 'Radio', roles: 'all' as const },
  {
    label: 'Team View',
    href: '/team',
    icon: 'Users',
    roles: ['manager', 'avp', 'vp', 'cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'] as UserRole[],
  },
  { label: 'Settings', href: '/settings', icon: 'Settings', roles: 'all' as const },
] as const;

export const MOBILE_NAV_ITEMS = [
  { label: 'Home', href: '/home', icon: 'Home' },
  { label: 'Pipeline', href: '/pipeline', icon: 'BarChart3' },
  { label: 'Leaderboard', href: '/leaderboard', icon: 'Trophy' },
  { label: 'Usage', href: '/usage', icon: 'Radio' },
  { label: 'More', href: '/settings', icon: 'Menu' },
] as const;

export const AE_ROLES: UserRole[] = ['commercial_ae', 'enterprise_ae'];
export const MANAGER_PLUS_ROLES: UserRole[] = ['manager', 'avp', 'vp', 'cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];
export const SYNC_ROLES: UserRole[] = ['revops_rw'];
export const QUOTA_WRITE_ROLES: UserRole[] = ['vp', 'cro', 'c_level', 'revops_rw'];
export const COMMISSION_RATE_WRITE_ROLES: UserRole[] = ['cro', 'c_level', 'revops_rw'];
export const FULL_ACCESS_ROLES: UserRole[] = ['cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];
export const VIEW_AS_ROLES: UserRole[] = ['revops_rw', 'revops_ro', 'cro', 'c_level'];
