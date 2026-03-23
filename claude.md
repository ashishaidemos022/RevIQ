# TD RevenueIQ — Product Specification (`claude.md`)

> **Version:** 1.1 — Quota/Commission/Looker/Pilot field clarifications  
> **Last Updated:** 2026-03-10  
> **Status:** Ready for Implementation  
> **Prepared for:** Engineering, Product, RevOps

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Audience & Role Definitions](#2-audience--role-definitions)
3. [Tech Stack & Integrations](#3-tech-stack--integrations)
4. [Fiscal Year Configuration](#4-fiscal-year-configuration)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Data Architecture](#6-data-architecture)
7. [Salesforce Integration](#7-salesforce-integration)
8. [Looker Integration](#8-looker-integration)
9. [Commission Calculation Engine](#9-commission-calculation-engine)
10. [Application Structure & Navigation](#10-application-structure--navigation)
11. [Dashboards — Detailed Specs](#11-dashboards--detailed-specs)
12. [Leaderboards](#12-leaderboards)
13. [Usage Tab](#13-usage-tab)
14. [UI/UX Requirements](#14-uiux-requirements)
15. [Data Sync & Freshness](#15-data-sync--freshness)
16. [Phase 2 Roadmap & Schema Stubs](#16-phase-2-roadmap--schema-stubs)
17. [Non-Functional Requirements](#17-non-functional-requirements)
18. [Open Questions & Decisions Log](#18-open-questions--decisions-log)

---

## 1. Product Overview

**TD RevenueIQ** is an internal enterprise sales performance platform that consolidates opportunity, pipeline, activity, paid pilot, commission, and product usage data into a single centralized application. It is the system of record for sales performance visibility across the entire revenue organization.

### Core Value Propositions
- Single pane of glass for AE performance, pipeline health, and commission earned
- Multi-quarter rolling view aligned to TD's fiscal year (starts February)
- Real-time leaderboards across Revenue, Pipeline, Paid Pilots, and Activities
- Manager and executive views with full org-tree rollup
- Commission calculation natively using Looker product usage data
- Modern, responsive UI comparable to Xactly and SPIFF

### Phase Summary
| Phase | Scope |
|-------|-------|
| **v1 (this spec)** | Core dashboards, AE/Manager views, 4-quarter view, leaderboards, commission calc, Looker usage tab, Okta SSO, Salesforce sync, Supabase backend |
| **v2** | Notifications & alerts, export/reporting, scheduled email digests, dispute/correction workflow |
| **v3** | Partner portal, partner attribution, deal registration |

---

## 2. Audience & Role Definitions

### Role Hierarchy

```
C-Level (full company visibility + read/write quotas & commission rates)
RevOps Read/Write — revops_rw (full company visibility + read/write)
RevOps Read-Only — revops_ro (full company visibility, no writes)
    └── CRO (full company visibility + read-only quotas & commission rates)
        └── SVP / VP (full regional org tree, no quota/commission access)
              └── AVP (their group/pod org subtree — between VP and Manager)
                    └── Sales Manager / Line Manager (direct reports + their reports)
                          └── Account Executive (own data only)
```

> Note: RevOps and Enterprise App Group roles sit outside the reporting hierarchy — they are not part of the AE → Manager → AVP → VP → CRO org tree. Their access is granted by role, not org position.
> Note: The AVP layer is optional — the hierarchy engine is depth-agnostic and resolves the org tree recursively regardless of how many layers exist. AVP users are provisioned via Okta SCIM like any other role; no schema or code changes are required when the layer is introduced.

### Role Definitions & Data Access

| Role | Display Name | Data Scope | Can Edit Quotas | Can Edit Commission Rates |
|------|-------------|------------|-----------------|--------------------------|
| `ae` | Account Executive | Own opportunities, activities, commissions only | No | No |
| `manager` | Sales Manager | All AEs in their direct + transitive reporting tree | No | No |
| `avp` | Area VP | All managers and AEs within their group/pod subtree (broader than manager, narrower than VP) | No | No |
| `vp` | VP / SVP | All managers, AVPs, and AEs within their full regional org subtree | No | No |
| `cro` | CRO | Full company — all regions, all AEs | Read-only | Read-only |
| `c_level` | C-Level | Full company — same as CRO | Yes (company-wide) | Yes |
| `revops_ro` | RevOps (Read-Only) | Full company — read-only, no data modifications | No | No |
| `revops_rw` | RevOps (Read/Write) | Full company — full read + write access to quotas, commission rates, and sync | Yes (company-wide) | Yes |
| `enterprise_ro` | Enterprise App Group | Full company — read-only access to all dashboards and data, no exceptions | No | No |

### Access Control Rules
Access control is enforced **exclusively at the Next.js API layer**. Supabase has no awareness of the end user — it executes queries issued by the Next.js backend using the service role key. Every API route is responsible for scoping queries to the authenticated user's role and org position before hitting Supabase.

- Every API route reads the user's role and `user_id` from the validated Okta session
- Queries are filtered in Next.js before execution — e.g., opportunities are scoped to `WHERE owner_user_id IN (org subtree of current user)`
- Managers see their **full transitive org tree** (direct reports + their reports recursively), resolved via the `user_hierarchy` table
- VPs see their region only — not other VPs' regions
- CRO, C-Level, `revops_ro`, and `revops_rw` see all data company-wide — no hierarchy filter applied
- `revops_ro` — all write operations return HTTP 403 at the API route level (quota edits, commission rate changes, sync triggers, user role changes)
- `revops_rw` — full read + write access equivalent to CRO
- AEs never see other AEs' individual data, except on the Leaderboard (see Section 12)
- RevOps roles are **not** inserted into the `user_hierarchy` table — their access is granted by role, not org position
- A shared `requireRole(...roles)` middleware function must be applied to every API route to enforce this consistently

---

## 3. Tech Stack & Integrations

### Frontend
- **Framework:** React (TypeScript) with Next.js App Router
- **Styling:** Tailwind CSS
- **Component Library:** shadcn/ui
- **Charts & Visualizations:** Recharts or Tremor
- **State Management:** Zustand or React Query (TanStack Query)
- **Theme:** Light/Dark mode via CSS variables, persisted in user preferences

### Backend & Database
- **Database:** Supabase (PostgreSQL only — used purely as a managed Postgres database)
- **Supabase Project ID:** `oafnglneavvvsvvybfbv`
- **Auth:** Handled entirely in Next.js backend via **Okta SAML 2.0** — Supabase Auth is NOT used
- **SAML Library:** `@node-saml/node-saml` — validates SAML assertions server-side
- **User Provisioning:** Okta SCIM 2.0 → custom `/api/scim/v2` endpoint in Next.js → Supabase `users` table
- **Session Management:** Next.js manages sessions via signed JWT cookies using `jose` library (`src/lib/auth/session.ts`)
- **API Layer:** Next.js API routes (Supabase Edge Functions not used)
- **Database Access:** All Supabase queries run server-side using the Supabase **service role key** — never exposed to the client
- **Access Control:** Enforced exclusively at the Next.js API layer — Supabase RLS is not used
- **Component Library:** shadcn/ui built on **Base UI** (`@base-ui/react`), NOT Radix — uses `render` prop instead of `asChild` for component composition

### External Integrations
| System | Purpose | Method |
|--------|---------|--------|
| **Okta** | SSO Authentication | **SAML 2.0** (not OIDC) via `@node-saml/node-saml` |
| **Okta SCIM** | Automated user provisioning & deprovisioning | SCIM 2.0 → custom `/api/scim/v2` endpoint in Next.js |
| **Salesforce** | Accounts, Opportunities, Activities, Authorization | MCP (Model Context Protocol) |
| **Looker** | Product usage data per account | Looker API (direct, server-side) |

### Hosting
- Deployable on Vercel, AWS, or internal infrastructure
- Must support Windows, macOS, Android, iOS (responsive web — no native app required in v1)

---

## 4. Fiscal Year Configuration

> **CRITICAL:** TD's fiscal year starts on **February 1st**. All date-based calculations, quarter labels, YTD metrics, and period comparisons must use this FY definition throughout the entire application. Never use calendar year quarter logic.

### Quarter Mapping
| Quarter Label | Calendar Months |
|--------------|----------------|
| Q1 | February, March, April |
| Q2 | May, June, July |
| Q3 | August, September, October |
| Q4 | November, December, January |

### FY Label Convention
- TD uses a **forward-labeled fiscal year** — the FY label is one year ahead of the calendar year in which it starts
- FY2027 = February 1, **2026** → January 31, **2027**
- FY2028 = February 1, **2027** → January 31, **2028**
- FY2026 = February 1, **2025** → January 31, **2026**
- The **current fiscal year is FY2027**, which started February 1, 2026
- Today (March 11, 2026) is in **Q1 FY2027**
- Always label quarters as "Q1 FY2027", "Q2 FY2027", etc. — never use calendar quarter labels

### Fiscal Year Calculation Rule
```
getFiscalYear(date):
  if date.month >= 2:  return date.calendarYear + 1   // Feb–Dec: forward label
  if date.month == 1:  return date.calendarYear        // January: still in prior FY

getFiscalQuarter(date):
  month = date.month
  if month in [2, 3, 4]:   return 1   // Q1: Feb, Mar, Apr
  if month in [5, 6, 7]:   return 2   // Q2: May, Jun, Jul
  if month in [8, 9, 10]:  return 3   // Q3: Aug, Sep, Oct
  if month in [11, 12, 1]: return 4   // Q4: Nov, Dec, Jan
```

### Implementation Note
- Store a `fiscal_config` table in Supabase with `fy_start_month = 2` (February) and `fy_label_offset = 1` (forward-labeled)
- All date utility functions must use the above `getFiscalYear()` and `getFiscalQuarter()` logic — never raw calendar year/quarter
- Build these as shared utilities used **everywhere** in the codebase — no inline date math
- Never use JavaScript's native `getMonth()` or `getFullYear()` for fiscal logic without applying the offset
- Write unit tests for `getFiscalYear()` and `getFiscalQuarter()` covering: January edge case, February boundary, December, and a full FY cycle

---

## 5. Authentication & Authorization

### Architecture Overview
Supabase's native SSO and SCIM features are **not used**. Supabase serves purely as a PostgreSQL database. All authentication, session management, and user provisioning are handled at the **Next.js backend layer**, communicating with Supabase via the service role key.

```
User Browser
    │
    ▼
Okta (SAML 2.0 login / SCIM push)
    │
    ▼
Next.js Backend
  ├─ Validates SAML assertions via @node-saml/node-saml
  ├─ Manages user sessions (signed JWT cookies via jose)
  ├─ Exposes /api/scim/v2 endpoint for Okta SCIM provisioning
  └─ All Supabase queries via service role key (server-side only)
    │
    ▼
Supabase (PostgreSQL — data storage only)
```

### Authentication Flow (SAML 2.0)
1. User navigates to TD RevenueIQ → clicks "Sign in with Okta"
2. Next.js (`/api/auth/saml/login`) generates a SAML AuthnRequest and redirects to Okta
3. Okta authenticates the user and POSTs a signed SAML assertion to `/api/auth/saml/callback`
4. Next.js validates the SAML assertion using `@node-saml/node-saml` with the Okta IdP certificate
5. Okta's NameID (emailAddress format) is used as the primary user identifier
6. Next.js looks up the user: first by `okta_id`, then by `email` (to match SCIM-provisioned users whose `okta_id` is the Okta user ID, not the email)
7. If no user found, JIT provisioning creates a new user record
8. Next.js issues a signed JWT session cookie (8-hour expiry) via `jose`
9. All redirects from the SAML callback use **HTTP 303** (not 302) to force GET on redirect

> **IMPORTANT:** Okta's SAML assertion does NOT include AttributeStatements by default. The NameID (email) is the only guaranteed field. Custom attributes (role, full_name) must be configured in Okta's SAML app attribute statements, or are populated via SCIM provisioning.

### SAML Configuration
- **Config file:** `src/lib/auth/saml-config.ts`
- **SP Entity ID:** `td-revenueiq` (env: `SAML_SP_ENTITY_ID`)
- **Callback URL:** `https://revenue-iq-opal.vercel.app/api/auth/saml/callback` (env: `OKTA_SAML_CALLBACK_URL`)
- **IdP Certificate:** stored in `OKTA_SAML_CERT` env var
- **Okta Issuer:** `http://www.okta.com/exk10y26aq97Zg4eM698`

### SAML Routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/saml/login` | GET | Generates AuthnRequest, redirects to Okta |
| `/api/auth/saml/callback` | POST | Receives SAML assertion from Okta, validates, creates session |
| `/api/auth/saml/metadata` | GET | Returns SP metadata XML |

### User Provisioning via Okta SCIM
- Okta SCIM pushes user creates, updates, and deactivations to custom **`/api/scim/v2`** endpoints in Next.js
- SCIM bearer token authentication via `SCIM_BEARER_TOKEN` env var
- Role is provisioned via a **custom SCIM schema extension** (not Okta groups)
- Deprovisioned users are **soft-deleted** in Supabase (historical data preserved, `is_active = false`)

### SCIM Routes
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/scim/v2` | GET | ServiceProviderConfig (Okta connection test) |
| `/api/scim/v2/Users` | GET, POST | List/search users, create user |
| `/api/scim/v2/Users/[id]` | GET, PUT, PATCH | Get, full update, partial update individual user |

### SCIM Custom Schema Extensions
Okta sends user attributes across multiple SCIM schema namespaces:

| Namespace | Attributes |
|-----------|-----------|
| `urn:ietf:params:scim:schemas:core:2.0:User` | `userName`, `displayName`, `title`, `emails`, `addresses` (includes `country`, but NOT `region`) |
| `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User` | `department`, `employeeNumber`, `manager.value`, `manager.displayName` |
| `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager.email` | `managerEmail` (separate namespace from enterprise extension) |
| `urn:ietf:params:scim:schemas:extension:talkdesk:1.0:User` | `region` (custom — NOT from `addresses`) |
| `urn:ietf:params:scim:schemas:extension:talkdesk:1.0:User:role` | `role` (custom — one of: `ae`, `manager`, `avp`, `vp`, `cro`, `c_level`, `revops_ro`, `revops_rw`, `enterprise_ro`) |

> **CRITICAL:** Okta's manager `value` field contains a **Workday/HR system ID** (e.g., `7cc1250a952a...`), NOT the Okta user ID (`00u...`). The SCIM handler must look up managers by **email first** (`manager_email` field), then fall back to `okta_id`. Never rely solely on the manager `value` for hierarchy resolution.

**Reporting Hierarchy via Okta Manager Attribute:**
- The reporting hierarchy is constructed from the **manager email** on each Okta user profile — not from group membership
- **Every Okta-provisioned user gets a hierarchy record** regardless of their role or title
- On every SCIM user create or update, the `/api/scim/v2` endpoint reads the manager info and resolves the manager by **email lookup** against the `users` table, then writes the relationship into `user_hierarchy` as `user_id → manager_id`
- Users with no manager attribute (e.g., the CEO at the root of the tree) are written to `users` with no corresponding `user_hierarchy` row — they are the root nodes
- When a manager changes in Okta, the `user_hierarchy` table is updated automatically — the old row is end-dated (`effective_to = today`) and a new row is inserted
- On user deprovisioning, the `user_hierarchy` record is end-dated rather than deleted
- If a user is provisioned before their manager exists in Supabase, a warning is logged to `sync_log`
- Okta is the **single source of truth** for the reporting hierarchy

### Salesforce Authorization
- Salesforce is also used as a source for authorization data: territory assignments, opportunity ownership, account ownership
- On each Salesforce sync, the system reconciles opportunity ownership against the internal `user_hierarchy` table
- If a Salesforce user does not exist in RevenueIQ, log a warning and skip (do not fail the sync)

### Session & Security
- Session managed by Next.js — Supabase Auth is not used
- JWT/session expiry follows Okta session policy
- All API routes require a valid session — enforced in Next.js middleware
- All Supabase queries use the **service role key** server-side only — never exposed to the browser
- Access control (role + org hierarchy scoping) is enforced at the Next.js API layer on every request

### Development Backdoor Admin Account
A local admin account for development and debugging purposes, bypassing Okta entirely. This account must **never be accessible in production**.

#### Behavior
- Authenticates via a dedicated endpoint `/api/auth/dev-login` — completely separate from the Okta SAML flow
- Grants `revops_rw` level access — full read + write across all data, all dashboards, all settings
- Not provisioned via SCIM — exists only as a session construct, no entry in the `users` table required (or insert a seeded dev user row)
- When logged in as dev admin, display a persistent **red "DEV ADMIN" banner** across the top of every page so it is always visually obvious during development

#### Security Constraints — strictly enforced
- **Production guard:** The `/api/auth/dev-login` endpoint must return `HTTP 404` (not 403) when `NODE_ENV=production` or `ENABLE_DEV_ADMIN=false`. The route effectively does not exist in production.
- **Environment-gated activation:** The account is only active when both conditions are true:
  - `NODE_ENV=development` (or `NODE_ENV=test`)
  - `ENABLE_DEV_ADMIN=true` in environment variables
- **Password via environment variable only:** Password is set via `DEV_ADMIN_PASSWORD` in `.env.local` — never hardcoded in source code, never committed to git
- **`.env.local` in `.gitignore`:** Must be confirmed in the repository setup — this file must never be committed
- **Password generation:** Generate a strong random password on first project setup (e.g., using `openssl rand -base64 32`). Document this in the project `README.md` under "Local Development Setup"
- **No password reset UI:** The dev admin password can only be changed by updating `DEV_ADMIN_PASSWORD` in `.env.local` — there is no in-app reset flow
- **Session expiry:** Dev admin sessions expire after 8 hours — no persistent sessions

#### Implementation Notes
```
/api/auth/dev-login (POST)
  1. Check NODE_ENV !== 'production' AND ENABLE_DEV_ADMIN === 'true'
     → If either fails: return 404 immediately
  2. Compare request password against DEV_ADMIN_PASSWORD env var (bcrypt or timing-safe compare)
     → If mismatch: return 401
  3. Issue a signed session cookie with role = 'revops_rw', user_id = 'dev-admin'
  4. Return 200 + redirect to Home dashboard
```

#### Local Development Setup (add to project README.md)
```bash
# 1. Generate a random password
openssl rand -base64 32

# 2. Add to .env.local (never commit this file)
ENABLE_DEV_ADMIN=true
DEV_ADMIN_PASSWORD=<paste generated password here>

# 3. Confirm .env.local is in .gitignore
echo ".env.local" >> .gitignore
```

> **⚠️ Critical:** Any code review or PR that touches `/api/auth/dev-login` must require explicit approval from a senior engineer. Add a `CODEOWNERS` rule for this file.

---

## 6. Data Architecture

### Core Tables (Supabase / PostgreSQL)

#### `users`
```sql
id                    uuid PRIMARY KEY
okta_id               text UNIQUE NOT NULL
email                 text UNIQUE NOT NULL
full_name             text NOT NULL
role                  text NOT NULL  -- ae | manager | avp | vp | cro | c_level | revops_ro | revops_rw | enterprise_ro
salesforce_user_id    text           -- SF User ID for mapping
region                text           -- from custom SCIM extension (urn:...talkdesk:1.0:User), NOT from addresses
department            text           -- from enterprise SCIM extension
title                 text           -- from core SCIM schema
country_code          text           -- from addresses[0].country
manager_email         text           -- from custom SCIM extension (urn:...enterprise:2.0:User:manager.email)
manager_display_name  text           -- from enterprise SCIM extension manager.displayName
is_active             boolean DEFAULT true
created_at            timestamptz DEFAULT now()
updated_at            timestamptz DEFAULT now()
```

#### `user_hierarchy`
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES users(id)
manager_id      uuid REFERENCES users(id)
effective_from  date NOT NULL
effective_to    date           -- null = currently active
```
> Used by Next.js API routes to resolve each user's full org subtree for query scoping. Index on `manager_id` and `user_id`.

#### `quotas`
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES users(id)
fiscal_year     integer NOT NULL   -- e.g., 2027 (forward-labeled; FY2027 = Feb 2026 – Jan 2027)
fiscal_quarter  integer            -- 1-4, NULL = annual quota
quota_amount    numeric(18,2) NOT NULL
quota_type      text NOT NULL      -- revenue | pilots | pipeline | activities
entered_by      uuid REFERENCES users(id)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

#### `accounts`
```sql
id                    uuid PRIMARY KEY
salesforce_account_id text UNIQUE NOT NULL
name                  text NOT NULL
industry              text
region                text
owner_user_id         uuid REFERENCES users(id)
last_synced_at        timestamptz
created_at            timestamptz DEFAULT now()
```

#### `opportunities`
```sql
id                        uuid PRIMARY KEY
salesforce_opportunity_id text UNIQUE NOT NULL
account_id                uuid REFERENCES accounts(id)
owner_user_id             uuid REFERENCES users(id)
name                      text NOT NULL
stage                     text NOT NULL
amount                    numeric(18,2)
acv                       numeric(18,2)
close_date                date
is_closed_won             boolean DEFAULT false
is_closed_lost            boolean DEFAULT false
is_paid_pilot             boolean DEFAULT false   -- true when Salesforce Pilot_Type__c = 'Paid Pilot'
pilot_type                text                    -- raw value of Pilot_Type__c from Salesforce
paid_pilot_start_date     date
paid_pilot_end_date       date
forecast_category         text                   -- commit | best_case | pipeline | omitted
probability               integer                -- 0-100
type                      text                   -- new_business | renewal | expansion
last_stage_changed_at     timestamptz
-- Phase 3 stub: always NULL in v1, DO NOT REMOVE
partner_id                uuid REFERENCES partners(id) NULL
last_synced_at            timestamptz
created_at                timestamptz DEFAULT now()
updated_at                timestamptz DEFAULT now()
```

#### `activities`
```sql
id                     uuid PRIMARY KEY
salesforce_activity_id text UNIQUE NOT NULL
opportunity_id         uuid REFERENCES opportunities(id)
account_id             uuid REFERENCES accounts(id)
owner_user_id          uuid REFERENCES users(id)
activity_type          text NOT NULL   -- call | email | meeting | demo | other
activity_date          date NOT NULL
subject                text
description            text
last_synced_at         timestamptz
created_at             timestamptz DEFAULT now()
```

#### `commission_rates`
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES users(id)   -- NULL = applies to all AEs (default rate)
fiscal_year     integer NOT NULL
fiscal_quarter  integer                     -- NULL = applies to full fiscal year
deal_type       text                        -- NULL = applies to all deal types
rate            numeric(6,4) NOT NULL       -- e.g., 0.08 = 8%
entered_by      uuid REFERENCES users(id)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```
> Rate lookup precedence (most specific wins): AE + Quarter + Deal Type → AE + Quarter → AE + Year → Global default.


```sql
id              uuid PRIMARY KEY
account_id      uuid REFERENCES accounts(id)
opportunity_id  uuid REFERENCES opportunities(id) NULL
metric_date     date NOT NULL
product_type    text NOT NULL     -- e.g., 'Navigator', 'Autopilot' — matches Looker product dimension
interaction_count integer NOT NULL DEFAULT 0   -- number of interactions for this product in this period
looker_query_id text
fetched_at      timestamptz DEFAULT now()
```

#### `commissions`
```sql
id                  uuid PRIMARY KEY
user_id             uuid REFERENCES users(id)
opportunity_id      uuid REFERENCES opportunities(id)
fiscal_year         integer NOT NULL
fiscal_quarter      integer NOT NULL
base_amount         numeric(18,2)   -- from opportunity ACV
usage_multiplier    numeric(6,4)    -- derived from Looker usage data
commission_rate     numeric(6,4)    -- e.g., 0.08 for 8%
commission_amount   numeric(18,2)   -- calculated: acv × rate × usage_multiplier
calculation_date    timestamptz
is_finalized        boolean DEFAULT false
notes               text
created_at          timestamptz DEFAULT now()
```

#### `sync_log`
```sql
id              uuid PRIMARY KEY
sync_type       text NOT NULL    -- salesforce | looker | scim
triggered_by    uuid REFERENCES users(id) NULL  -- NULL for SCIM (Okta-initiated)
target_user_id  uuid REFERENCES users(id) NULL  -- populated for SCIM events (which user was synced)
started_at      timestamptz
completed_at    timestamptz
status          text             -- running | success | partial | failed | warning
records_synced  integer
error_message   text
raw_payload     jsonb NULL       -- stores raw SCIM payload for debugging (scim sync_type only)
```

#### `fiscal_config`
```sql
id              uuid PRIMARY KEY
fy_start_month  integer DEFAULT 2   -- February
fy_start_day    integer DEFAULT 1
updated_by      uuid REFERENCES users(id)
updated_at      timestamptz
```

#### `user_preferences`
```sql
user_id     uuid PRIMARY KEY REFERENCES users(id)
theme       text DEFAULT 'light'    -- light | dark
updated_at  timestamptz
```

#### `permission_overrides`
```sql
id                  uuid PRIMARY KEY
user_id             uuid REFERENCES users(id)        -- the IC/specialist receiving elevated access
granted_by          uuid REFERENCES users(id)        -- RevOps RW or CRO/C-Level who granted it
effective_role      text NOT NULL                    -- manager | vp | cro | c_level (role whose data scope is granted)
allow_writes        boolean DEFAULT false            -- false = read-only; true = inherits write permissions of effective_role
notes               text                             -- reason for grant (e.g., "Strategic overlay for Q1 FY2027")
is_active           boolean DEFAULT true
created_at          timestamptz DEFAULT now()
revoked_at          timestamptz NULL                 -- set when manually revoked, NULL = still active
revoked_by          uuid REFERENCES users(id) NULL
```
> Overrides are **permanent until manually revoked** — no expiry date. When revoked, `is_active` is set to false and `revoked_at` / `revoked_by` are recorded for audit purposes. A user may have at most one active override at a time.

---

### Phase 3 Schema Stubs

> **Developer Note:** Create these tables in the initial database migration. All partner-related fields will be NULL in v1. Do NOT remove them. Phase 3 will activate partner relationships. This eliminates migration risk when the partner portal is built.

#### `partners`
```sql
id              uuid PRIMARY KEY
name            text NOT NULL
partner_tier    text         -- gold | silver | bronze
is_active       boolean DEFAULT true
created_at      timestamptz DEFAULT now()
```

#### `opportunity_partners` *(supports up to 4 partners per opportunity)*
```sql
id                  uuid PRIMARY KEY
opportunity_id      uuid REFERENCES opportunities(id)
partner_id          uuid REFERENCES partners(id)
attribution_type    text         -- sourced | influenced | referred | fulfilled | resold
attribution_weight  numeric(5,2) -- percentage; all partners on one opp must sum to 100
created_at          timestamptz DEFAULT now()
```
> Maximum 4 partners per opportunity enforced at the application layer. Attribution weights across all partners on a given opportunity must sum to 100%.

---

## 7. Salesforce Integration

### Connection Method
- Use **Salesforce MCP (Model Context Protocol)** for querying Accounts and Opportunities
- Salesforce is also the source for authorization data (opportunity ownership, user roles)
- Authenticate via a dedicated Salesforce Connected App with OAuth 2.0

### Objects to Sync

| SF Object | Fields to Sync | Destination Table |
|-----------|---------------|-------------------|
| `Account` | Id, Name, Industry, OwnerId, Region__c | `accounts` |
| `Opportunity` | Id, Name, AccountId, OwnerId, StageName, Amount, ACV__c, CloseDate, IsClosed, IsWon, Pilot_Type__c, Pilot_Start_Date__c, Pilot_End_Date__c, ForecastCategory, Probability, Type, LastStageChangeDate | `opportunities` |
| `Task` / `Event` | Id, WhoId, WhatId, OwnerId, Type, ActivityDate, Subject, Description | `activities` |
| `User` | Id, Email, Name, UserRoleId | used for `users` mapping |

> **Confirmed:** Salesforce uses a `Pilot_Type__c` text field on the Opportunity. An opportunity is a Paid Pilot when `Pilot_Type__c = 'Paid Pilot'`. Sync this field and apply the filter at ingest time to set `is_paid_pilot = true`.

### Sync Behavior
- **Trigger:** Manual — user clicks "Sync Now" button (available to Manager+ roles)
- **Scope:** Full sync of all active records on each trigger (delta sync is a v2 enhancement)
- **Conflict Resolution:** Salesforce is the source of truth — always overwrite local records
- **Last Synced Timestamp:** Displayed prominently in the global header at all times
- **Error Handling:** If sync partially fails, log to `sync_log`, display warning banner, do not roll back successful records
- **Progress Indicator:** Show spinner + "Syncing…" in header during sync; toast notification on completion

### Salesforce Field Mapping Notes
- Map Salesforce `OwnerId` → `users.salesforce_user_id` to resolve opportunity ownership
- `Pilot_Type__c` is a text field on the Opportunity. Set `opportunities.is_paid_pilot = true` when `Pilot_Type__c = 'Paid Pilot'` (exact string match, case-sensitive)
- When `is_paid_pilot = true`, also sync `Pilot_Start_Date__c` → `paid_pilot_start_date` and `Pilot_End_Date__c` → `paid_pilot_end_date`
- `LastStageChangeDate` maps to `opportunities.last_stage_changed_at`

---

## 8. Looker Integration

### Connection Method
- **Looker REST API** — direct, server-side only
- Authenticate using Looker API credentials (`client_id` + `client_secret`) stored as server-side environment variables
- Never expose Looker credentials to the client browser

### Data to Pull
- Product usage metrics per **Account**, keyed by Salesforce Account ID
- Metric types: DAU, MAU, feature adoption scores, session counts, or any usage KPIs defined in Looker

> **Confirmed:** Looker usage data represents **interaction counts per product type** (e.g., Navigator, Autopilot, and other product lines). Each account will have one usage record per product type showing how many interactions were consumed in a given period.

### Usage Data Destinations

| Purpose | Where Used |
|---------|-----------|
| Commission calculation input | `usage_metrics` → commission engine |
| Account-level usage visibility | **Usage Tab** (top-level nav) |
| Opportunity-level context | Opportunity detail drawer |

### Sync Behavior
- Looker sync is triggered manually alongside Salesforce sync (same "Sync Now" button), or independently via Settings
- Store fetched metrics in `usage_metrics` with `fetched_at` timestamp
- Display a separate "Last synced (Looker)" timestamp in the global header
- If Looker API is unavailable, display cached data with a staleness warning banner

---

## 9. Commission Calculation Engine

### Overview
Commission is **calculated natively in RevenueIQ** using three inputs:
1. Opportunity ACV (from Salesforce)
2. Commission rate (manually configured per AE/period in RevenueIQ)
3. Usage multiplier (derived from Looker usage data for the associated account)

### Commission Formula
```
commission_amount = acv × commission_rate × usage_multiplier
```

### Commission Rate Configuration
- Base commission rates are **managed directly in Supabase** by C-Level / RevOps RW via the Settings → Commission Rates UI (CRO has read-only access)
- Rates can be set per: AE, fiscal year, fiscal quarter, and/or deal type
- A dedicated `commission_rates` table stores all rate configurations with full audit trail (`entered_by`, `created_at`, `updated_at`)
- Commission rates are only visible to CRO (read-only), C-Level, and RevOps RW in the Settings UI — no access for VP and below

### Usage Multiplier Logic
- Usage data from Looker provides **interaction counts per product type** (e.g., Navigator: 1,240 interactions, Autopilot: 580 interactions) for each account
- The usage multiplier is calculated as: `usage_multiplier = actual_interactions ÷ target_interactions` per product type
- Target interaction thresholds are configured per product type in Supabase (Settings → Usage Thresholds, VP+ only)
- Where an opportunity spans multiple product types, the multiplier is the weighted average across product types on that account
- Multiplier floor: **0.0** (no commission if zero interactions)
- Multiplier cap: configurable accelerator per product type (default 1.0 in v1)
- If no Looker data exists for an account: `usage_multiplier` defaults to **1.0** with a visible warning flag on the commission record

### Calculation Trigger
- Commissions are recalculated automatically on every Looker sync
- Commissions are also recalculated when an opportunity's ACV, stage, or close date changes
- `is_finalized = false` until a Manager or CRO explicitly finalizes the period
- **Finalized commissions are locked** — they cannot be recalculated or overwritten

### Commission Display
- **AEs see:** Commission Earned (finalized) + Projected Commission (current unfinalized period)
- **Managers+ see:** All AE commissions across their org tree
- Display both quarterly and YTD commission figures on relevant dashboards

---

## 10. Application Structure & Navigation

### Top-Level Navigation (Sidebar — Desktop)
```
TD RevenueIQ
├── 🏠  Home / My Dashboard          (default landing page — own data)
├── 📊  Pipeline                     (open opportunities & pipeline health)
├── 🧪  Paid Pilots                  (pilot-specific dashboard)
├── ⚡  Activities                   (activity tracking dashboard)
├── 📈  Performance                  (4-quarter rolling view)
├── 🏆  Leaderboard                  (4 boards: Revenue, Pipeline, Pilots, Activities)
├── 📡  Usage                        (Looker usage data — account & opp level)
├── 👥  Team View                    (Managers+ only)
└── ⚙️  Settings                     (Quotas, commission rates, sync, preferences, hierarchy, permission overrides)
```

### Navigation Access by Role
| Nav Item | AE | Manager | AVP | VP | CRO | C-Level | RevOps RO | RevOps RW | Enterprise RO |
|----------|:--:|:-------:|:---:|:--:|:---:|:-------:|:---------:|:---------:|:-------------:|
| Home / My Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pipeline | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Paid Pilots | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Activities | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Performance (4Q) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Leaderboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Usage | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Team View | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Settings → Quotas | ❌ | ❌ | ❌ | ❌ | ✅ (read) | ✅ | ❌ | ✅ | ❌ |
| Settings → Commission Rates | ❌ | ❌ | ❌ | ❌ | ✅ (read) | ✅ | ❌ | ✅ | ❌ |
| Settings → Sync | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Settings → Hierarchy Viewer | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Settings → Permission Overrides | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |

### Global Header (Persistent — All Pages)
- TD RevenueIQ logo + wordmark (left)
- **Last Synced:** `SF: [relative time] ago | Looker: [relative time] ago` (center or right)
- "Sync Now" button (visible to Manager+ only)
- Light/Dark theme toggle (sun/moon icon)
- Notifications bell — **rendered as disabled placeholder in v1** (Phase 2)
- User avatar → dropdown: Profile, Preferences, Logout (right)

---

## 11. Dashboards — Detailed Specs

---

### 11.1 Home / My Dashboard

Default landing page for all roles. AEs see only their own performance data. Managers see their personal data plus quick team summary links.

#### KPI Cards (top row)
| Card | Metric | Description |
|------|--------|-------------|
| ACV Closed QTD | `sum(acv) WHERE is_closed_won AND close_date IN current_fiscal_quarter` | |
| ACV Closed YTD | `sum(acv) WHERE is_closed_won AND close_date IN current_fiscal_year` | |
| Deals Closed QTD | `count(*) WHERE is_closed_won AND close_date IN current_fiscal_quarter` | |
| Commission Earned QTD | Sum of finalized `commission_amount` this fiscal quarter | |
| Commission Projected QTD | Sum of unfinalized `commission_amount` this fiscal quarter | |
| Quota Attainment % | `ACV Closed YTD ÷ Annual Quota × 100` | Shown as percentage with color indicator |

#### Charts Section
- **ACV by Month (Bar Chart):** Last 12 months, FY-aligned, closed-won ACV per fiscal month
- **Pipeline by Stage (Horizontal Bar):** Current open opportunities grouped by stage, sized by ACV
- **Quota Attainment Gauge (Radial):** % to annual quota — green ≥ 75%, amber 50–74%, red < 50%

#### Recent Opportunities Table
Columns: Account Name | Opportunity Name | Stage | ACV | Close Date | Paid Pilot | Last Activity Date
- Paginated (25 per page), sortable on all columns
- Clicking a row opens the **Opportunity Detail Panel** (slide-out drawer)

#### Opportunity Detail Panel (Slide-out Drawer)
- Full opportunity details (all fields)
- Account name + link
- Paid Pilot badge + start/end dates (if applicable)
- Looker usage metrics for this account (most recent)
- Activity history (last 10 activities on this opportunity)
- Commission attribution for this opportunity (rate, multiplier, calculated amount)

---

### 11.2 Pipeline Dashboard

Focused view of open pipeline health and deal progression.

#### Filters
- Fiscal Quarter (multi-select, defaults to current)
- Stage (multi-select)
- Deal Type (new business / renewal / expansion / all)
- Opportunity Source (Sales / Marketing / Partner / All) — derived from Salesforce `LeadSource`
- Paid Pilot (yes / no / all)
- AE (dropdown — Managers+ only; defaults to own AEs for managers, all for CRO+)

#### KPI Cards
| Card | Description |
|------|-------------|
| Total Pipeline ACV | Sum of ACV on all open opportunities (matching filters) |
| Weighted Pipeline ACV | Sum of ACV × Probability |
| Deals in Pipeline | Count of open opportunities |
| Avg Deal Size | Total Pipeline ACV ÷ Deals in Pipeline |
| Closing This Quarter | Count of open opps with close_date in current fiscal quarter |

#### Pipeline by Stage Table
Columns: Stage | # Deals | Total ACV | Weighted ACV | Avg Days in Stage
- Clicking a stage row expands inline to show individual opportunities at that stage

#### Open Opportunities Table
Same schema as Home dashboard opportunities table, filtered to open opportunities only.

---

### 11.3 Paid Pilots Dashboard

Filtered view of all opportunities where `is_paid_pilot = true`.

#### KPI Cards
| Card | Description |
|------|-------------|
| Active Pilots | Count of open paid pilot opportunities |
| Total Pilot ACV | Sum of ACV on active pilot opportunities |
| Pilot Conversion Rate | Closed-won pilots ÷ Total all-time pilots (for selected period) |
| Avg Pilot Duration | Avg days between `paid_pilot_start_date` and `close_date` (converted pilots only) |
| Expiring Within 30 Days | Count of pilots where `paid_pilot_end_date` ≤ today + 30 days AND not closed |

#### Pilots at Risk Section (Amber Alert Panel)
Displayed when any pilots have `paid_pilot_end_date` within 30 days and stage is not closed.

Columns: Account | AE | ACV | Start Date | End Date | Days Remaining | Stage
- Rows sorted by Days Remaining (ascending)
- Row background color: amber (≤ 30 days), red (≤ 7 days)

#### All Pilots Table
Columns: Account | AE | ACV | Pilot Start | Pilot End | Stage | Duration (days) | Status

Status values:
- **Active** — `is_paid_pilot = true`, not closed, end date in the future
- **Converted** — `is_paid_pilot = true`, `is_closed_won = true`
- **Expired** — `is_paid_pilot = true`, not closed, `paid_pilot_end_date` < today
- **Lost** — `is_paid_pilot = true`, `is_closed_lost = true`

---

### 11.4 Activity Dashboard

Tracks AE activity volume by type and recency.

#### Filters
- Date range (defaults to current fiscal quarter)
- Activity type (call / email / meeting / demo / all)
- AE (Managers+ only; defaults to own team)

#### KPI Cards
| Card | Description |
|------|-------------|
| Total Activities QTD | All activity records in selected period |
| Calls | Count of `activity_type = 'call'` |
| Emails | Count of `activity_type = 'email'` |
| Meetings | Count of `activity_type = 'meeting'` |
| Demos | Count of `activity_type = 'demo'` |
| Accounts Touched | Distinct accounts with ≥ 1 activity in period |

#### Activity Trend Chart
- Weekly bar chart for selected date range
- Color-coded by activity type (stacked bars)

#### Activity by AE Table *(Managers+ only)*
Columns: AE Name | Calls | Emails | Meetings | Demos | Total | Last Activity Date
- Sortable by any column
- Clicking an AE row drills into that AE's individual activity feed

#### Recent Activities Feed
Chronological list of latest 50 activities for the current user's scope.
Columns: Date | AE | Account | Type | Subject | Linked Opportunity

---

### 11.5 Performance Dashboard (4-Quarter Rolling View)

Provides a rolling 4-quarter comparison view, fully aligned to TD's fiscal year.

#### Quarter Window
- Default: current fiscal quarter + 3 trailing fiscal quarters
- Each quarter labeled as "Q1 FY2027", etc.
- Navigation arrows to shift the window back to view older quarters

#### Performance Summary Table
Rows = Metrics | Columns = Q (current) | Q–1 | Q–2 | Q–3

| Metric Row |
|-----------|
| ACV Closed |
| Deals Closed |
| Quota Attainment % |
| Active Pilots (at quarter end) |
| Pilot Conversion Rate |
| Commission Earned |
| Total Activities |

- Delta indicators (▲▼) comparing each quarter to the prior quarter

#### Trend Charts
- **ACV Closed — Bar Chart** across 4 quarters with quota line overlay
- **Activity Volume — Line Chart** across 4 quarters
- **Quota Attainment % — Line Chart** across 4 quarters

#### AE / Team Selector *(Managers+ only)*
- Dropdown: own summary / individual AE / "All Team" aggregate
- When "All Team" selected, metrics show team totals/averages

---

### 11.6 Team View *(Managers and above only)*

Allows managers to compare performance across all AEs within their org tree.

#### Team Overview KPI Cards
- Total ACV Closed (team, QTD)
- Avg Quota Attainment % (team)
- Total Active Pilots (team)
- Total Activities QTD (team)

#### AE Roster Table
Columns: AE Name | Region | ACV Closed QTD | ACV Closed YTD | Annual Quota | Attainment % | Active Pilots | Activities QTD | Commission QTD
- Sortable by any column
- Clicking an AE row opens a full AE detail page (all dashboards rendered from that AE's data perspective)
- Color-code Attainment %: green ≥ 75%, amber 50–74%, red < 50%

#### Org Tree Navigation *(VP and above)*
- Breadcrumb navigation when drilling into a sub-team (e.g., Company → Region West → Manager Smith → AE Jones)
- Toggle: "My Direct Team" / "Full Org Tree" / individual manager's sub-team

---

### 11.7 Settings — Hierarchy Viewer *(Managers and above, RevOps, Enterprise RO)*

A dedicated Settings page showing the full org reporting structure as provisioned by Okta SCIM. Contains **three tabs**: Org Tree View, Tabular View, and Debug View.

#### Tab 1: Org Tree View
- Expandable/collapsible tree starting from the root node (CRO or highest provisioned user) 
- Each node shows: name, role badge, region, direct report count
- Nodes with active permission overrides show a distinct icon indicator
- Search bar to highlight/jump to a specific user in the tree
- Managers and AVPs see their own subtree only; VP and above see full company tree

#### Tab 2: Tabular View
Flat, sortable table of all users and their position in the hierarchy.

| Column | Description |
|--------|-------------|
| Name | Full name + avatar initial |
| Email | Work email |
| Role | Current role badge (`ae`, `manager`, `avp`, `vp`, etc.) |
| Manager | Direct manager's name (linked — clicking filters table to that manager's subtree) |
| Region | Region assignment |
| Direct Reports | Count of direct reports |
| Permission Override | Badge if an active override exists — shows effective role |
| Status | Active / Inactive (soft-deleted) |

#### Tab 3: Debug View *(RevOps RW and C-Level only)*
A raw, unprocessed view of the `user_hierarchy` table records exactly as stored in Supabase — no tree resolution, no recursion. Designed exclusively for troubleshooting SCIM provisioning issues.

**Purpose:** Instantly identify provisioning errors such as:
- Missing manager relationships (orphan users with no `user_hierarchy` row)
- Duplicate active rows for the same user (`effective_to IS NULL` appearing twice)
- Stale rows that were not end-dated correctly after a manager change
- Users provisioned before their manager (unresolved hierarchy queue entries)

**Debug View Table Columns:**
| Column | Description |
|--------|-------------|
| User | Full name + email |
| User Role | Role from `users.role` |
| Manager | Manager's name + email (raw FK — shown even if manager is inactive) |
| Effective From | Date this relationship became active |
| Effective To | Date this relationship ended — `NULL` = currently active |
| Status | Active (effective_to IS NULL) / Historical / ⚠️ Orphan (no manager row found) |
| SCIM Last Updated | Timestamp of last SCIM push for this user |

**Debug View Filters:**
- Show: All / Active only / Historical only / ⚠️ Orphans only / ⚠️ Duplicates only
- Search by user name or email

**Debug View Actions** *(RevOps RW only):*
- **Flag for re-sync:** Mark a user record to be re-processed on the next SCIM sync
- **View raw SCIM payload:** Show the last raw SCIM payload received for this user (stored in `sync_log`) for comparison against what was written to `user_hierarchy`

#### Access Rules
- **Tab 1 & 2 (Org Tree + Tabular):** All Managers and above, RevOps RO, RevOps RW, Enterprise RO — scoped to own subtree for Manager/AVP, full company for VP and above
- **Tab 3 (Debug View):** RevOps RW and C-Level only — always shows full company, never scoped
- Only RevOps RW and CRO/C-Level can navigate to the Permission Overrides page from here

---

### 11.8 Settings — Permission Overrides *(RevOps RW and CRO/C-Level only)*

Allows RevOps RW and CRO/C-Level to grant high-level ICs and specialists elevated data visibility beyond what their org position would normally provide — without changing their role or reporting line in the hierarchy.

#### Concept
A permission override assigns a user an **effective role** for data access purposes only. Their actual role and manager in the hierarchy remain unchanged. This mirrors Salesforce's manual sharing and role-based visibility override model.

Examples:
- A Strategic Account Director (reporting to CRO, role = `ae`) is granted effective role of `vp` → they can now see all data within a specific VP's org
- A Sales Engineer Overlay (role = `ae`) is granted effective role of `cro` → company-wide read-only visibility
- Write access can optionally be enabled per override if the IC needs to manage quotas or commission rates

#### Active Overrides Table
Columns: User | Their Role | Effective Role Granted | Scope | Write Access | Granted By | Granted On | Notes | Actions

- **Actions:** Edit (change effective role or write toggle) | Revoke
- Revoked overrides are soft-deleted — `is_active = false`, preserved in audit log
- A user can have at most **one active override** at a time

#### Grant New Override — Form Fields
| Field | Type | Description |
|-------|------|-------------|
| User | Searchable dropdown | Select the IC/specialist to receive the override |
| Effective Role | Dropdown | `manager` \| `avp` \| `vp` \| `cro` \| `c_level` — the role whose data scope they will inherit |
| Allow Write Access | Toggle | Default OFF (read-only); enable to grant write permissions of the effective role |
| Notes | Text field | Required — reason for grant (e.g., "Strategic overlay for EMEA Q1 FY2027") |

#### Permission Resolution Logic (for engineering)
When resolving what data a user can access, the Next.js API middleware checks in this order:
```
1. Does an active permission_override exist for this user?
   YES → use effective_role + allow_writes from the override
   NO  → use the user's actual role from users.role + hierarchy from user_hierarchy
```
This means the override **fully replaces** the user's normal access scope for all data queries. The user's actual role is preserved in `users.role` and is unaffected.

#### Audit Log
All override grants, edits, and revocations are logged with:
- Who granted/changed/revoked
- Timestamp
- Before and after state (effective role, write access)
- Notes

Audit log is visible to RevOps RW and CRO/C-Level in the Permission Overrides page (last 90 days).

---

## 12. Leaderboards

**All AEs can see the full leaderboard** — all AEs ranked company-wide. Managers and above have additional filter controls (by region, team, period).

The Leaderboard section contains **4 separate boards** accessed via horizontal tabs.

---

### Board 1: Revenue Leaderboard
**Primary Ranking Metric:** ACV Closed Won (QTD, default)

Columns: Rank | AE Name | Region | ACV Closed | Deals Closed | Quota Attainment %

Period Toggle: QTD / YTD / Custom Quarter

---

### Board 2: Pipeline Leaderboard
**Primary Ranking Metric:** Total Open Pipeline ACV

Columns: Rank | AE Name | Region | Pipeline ACV | Weighted Pipeline | # Open Deals | Avg Deal Size

Period Toggle: Current Quarter / All Open

---

### Board 3: Paid Pilots Leaderboard
**Primary Ranking Metric:** Count of Active Pilots (secondary: Pilot ACV)

Columns: Rank | AE Name | Region | Active Pilots | Pilot ACV | Conversion Rate | Avg Duration (days)

Period Toggle: QTD / YTD

---

### Board 4: Activities Leaderboard
**Primary Ranking Metric:** Total Activity Count (QTD, default)

Columns: Rank | AE Name | Region | Total Activities | Calls | Emails | Meetings | Demos

Period Toggle: MTD / QTD / YTD

---

### Leaderboard UI Standards
- **Top 3 rows:** Gold (#1), Silver (#2), Bronze (#3) styling with medal icon
- **Current user's row:** Always visible and highlighted with a "You" badge — even if outside the top 10, their row is pinned at the bottom of the visible table
- **Ties:** Broken alphabetically by last name
- **Filter (Managers+):** Filter leaderboard by region or sub-team
- **Period Selector:** Displayed prominently above each board

---

## 13. Usage Tab

Dedicated top-level section surfacing Looker product usage data for all accounts and opportunities in the user's data scope.

### Account Usage Table (Default View)
Columns: Account Name | AE Owner | Linked ACV | Navigator Interactions | Autopilot Interactions | [other product types] | Usage Trend (sparkline) | Last Updated

- Product type columns are dynamic — rendered based on distinct `product_type` values in `usage_metrics`

- Sortable and searchable (by account name or AE)
- Clicking an account row opens the **Account Usage Detail Panel**

### Account Usage Detail Panel
- Account header: Name, AE owner, Industry, Region
- All linked open opportunities (with stage, ACV, close date)
- **Usage Over Time:** Line chart showing interaction counts per product type for last 12 months — one line per product type (Navigator, Autopilot, etc.)
- **Commission Multiplier:** Explicit display of the usage multiplier per product type (actual interactions ÷ target interactions), and the blended multiplier applied to the commission calculation
- **Raw Interactions Table:** All `usage_metrics` records for this account, grouped by `product_type`, sorted by `metric_date` descending

### Opportunity-Level Usage (Embedded)
On the Opportunity Detail Panel (accessible from Pipeline and Home dashboards), include a collapsible "Product Usage" section showing:
- Parent account's latest DAU, MAU, Feature Adoption Score
- Usage multiplier value
- Link to full Account Usage Detail

### Looker Sync Controls (Settings → Sync)
- "Sync Looker Usage Now" button
- Last synced timestamp for Looker data (separate from Salesforce)
- Sync status: running / success / failed

---

## 14. UI/UX Requirements

### Design Direction
Modern, data-dense enterprise dashboard — comparable in feel and density to **Xactly Incent** or **SPIFF**. Professional, clean, and functional with clear visual hierarchy. Performance data must be scannable at a glance.

### Color System
- **Primary accent:** Deep navy blue (`#1E3A5F` or similar)
- **Success / On Track:** Green
- **At Risk / Warning:** Amber / Orange
- **Behind / Alert:** Red
- **Neutral data:** Medium gray
- All status indicators pair color with an icon or text label (never color alone — accessibility requirement)

### Theme Support
- **Light Mode:** White/off-white backgrounds, dark text, navy sidebar
- **Dark Mode:** Dark charcoal (#1A1A2E or similar) backgrounds, light text, darker sidebar
- Theme stored in `user_preferences.theme` — persists across sessions and devices
- Toggle available in the global header (sun/moon icon)

### Responsive Design — Platform Targets

| Platform | Priority | Layout Approach |
|----------|----------|----------------|
| Desktop (Windows / Mac) | Primary | Full sidebar, multi-column tables, side-by-side charts |
| Tablet (landscape) | Secondary | Collapsible sidebar, simplified table columns |
| Mobile (iOS / Android) | Supported | Bottom tab nav, stacked card KPIs, single-column layout |

### Mobile-Specific Adaptations
- Replace sidebar with **bottom navigation bar**: Home, Pipeline, Leaderboard, Usage, More
- KPI cards stack vertically in a single column
- Data tables collapse to card view (3–4 most important columns only; "View Details" to expand)
- Leaderboard is horizontally scrollable
- Opportunity detail opens as full-screen modal
- Sync Now button accessible from the "More" menu

### Loading, Empty, and Error States
Every data section must implement all three states — never leave blank white space:
- **Loading:** Skeleton placeholder (same layout as loaded state)
- **Empty:** Centered illustration + descriptive message (e.g., "No opportunities found for Q1 FY2027")
- **Error:** Error message + "Retry" button

### Data Visualization Standards
| Chart Type | Used For |
|-----------|---------|
| Bar Chart | ACV by period, activity counts, pipeline by stage |
| Line Chart | Trends over time (QoQ, MoM, usage over time) |
| Radial / Gauge | Quota attainment % |
| Stacked Bar | Activity breakdown by type |
| Sparkline | Usage trend in account table |
| Horizontal Bar | Pipeline funnel by stage |

### Accessibility
- WCAG 2.1 AA compliance minimum
- All interactive elements keyboard-navigable
- ARIA labels on all charts and data tables
- Color never the sole indicator of status (always paired with icon or text)
- Minimum touch target size of 44×44px on mobile

---

## 15. Data Sync & Freshness

### Sync Architecture
- **Salesforce sync:** Manual — triggered by Manager+ via "Sync Now" in header or Settings
- **Looker sync:** Manual — same trigger as Salesforce by default; can also be triggered independently in Settings → Sync
- All syncs log to `sync_log` table

### Last Synced Display Rules
| Age | Display Style |
|-----|--------------|
| < 24 hours | Normal — "SF: 3 hours ago" |
| 24–72 hours | Amber text + warning icon |
| > 72 hours | Red text + warning icon |

Both Salesforce and Looker timestamps are shown independently in the global header.

### Sync Progress UX
1. User clicks "Sync Now"
2. Header shows spinner + "Syncing Salesforce…" label
3. On completion: success toast ("Sync complete — 1,243 records updated")
4. On partial failure: warning toast with link to Sync Log
5. On full failure: error toast with error summary

### Sync Log (Settings → Sync History)
Displays last 30 sync events.
Columns: Date/Time | Type (SF/Looker) | Triggered By | Duration | Records Synced | Status | Error Detail

---

## 16. Phase 2 Roadmap & Schema Stubs

### Phase 2: Notifications & Alerts
- In-app notification center (bell icon in header — rendered as disabled/grayed in v1)
- Alert types for v2:
  - Paid pilot expiring within 30 days
  - Quota attainment below 50% at mid-quarter
  - Opportunity stage moved backward
  - Commission calculation completed / finalized
  - Sync completed / sync failed
- Email notification option (real-time and/or weekly digest)
- Per-user notification preferences

### Phase 2: Export & Reporting
- CSV export on all table views
- PDF export for dashboard snapshots
- Scheduled weekly email digest (performance summary)
- Commission dispute / correction workflow (AE flags discrepancy → manager reviews → CRO approves correction)

### Phase 2: IC / Contributor Dashboard
For GTM/Sales ICs who are part of the sales team but not tied to individual accounts or opportunities (e.g., overlay specialists, BD leads, partner/alliances managers, GTM strategy leads, pre-sales leaders). These users have quota but it is measured at a group, region, geo, or global level rather than per-deal.

**New role to introduce in v2:** `ic` (Individual Contributor) — distinct dashboard experience from `ae`.

**Data model additions required (define tables in v1 migration as stubs, do not build UI):**

`opportunity_contributors` — tracks IC influence/contribution on opportunities:
```sql
id                  uuid PRIMARY KEY
opportunity_id      uuid REFERENCES opportunities(id)
contributor_id      uuid REFERENCES users(id)
contribution_type   text    -- influenced | supported | led_demo | technical_win | other
created_at          timestamptz DEFAULT now()
```

`quota_scopes` — defines the aggregate scope an IC's quota is measured against:
```sql
id              uuid PRIMARY KEY
scope_type      text NOT NULL   -- global | geo | region | group
scope_name      text NOT NULL   -- e.g., "EMEA", "West Region", "AI Specialist Group"
parent_scope_id uuid REFERENCES quota_scopes(id) NULL  -- for nested scopes
created_at      timestamptz DEFAULT now()
```

Extend `quotas` table with:
```sql
quota_scope_type  text NULL   -- global | geo | region | group | individual (NULL = individual/AE default)
quota_scope_id    uuid REFERENCES quota_scopes(id) NULL
```

**v2 IC Dashboard will include:**
- Quota attainment at their assigned scope level (group/region/geo/global)
- Aggregate ACV, pipeline, and activity metrics for their assigned scope
- Influenced opportunities — deals they are tagged on as a contributor
- Their own commission calculation (based on scope-level attainment + Looker usage)
- Separate IC leaderboard category (does not compete with AE individual deal leaderboards)

> **Developer Note:** Create `opportunity_contributors` and `quota_scopes` tables in the v1 initial migration as stubs. Add `quota_scope_type` and `quota_scope_id` columns to the `quotas` table as nullable. All values will be NULL in v1. This avoids a schema migration when v2 IC dashboard is built.

### Phase 3: Partner Portal
> Schema stubs are defined in Section 6. Tables `partners` and `opportunity_partners` must be created in the v1 initial migration with all values NULL.

- New role: `partner` — scoped to opportunities attributed to their organization only
- Full attribution model: sourced / influenced / referred / fulfilled / resold
- Up to **4 partners per opportunity** with weighted attribution splits (must sum to 100%)
- Partner-facing dashboards: attributed pipeline, ACV, pilot count
- Partner login via Okta (separate Okta app integration or dedicated group)
- Partner tier management (gold / silver / bronze)

---

## 17. Non-Functional Requirements

### Performance
- Dashboard initial load (cached data): **< 2 seconds** on desktop
- Sync operations: **non-blocking** — run as background jobs; UI must remain fully usable during sync
- Leaderboard query: **< 500ms** — index on `owner_user_id`, `close_date`, `is_closed_won`, `is_paid_pilot`
- Support: up to **500 concurrent users**

### Security
- All data in transit: HTTPS / TLS 1.2+
- All data at rest: encrypted (Supabase default)
- Next.js API layer is the **sole** data access enforcement layer — every route applies role and org-hierarchy scoping before querying Supabase
- All API routes require valid authenticated session JWT
- Salesforce OAuth credentials and Looker API credentials stored as **server-side environment variables only** — never in client code or browser storage
- No direct database access from client — all queries via API layer

### Reliability
- Target uptime: **99.5%**
- Sync failures must not cause data loss — use transactional writes with rollback on failure
- Partial sync failure: log to `sync_log`, preserve all previously synced records, notify via warning banner

### Auditability
- All quota and commission rate changes: log `updated_by` + `updated_at` (immutable audit trail)
- `sync_log` retained for **90 days**
- **Soft-delete only** for users — never hard-delete; historical opportunity and commission data must remain intact after user deprovisioning

---

## 18. Open Questions & Decisions Log

| # | Question | Status | Notes / Recommendation |
|---|----------|--------|----------------------|
| 1 | Source of truth for user-to-manager hierarchy | **RESOLVED** | Okta SCIM `manager` attribute is the single source of truth. Hierarchy is constructed from the manager attribute on each user profile, not from group membership. Written to `user_hierarchy` on every SCIM sync. |
| 2 | What Looker metrics and formula define "usage score" for the commission multiplier? | **RESOLVED** | Interaction counts per product type (Navigator, Autopilot, etc.). Multiplier = actual interactions ÷ target interactions. Targets configured in Supabase per product type. |
| 3 | Exact commission rate tiers per AE, deal type, and fiscal period | **RESOLVED** | Quotas and base commission rates managed natively in Supabase via `commission_rates` table. Configured by C-Level/RevOps RW in Settings UI. CRO has read-only access. VP and below have no access. |
| 4 | Should "Sync Now" trigger Salesforce + Looker simultaneously or separately? | **OPEN** | Recommend: single button triggers both sequentially; Settings page allows independent triggers |
| 5 | Exact Salesforce custom field API names for Paid Pilot | **RESOLVED** | Field is `Pilot_Type__c` (text). Opportunity is a Paid Pilot when `Pilot_Type__c = 'Paid Pilot'`. Also sync `Pilot_Start_Date__c` and `Pilot_End_Date__c`. |
| 6 | Commission dispute / correction workflow | **Phase 2** | Deferred to v2 |
| 7 | Partner portal scope, attribution logic, and partner tier definitions | **Phase 3** | Deferred to v3 — schema stubs defined and must be created in v1 migration |
| 8 | Delta sync vs. full sync for Salesforce (performance at scale) | **Phase 2** | v1 uses full sync on manual trigger; optimize with delta sync in v2 |
| 9 | Usage score target thresholds per product line | **RESOLVED** | Interaction count targets configured per product type in Supabase (Settings → Usage Thresholds, VP+ only). Product types confirmed as Navigator, Autopilot, and others as they exist in Looker. |

---

*End of TD RevenueIQ v1 Specification — Version 1.0*

> This document is the authoritative source of truth for the TD RevenueIQ v1 implementation. All items marked **OPEN** in Section 18 must be resolved before the relevant features are built. Engineering should update Section 18 with any additional gaps, contradictions, or assumptions discovered during implementation.
