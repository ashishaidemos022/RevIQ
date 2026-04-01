/**
 * Mock Supabase client for DEMO_MODE.
 *
 * Implements the subset of the Supabase PostgREST query builder interface
 * that this app actually uses. Returns data from the in-memory mock registry
 * instead of making any network calls.
 *
 * Supported patterns:
 *   from(table).select(cols, opts?).eq/neq/gte/lte/gt/lt/in/is/ilike/not(...)
 *     .order(...).range(...).limit(...).single().maybeSingle()
 *   from(table).insert(data).select().single()
 *   from(table).update(data).eq(...)
 *   from(table).upsert(data, opts)
 *   from(table).delete().eq(...)
 *   rpc(name, params)
 */

// Import directly from data files to avoid circular dependency with index.ts
import { MOCK_USERS, MOCK_USER_HIERARCHY, ORG_SUBTREE_MAP } from './users';
import { MOCK_ACCOUNTS } from './accounts';
import { MOCK_OPPORTUNITIES, MOCK_OPPORTUNITY_SPLITS } from './opportunities';
import { MOCK_QUOTAS } from './quotas';
import { MOCK_ACTIVITY_SUMMARIES } from './activity-summaries';
import { MOCK_USAGE_BILLING } from './usage-billing';
import { MOCK_COMMISSIONS, MOCK_COMMISSION_RATES } from './commissions';
import { MOCK_FISCAL_CONFIG, MOCK_SYNC_LOGS, MOCK_PERMISSION_OVERRIDES, MOCK_USER_PREFERENCES } from './misc';

