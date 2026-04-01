/**
 * Demo mode utilities.
 *
 * When DEMO_MODE=true the app serves mock data from src/lib/mock/,
 * bypasses SAML auth, and never makes outbound calls to Supabase,
 * Salesforce, or Snowflake.
 */

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

// ---------------------------------------------------------------------------
// Demo personas shown on the login page role-picker
// ---------------------------------------------------------------------------

export interface DemoPersona {
  /** Matches user IDs in src/lib/mock/users.ts */
  userId: string;
  role: string;
  fullName: string;
  email: string;
  title: string;
  /** Short description shown in the picker card */
  description: string;
  /** Tailwind color class for the avatar background */
  color: string;
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    userId: 'demo-usr-001',
    role: 'cro',
    fullName: 'Sara Chen',
    email: 'sara.chen@orbisai.com',
    title: 'Chief Revenue Officer',
    description: 'Full company visibility across all regions, AEs, and PBMs',
    color: 'bg-violet-600',
  },
  {
    userId: 'demo-usr-004',
    role: 'leader',
    fullName: 'Mike Torres',
    email: 'mike.torres@orbisai.com',
    title: 'VP Sales — West',
    description: 'West region team view with 3 AEs and their pipeline',
    color: 'bg-blue-600',
  },
  {
    userId: 'demo-usr-008',
    role: 'enterprise_ae',
    fullName: 'Ashley Park',
    email: 'ashley.park@orbisai.com',
    title: 'Enterprise Account Executive',
    description: 'Individual AE view — own pipeline, quota, and commissions',
    color: 'bg-emerald-600',
  },
  {
    userId: 'demo-usr-003',
    role: 'revops_rw',
    fullName: 'James Rivera',
    email: 'james.rivera@orbisai.com',
    title: 'Revenue Operations',
    description: 'Full read/write — quotas, commission rates, sync controls',
    color: 'bg-amber-600',
  },
  {
    userId: 'demo-usr-002',
    role: 'c_level',
    fullName: 'Diana Wells',
    email: 'diana.wells@orbisai.com',
    title: 'Chief Financial Officer',
    description: 'Executive view with quota and commission rate access',
    color: 'bg-rose-600',
  },
];
