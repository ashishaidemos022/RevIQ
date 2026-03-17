import { UserRole } from '@/types';

export const NAV_ITEMS = [
  { label: 'Home', href: '/home', icon: 'Home', roles: 'all' as const },
  { label: 'Pipeline', href: '/pipeline', icon: 'BarChart3', roles: 'all' as const },
  { label: 'Paid Pilots', href: '/pilots', icon: 'FlaskConical', roles: 'all' as const },
  { label: 'Activities', href: '/activities', icon: 'Zap', roles: 'all' as const },
  { label: 'Performance', href: '/performance', icon: 'TrendingUp', roles: 'all' as const },
  { label: 'Leaderboard', href: '/leaderboard', icon: 'Trophy', roles: 'all' as const },
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

export const MANAGER_PLUS_ROLES: UserRole[] = ['manager', 'avp', 'vp', 'cro', 'c_level', 'revops_rw'];
export const SYNC_ROLES: UserRole[] = ['revops_rw'];
export const QUOTA_WRITE_ROLES: UserRole[] = ['vp', 'cro', 'c_level', 'revops_rw'];
export const COMMISSION_RATE_WRITE_ROLES: UserRole[] = ['cro', 'c_level', 'revops_rw'];
export const FULL_ACCESS_ROLES: UserRole[] = ['cro', 'c_level', 'revops_ro', 'revops_rw', 'enterprise_ro'];