const MOCK_REGISTRY: Record<string, Record<string, unknown>[]> = {
  users:                  MOCK_USERS as unknown as Record<string, unknown>[],
  user_hierarchy:         MOCK_USER_HIERARCHY as unknown as Record<string, unknown>[],
  accounts:               MOCK_ACCOUNTS as unknown as Record<string, unknown>[],
  opportunities:          MOCK_OPPORTUNITIES as unknown as Record<string, unknown>[],
  opportunity_splits:     MOCK_OPPORTUNITY_SPLITS as unknown as Record<string, unknown>[],
  quotas:                 MOCK_QUOTAS as unknown as Record<string, unknown>[],
  activity_daily_summary: MOCK_ACTIVITY_SUMMARIES as unknown as Record<string, unknown>[],
  usage_billing_summary:  MOCK_USAGE_BILLING as unknown as Record<string, unknown>[],
  commissions:            MOCK_COMMISSIONS as unknown as Record<string, unknown>[],
  commission_rates:       MOCK_COMMISSION_RATES as unknown as Record<string, unknown>[],
  permission_overrides:   MOCK_PERMISSION_OVERRIDES as unknown as Record<string, unknown>[],
  user_preferences:       MOCK_USER_PREFERENCES as unknown as Record<string, unknown>[],
  fiscal_config:          MOCK_FISCAL_CONFIG as unknown as Record<string, unknown>[],
  sync_log:               MOCK_SYNC_LOGS as unknown as Record<string, unknown>[],
  rv_accounts: [
    { id: 'rv-acc-001', name: 'Nexus Partner Group',       owner_sf_id: 'sf-usr-017', region: 'AMER', partner_type: 'VAR',            partner_subtype: null,        salesforce_rv_id: 'sf-rv-001' },
    { id: 'rv-acc-002', name: 'Apex Solutions LLC',        owner_sf_id: 'sf-usr-018', region: 'EMEA', partner_type: 'SI',             partner_subtype: null,        salesforce_rv_id: 'sf-rv-002' },
    { id: 'rv-acc-003', name: 'BlueStar Technologies',     owner_sf_id: 'sf-usr-017', region: 'AMER', partner_type: 'Sub Agent',      partner_subtype: null,        salesforce_rv_id: 'sf-rv-003' },
    { id: 'rv-acc-004', name: 'Pinnacle Digital Partners', owner_sf_id: 'sf-usr-017', region: 'AMER', partner_type: 'VAR',            partner_subtype: null,        salesforce_rv_id: 'sf-rv-004' },
    { id: 'rv-acc-005', name: 'CloudBridge Consulting',    owner_sf_id: 'sf-usr-018', region: 'EMEA', partner_type: 'SI',             partner_subtype: null,        salesforce_rv_id: 'sf-rv-005' },
    { id: 'rv-acc-006', name: 'Vanguard Tech Solutions',   owner_sf_id: 'sf-usr-017', region: 'AMER', partner_type: 'Master Agent',   partner_subtype: null,        salesforce_rv_id: 'sf-rv-006' },
    { id: 'rv-acc-007', name: 'Meridian Systems Group',    owner_sf_id: 'sf-usr-018', region: 'EMEA', partner_type: 'SI',             partner_subtype: null,        salesforce_rv_id: 'sf-rv-007' },
    { id: 'rv-acc-008', name: 'TechForward Alliance',      owner_sf_id: 'sf-usr-017', region: 'AMER', partner_type: 'Sub Agent',      partner_subtype: null,        salesforce_rv_id: 'sf-rv-008' },
    { id: 'rv-acc-009', name: 'Summit Channel Partners',   owner_sf_id: 'sf-usr-017', region: 'AMER', partner_type: 'VAR',            partner_subtype: null,        salesforce_rv_id: 'sf-rv-009' },
    { id: 'rv-acc-010', name: 'EuroTech Distributors',     owner_sf_id: 'sf-usr-018', region: 'EMEA', partner_type: 'Master Agent',   partner_subtype: null,        salesforce_rv_id: 'sf-rv-010' },
    { id: 'rv-acc-011', name: 'PacificWave IT',            owner_sf_id: 'sf-usr-017', region: 'APAC', partner_type: 'VAR',            partner_subtype: null,        salesforce_rv_id: 'sf-rv-011' },
    { id: 'rv-acc-012', name: 'Horizon Integrators',       owner_sf_id: 'sf-usr-018', region: 'APAC', partner_type: 'SI',             partner_subtype: null,        salesforce_rv_id: 'sf-rv-012' },
    { id: 'rv-acc-013', name: 'RedRock Services',          owner_sf_id: 'sf-usr-017', region: 'AMER', partner_type: 'Master Agent',   partner_subtype: null,        salesforce_rv_id: 'sf-rv-013' },
    { id: 'rv-acc-014', name: 'Nordic Solutions AB',       owner_sf_id: 'sf-usr-018', region: 'EMEA', partner_type: 'VAR',            partner_subtype: null,        salesforce_rv_id: 'sf-rv-014' },
    { id: 'rv-acc-015', name: 'Atlas Consulting Group',    owner_sf_id: 'sf-usr-017', region: 'AMER', partner_type: 'SI',             partner_subtype: null,        salesforce_rv_id: 'sf-rv-015' },
    { id: 'rv-acc-016', name: 'Catalyst Channel Inc',      owner_sf_id: 'sf-usr-018', region: 'AMER', partner_type: 'Sub Agent',      partner_subtype: null,        salesforce_rv_id: 'sf-rv-016' },
    { id: 'rv-acc-017', name: 'SilverLine Partners',       owner_sf_id: 'sf-usr-017', region: 'EMEA', partner_type: 'Master Agent',   partner_subtype: null,        salesforce_rv_id: 'sf-rv-017' },
    { id: 'rv-acc-018', name: 'Orion Digital Services',    owner_sf_id: 'sf-usr-018', region: 'APAC', partner_type: 'SI',             partner_subtype: null,        salesforce_rv_id: 'sf-rv-018' },
    { id: 'rv-acc-019', name: 'CrestView Technology',      owner_sf_id: 'sf-usr-017', region: 'AMER', partner_type: 'VAR',            partner_subtype: null,        salesforce_rv_id: 'sf-rv-019' },
    { id: 'rv-acc-020', name: 'GlobalEdge Solutions',      owner_sf_id: 'sf-usr-018', region: 'EMEA', partner_type: 'SI',             partner_subtype: null,        salesforce_rv_id: 'sf-rv-020' },
    // GSI Partners
    { id: 'rv-acc-021', name: 'Accenture',                 owner_sf_id: 'sf-usr-017', region: 'AMER', partner_type: 'GSI',            partner_subtype: null,        salesforce_rv_id: 'sf-rv-021' },
    { id: 'rv-acc-022', name: 'Deloitte',                  owner_sf_id: 'sf-usr-018', region: 'AMER', partner_type: 'GSI',            partner_subtype: null,        salesforce_rv_id: 'sf-rv-022' },
    { id: 'rv-acc-023', name: 'Infosys',                   owner_sf_id: 'sf-usr-017', region: 'APAC', partner_type: 'GSI',            partner_subtype: null,        salesforce_rv_id: 'sf-rv-023' },
    { id: 'rv-acc-024', name: 'Cognizant',                 owner_sf_id: 'sf-usr-018', region: 'AMER', partner_type: 'GSI',            partner_subtype: null,        salesforce_rv_id: 'sf-rv-024' },
    { id: 'rv-acc-025', name: 'Wipro',                     owner_sf_id: 'sf-usr-017', region: 'APAC', partner_type: 'GSI',            partner_subtype: null,        salesforce_rv_id: 'sf-rv-025' },
    { id: 'rv-acc-026', name: 'TCS',                       owner_sf_id: 'sf-usr-018', region: 'APAC', partner_type: 'GSI',            partner_subtype: null,        salesforce_rv_id: 'sf-rv-026' },
    { id: 'rv-acc-027', name: 'HCL',                       owner_sf_id: 'sf-usr-017', region: 'EMEA', partner_type: 'GSI',            partner_subtype: null,        salesforce_rv_id: 'sf-rv-027' },
  ],
  sf_partners: [
    { id: 'sf-part-001', salesforce_opportunity_id: 'sf-opp-005', channel_owner_sf_id: 'sf-usr-018', name: 'Apex Solutions LLC' },
    { id: 'sf-part-002', salesforce_opportunity_id: 'sf-opp-039', channel_owner_sf_id: 'sf-usr-017', name: 'Nexus Partner Group' },
    { id: 'sf-part-003', salesforce_opportunity_id: 'sf-opp-040', channel_owner_sf_id: 'sf-usr-018', name: 'Apex Solutions LLC' },
  ],
  auth_log:               [],
  view_as_log:            [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Traverse a dot-separated path like "opportunities.is_closed_won" */
function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && acc !== undefined && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function compareDates(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime();
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') {
    // ISO date strings sort correctly as plain strings too
    return a.localeCompare(b);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Join resolution helpers
// ---------------------------------------------------------------------------

/**
 * Parse PostgREST select strings and resolve join relations from the mock registry.
 *
 * Handles patterns like:
 *   accounts(id, name, industry, region)
 *   users!opportunities_owner_user_id_fkey(id, full_name, email)
 *   auto_dealers(name)
 *
 * Heuristics for FK column name:
 *   1. If the join has a "!" hint (e.g. `users!opportunities_owner_user_id_fkey`),
 *      extract the FK column from the hint (owner_user_id).
 *   2. Otherwise try <table_singular>_id  (e.g. accounts → account_id).
 *   3. Then try <table>_id (verbatim, e.g. dealer_id for dealers).
 */
function parseJoins(selectStr: string): Array<{ alias: string; table: string; fkCol: string }> {
  const joins: Array<{ alias: string; table: string; fkCol: string }> = [];
  // Match: identifier + optional !hint + (fields)
  const pattern = /(\w+)(?:!(\w+))?\s*\([^)]+\)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(selectStr)) !== null) {
    const tableRaw = m[1];   // e.g. "accounts" or "users"
    const hint     = m[2];   // e.g. "opportunities_owner_user_id_fkey" (may be undefined)

    // Derive FK column
    let fkCol: string;
    // !inner and !left are PostgREST join-type modifiers, NOT FK hints — ignore them
    const isJoinModifier = hint === 'inner' || hint === 'left';
    if (hint && !isJoinModifier) {
      // hint is like "opportunities_owner_user_id_fkey" — the FK col is the part between
      // the source table prefix and "_fkey" suffix.
      // Simplest: strip leading "<srcTable>_" if possible, strip trailing "_fkey"
      const withoutFkey = hint.replace(/_fkey$/, '');
      // Remove a leading table-name prefix if present (e.g. "opportunities_owner_user_id" → "owner_user_id")
      const parts = withoutFkey.split('_');
      // Walk from the right to find a plausible 2-3 token FK like "owner_user_id"
      // Strategy: just use everything after the first word (the source table name)
      fkCol = parts.slice(1).join('_');
    } else {
      // No hint — guess: <table singular>_id or <table>_id
      const singular = tableRaw.endsWith('s') ? tableRaw.slice(0, -1) : tableRaw;
      fkCol = `${singular}_id`;
    }

    joins.push({ alias: tableRaw, table: tableRaw, fkCol });
  }
  return joins;
}

