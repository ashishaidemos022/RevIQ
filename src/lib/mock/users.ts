import { User, UserHierarchy } from '@/types/database';

// ---------------------------------------------------------------------------
// Fictional company: Orbis AI — enterprise AI platform, ~$40M ARR
// Org: CRO → 4 regional VPs → 9 AEs + 2 PBMs
// ---------------------------------------------------------------------------

export const MOCK_USERS: User[] = [
  // ── C-Suite / Full-access ─────────────────────────────────────────────────
  {
    id: 'demo-usr-001',
    okta_id: 'okta-demo-001',
    email: 'sara.chen@orbisai.com',
    full_name: 'Sara Chen',
    role: 'cro',
    salesforce_user_id: 'sf-usr-001',
    region: null,
    is_active: true,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'demo-usr-002',
    okta_id: 'okta-demo-002',
    email: 'diana.wells@orbisai.com',
    full_name: 'Diana Wells',
    role: 'c_level',
    salesforce_user_id: 'sf-usr-002',
    region: null,
    is_active: true,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'demo-usr-003',
    okta_id: 'okta-demo-003',
    email: 'james.rivera@orbisai.com',
    full_name: 'James Rivera',
    role: 'revops_rw',
    salesforce_user_id: null,
    region: null,
    is_active: true,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },

  // ── Regional Leaders ──────────────────────────────────────────────────────
  {
    id: 'demo-usr-004',
    okta_id: 'okta-demo-004',
    email: 'mike.torres@orbisai.com',
    full_name: 'Mike Torres',
    role: 'leader',
    salesforce_user_id: 'sf-usr-004',
    region: 'AMER',
    is_active: true,
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
  {
    id: 'demo-usr-005',
    okta_id: 'okta-demo-005',
    email: 'sophie.okonkwo@orbisai.com',
    full_name: 'Sophie Okonkwo',
    role: 'leader',
    salesforce_user_id: 'sf-usr-005',
    region: 'AMER',
    is_active: true,
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
  {
    id: 'demo-usr-006',
    okta_id: 'okta-demo-006',
    email: 'david.kim@orbisai.com',
    full_name: 'David Kim',
    role: 'leader',
    salesforce_user_id: 'sf-usr-006',
    region: 'EMEA',
    is_active: true,
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
  {
    id: 'demo-usr-007',
    okta_id: 'okta-demo-007',
    email: 'priya.nair@orbisai.com',
    full_name: 'Priya Nair',
    role: 'leader',
    salesforce_user_id: 'sf-usr-007',
    region: 'APAC',
    is_active: true,
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },

  // ── West AEs ──────────────────────────────────────────────────────────────
  {
    id: 'demo-usr-008',
    okta_id: 'okta-demo-008',
    email: 'ashley.park@orbisai.com',
    full_name: 'Ashley Park',
    role: 'enterprise_ae',
    salesforce_user_id: 'sf-usr-008',
    region: 'AMER',
    is_active: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  },
  {
    id: 'demo-usr-009',
    okta_id: 'okta-demo-009',
    email: 'ryan.patel@orbisai.com',
    full_name: 'Ryan Patel',
    role: 'enterprise_ae',
    salesforce_user_id: 'sf-usr-009',
    region: 'AMER',
    is_active: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  },
  {
    id: 'demo-usr-010',
    okta_id: 'okta-demo-010',
    email: 'jennifer.liu@orbisai.com',
    full_name: 'Jennifer Liu',
    role: 'commercial_ae',
    salesforce_user_id: 'sf-usr-010',
    region: 'AMER',
    is_active: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  },

  // ── East AEs ──────────────────────────────────────────────────────────────
  {
    id: 'demo-usr-011',
    okta_id: 'okta-demo-011',
    email: 'marcus.johnson@orbisai.com',
    full_name: 'Marcus Johnson',
    role: 'enterprise_ae',
    salesforce_user_id: 'sf-usr-011',
    region: 'AMER',
    is_active: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  },
  {
    id: 'demo-usr-012',
    okta_id: 'okta-demo-012',
    email: 'kelly.chen@orbisai.com',
    full_name: 'Kelly Chen',
    role: 'commercial_ae',
    salesforce_user_id: 'sf-usr-012',
    region: 'AMER',
    is_active: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  },

  // ── EMEA AEs ─────────────────────────────────────────────────────────────
  {
    id: 'demo-usr-013',
    okta_id: 'okta-demo-013',
    email: 'anna.schmidt@orbisai.com',
    full_name: 'Anna Schmidt',
    role: 'enterprise_ae',
    salesforce_user_id: 'sf-usr-013',
    region: 'EMEA',
    is_active: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  },
  {
    id: 'demo-usr-014',
    okta_id: 'okta-demo-014',
    email: 'carlos.mendez@orbisai.com',
    full_name: 'Carlos Mendez',
    role: 'enterprise_ae',
    salesforce_user_id: 'sf-usr-014',
    region: 'EMEA',
    is_active: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  },

  // ── APJ AEs ───────────────────────────────────────────────────────────────
  {
    id: 'demo-usr-015',
    okta_id: 'okta-demo-015',
    email: 'tom.nguyen@orbisai.com',
    full_name: 'Tom Nguyen',
    role: 'enterprise_ae',
    salesforce_user_id: 'sf-usr-015',
    region: 'APAC',
    is_active: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  },
  {
    id: 'demo-usr-016',
    okta_id: 'okta-demo-016',
    email: 'lisa.wang@orbisai.com',
    full_name: 'Lisa Wang',
    role: 'commercial_ae',
    salesforce_user_id: 'sf-usr-016',
    region: 'APAC',
    is_active: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  },

  // ── Partner Business Managers ─────────────────────────────────────────────
  {
    id: 'demo-usr-017',
    okta_id: 'okta-demo-017',
    email: 'alex.reyes@orbisai.com',
    full_name: 'Alex Reyes',
    role: 'pbm',
    salesforce_user_id: 'sf-usr-017',
    region: 'AMER',
    is_active: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  },
  {
    id: 'demo-usr-018',
    okta_id: 'okta-demo-018',
    email: 'mei.lin@orbisai.com',
    full_name: 'Mei Lin',
    role: 'pbm',
    salesforce_user_id: 'sf-usr-018',
    region: 'EMEA',
    is_active: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Org hierarchy
// Sara (001) → Mike (004), Sophie (005), David (006), Priya (007), PBMs (017, 018)
// Mike (004) → Ashley (008), Ryan (009), Jennifer (010)
// Sophie (005) → Marcus (011), Kelly (012)
// David (006) → Anna (013), Carlos (014)
// Priya (007) → Tom (015), Lisa (016)
// ---------------------------------------------------------------------------

const H_START = '2024-01-01';

function hr(id: string, userId: string, managerId: string): UserHierarchy {
  return { id, user_id: userId, manager_id: managerId, effective_from: H_START, effective_to: null };
}

export const MOCK_USER_HIERARCHY: UserHierarchy[] = [
  hr('demo-hrk-001', 'demo-usr-004', 'demo-usr-001'), // Mike → Sara
  hr('demo-hrk-002', 'demo-usr-005', 'demo-usr-001'), // Sophie → Sara
  hr('demo-hrk-003', 'demo-usr-006', 'demo-usr-001'), // David → Sara
  hr('demo-hrk-004', 'demo-usr-007', 'demo-usr-001'), // Priya → Sara
  hr('demo-hrk-005', 'demo-usr-017', 'demo-usr-001'), // Alex → Sara
  hr('demo-hrk-006', 'demo-usr-018', 'demo-usr-001'), // Mei → Sara
  hr('demo-hrk-007', 'demo-usr-008', 'demo-usr-004'), // Ashley → Mike
  hr('demo-hrk-008', 'demo-usr-009', 'demo-usr-004'), // Ryan → Mike
  hr('demo-hrk-009', 'demo-usr-010', 'demo-usr-004'), // Jennifer → Mike
  hr('demo-hrk-010', 'demo-usr-011', 'demo-usr-005'), // Marcus → Sophie
  hr('demo-hrk-011', 'demo-usr-012', 'demo-usr-005'), // Kelly → Sophie
  hr('demo-hrk-012', 'demo-usr-013', 'demo-usr-006'), // Anna → David
  hr('demo-hrk-013', 'demo-usr-014', 'demo-usr-006'), // Carlos → David
  hr('demo-hrk-014', 'demo-usr-015', 'demo-usr-007'), // Tom → Priya
  hr('demo-hrk-015', 'demo-usr-016', 'demo-usr-007'), // Lisa → Priya
];

/** Map from manager → their full transitive subtree (for RPC mock) */
export const ORG_SUBTREE_MAP: Record<string, string[]> = {
  'demo-usr-001': [ // Sara (CRO) — everyone
    'demo-usr-004', 'demo-usr-005', 'demo-usr-006', 'demo-usr-007',
    'demo-usr-008', 'demo-usr-009', 'demo-usr-010',
    'demo-usr-011', 'demo-usr-012',
    'demo-usr-013', 'demo-usr-014',
    'demo-usr-015', 'demo-usr-016',
    'demo-usr-017', 'demo-usr-018',
  ],
  'demo-usr-004': ['demo-usr-008', 'demo-usr-009', 'demo-usr-010'], // Mike → West AEs
  'demo-usr-005': ['demo-usr-011', 'demo-usr-012'],                  // Sophie → East AEs
  'demo-usr-006': ['demo-usr-013', 'demo-usr-014'],                  // David → EMEA AEs
  'demo-usr-007': ['demo-usr-015', 'demo-usr-016'],                  // Priya → APJ AEs
};