function resolveJoins(
  rows: Record<string, unknown>[],
  selectStr: string,
  registry: Record<string, Record<string, unknown>[]>
): Record<string, unknown>[] {
  if (selectStr === '*' || !selectStr.includes('(')) return rows;

  const joins = parseJoins(selectStr);
  if (joins.length === 0) return rows;

  return rows.map(row => {
    const enriched = { ...row };
    for (const join of joins) {
      // If the row already has pre-joined data for this alias, preserve it
      if (row[join.alias] !== undefined && row[join.alias] !== null) continue;

      const relatedTable = registry[join.table] ?? [];
      // Try primary FK column, then common alternatives (owner_<singular>_id, <table>_id)
      const singular = join.table.endsWith('s') ? join.table.slice(0, -1) : join.table;
      const candidates = [join.fkCol, `owner_${singular}_id`, `${join.table}_id`];
      let match: Record<string, unknown> | null = null;
      for (const col of candidates) {
        const refId = row[col];
        if (refId !== undefined && refId !== null) {
          match = relatedTable.find(r => r['id'] === refId) ?? null;
          if (match) break;
        }
      }
      enriched[join.alias] = match;
    }
    return enriched;
  });
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type Filter = (row: Record<string, unknown>) => boolean;

// ---------------------------------------------------------------------------
// MockQueryBuilder
// ---------------------------------------------------------------------------

class MockQueryBuilder {
  private readonly _data: Record<string, unknown>[];
  private readonly _registry: Record<string, Record<string, unknown>[]>;
  private _filters: Filter[] = [];
  private _orderColumn: string | null = null;
  private _orderAsc = true;
  private _rangeFrom: number | null = null;
  private _rangeTo: number | null = null;
  private _limitVal: number | null = null;
  private _isSingle = false;
  private _isMaybeSingle = false;
  private _isCount = false;
  private _selectCols = '*';

  // Mutation state
  private _mutationType: 'none' | 'insert' | 'update' | 'upsert' | 'delete' = 'none';
  private _mutationPayload: unknown = null;
  private _needsSelect = false; // .insert({}).select() pattern

  constructor(data: Record<string, unknown>[], registry: Record<string, Record<string, unknown>[]>) {
    this._data = data;
    this._registry = registry;
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  select(cols = '*', opts?: { count?: string; head?: boolean }): this {
    this._selectCols = cols;
    if (opts?.count) this._isCount = true;
    return this;
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  eq(col: string, val: unknown): this {
    this._filters.push(row => getNestedValue(row, col) === val);
    return this;
  }

  neq(col: string, val: unknown): this {
    this._filters.push(row => getNestedValue(row, col) !== val);
    return this;
  }

  gte(col: string, val: unknown): this {
    this._filters.push(row => {
      const v = getNestedValue(row, col);
      if (typeof v === 'string' && typeof val === 'string') return v >= val;
      if (typeof v === 'number' && typeof val === 'number') return v >= val;
      return false;
    });
    return this;
  }

  lte(col: string, val: unknown): this {
    this._filters.push(row => {
      const v = getNestedValue(row, col);
      if (typeof v === 'string' && typeof val === 'string') return v <= val;
      if (typeof v === 'number' && typeof val === 'number') return v <= val;
      return false;
    });
    return this;
  }

  gt(col: string, val: unknown): this {
    this._filters.push(row => {
      const v = getNestedValue(row, col);
      if (typeof v === 'number' && typeof val === 'number') return v > val;
      return false;
    });
    return this;
  }

  lt(col: string, val: unknown): this {
    this._filters.push(row => {
      const v = getNestedValue(row, col);
      if (typeof v === 'number' && typeof val === 'number') return v < val;
      return false;
    });
    return this;
  }

  in(col: string, vals: unknown[]): this {
    this._filters.push(row => vals.includes(getNestedValue(row, col)));
    return this;
  }

  is(col: string, val: unknown): this {
    this._filters.push(row => {
      const v = getNestedValue(row, col);
      if (val === null) return v === null || v === undefined;
      return v === val;
    });
    return this;
  }

  not(col: string, op: string, val: unknown): this {
    if (op === 'is') {
      this._filters.push(row => {
        const v = getNestedValue(row, col);
        if (val === null) return v !== null && v !== undefined;
        return v !== val;
      });
    } else if (op === 'in') {
      const vals = val as unknown[];
      this._filters.push(row => !vals.includes(getNestedValue(row, col)));
    }
    return this;
  }

  or(filterStr: string): this {
    // Parse simple patterns like "col.not.is.null,col2.not.is.null" or "col.eq.value"
    const conditions = filterStr.split(',').map(s => s.trim());
    this._filters.push(row => {
      return conditions.some(cond => {
        const parts = cond.split('.');
        const col = parts[0];
        const op = parts.slice(1).join('.');
        const val = getNestedValue(row, col);
        if (op === 'not.is.null') return val !== null && val !== undefined;
        if (op === 'is.null') return val === null || val === undefined;
        return true;
      });
    });
    return this;
  }

  ilike(col: string, pattern: string): this {
    const regex = new RegExp(pattern.replace(/%/g, '.*'), 'i');
    this._filters.push(row => {
      const v = getNestedValue(row, col);
      return typeof v === 'string' && regex.test(v);
    });
    return this;
  }

  // ── Ordering & pagination ─────────────────────────────────────────────────

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this._orderColumn = col;
    this._orderAsc = opts?.ascending !== false;
    return this;
  }

  range(from: number, to: number): this {
    this._rangeFrom = from;
    this._rangeTo = to;
    return this;
  }

  limit(n: number): this {
    this._limitVal = n;
    return this;
  }

  // ── Cardinality ───────────────────────────────────────────────────────────

  single(): this {
    this._isSingle = true;
    return this;
  }

  maybeSingle(): this {
    this._isMaybeSingle = true;
    return this;
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  insert(payload: unknown): this {
    this._mutationType = 'insert';
    this._mutationPayload = payload;
    return this;
  }

  update(payload: unknown): this {
    this._mutationType = 'update';
    this._mutationPayload = payload;
    return this;
  }

  upsert(payload: unknown, _opts?: unknown): this {
    this._mutationType = 'upsert';
    this._mutationPayload = payload;
    return this;
  }

  delete(): this {
    this._mutationType = 'delete';
    return this;
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  private _execute(): { data: unknown; error: unknown; count?: number } {
    // Mutations — return the inserted row on insert+select+single, otherwise null
    if (this._mutationType === 'insert') {
      const items = Array.isArray(this._mutationPayload)
        ? this._mutationPayload
        : [this._mutationPayload];
      const rows = (items as Record<string, unknown>[]).map(item => ({
        id: `demo-gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        created_at: new Date().toISOString(),
        ...item,
      }));
      if (this._isSingle || this._isMaybeSingle) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    if (this._mutationType === 'update' || this._mutationType === 'delete' || this._mutationType === 'upsert') {
      return { data: null, error: null };
    }

    // Read — apply filters
    let results = this._data.filter(row =>
      this._filters.every(f => f(row))
    );

    // Order
    if (this._orderColumn) {
      const col = this._orderColumn;
      const asc = this._orderAsc;
      results = [...results].sort((a, b) => {
        const av = getNestedValue(a, col);
        const bv = getNestedValue(b, col);
        const cmp = compareValues(av, bv);
        return asc ? cmp : -cmp;
      });
    }

    const count = results.length;

    // Pagination
    if (this._rangeFrom !== null && this._rangeTo !== null) {
      results = results.slice(this._rangeFrom, this._rangeTo + 1);
    } else if (this._limitVal !== null) {
      results = results.slice(0, this._limitVal);
    }

    // Resolve joins (e.g. accounts(id, name), users!fk(id, full_name))
    results = resolveJoins(results, this._selectCols, this._registry);

    if (this._isMaybeSingle) {
      return { data: results[0] ?? null, error: null };
    }
    if (this._isSingle) {
      if (results.length === 0) {
        return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
      }
      return { data: results[0], error: null };
    }

    if (this._isCount) {
      return { data: results, error: null, count };
    }

    return { data: results, error: null };
  }

  // Make thenable so `await builder` works
  then<T>(
    resolve: (val: { data: unknown; error: unknown; count?: number }) => T,
    reject: (err: unknown) => T
  ): Promise<T> {
    return Promise.resolve(this._execute()).then(resolve, reject);
  }
}

// ---------------------------------------------------------------------------
// RPC mock
// ---------------------------------------------------------------------------

function mockRpc(
  name: string,
  params: Record<string, unknown>
): Promise<{ data: unknown; error: null }> {
  if (name === 'get_org_subtree') {
    const rootUserId = params.root_user_id as string;
    const subtree = ORG_SUBTREE_MAP[rootUserId] ?? [];
    const data = subtree.map(userId => ({ user_id: userId }));
    return Promise.resolve({ data, error: null });
  }

  // Unknown RPC — return empty
  return Promise.resolve({ data: [], error: null });
}

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

export function createMockSupabaseClient() {
  return {
    from(table: string): MockQueryBuilder {
      const registry = MOCK_REGISTRY;
      const data = ((registry as Record<string, Record<string, unknown>[]>)[table] ?? []) as Record<string, unknown>[];
      return new MockQueryBuilder(data, registry as Record<string, Record<string, unknown>[]>);
    },

    rpc(name: string, params: Record<string, unknown> = {}) {
      return mockRpc(name, params);
    },

    // Storage stub — not used in app but present on real client
    storage: {
      from: () => ({ upload: async () => ({ data: null, error: null }) }),
    },
  };
}

export type MockSupabaseClient = ReturnType<typeof createMockSupabaseClient>;
