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
C-Level / RevOps (full company visibility)
    └── CRO (full company visibility)
        └── SVP / VP (full regional org tree)
            └── Sales Manager / Line Manager (direct reports + their reports)
                └── Account Executive (own data only)
```

### Role Definitions & Data Access

| Role | Display Name | Data Scope | Can Edit Quotas |
|------|-------------|------------|-----------------|
| `ae` | Account Executive | Own opportunities, activities, commissions only | No |
| `manager` | Sales Manager | All AEs in their direct + transitive reporting tree | No |
| `vp` | VP / SVP | All managers and AEs within their region/org subtree | Yes (their region) |
| `cro` | CRO | Full company — all regions, all AEs | Yes (company-wide) |
| `c_level` | C-Level / RevOps | Full company — same as CRO | Yes (company-wide) |

### Row-Level Security Rules
- Every data query is scoped by the authenticated user's role and their position in the `user_hierarchy` table
- Managers see their **full transitive org tree** (direct reports + their reports recursively), not just direct reports
- VPs see their region only — not other VPs' regions
- CRO and C-Level see everything
- AEs never see other AEs' individual data, except on the Leaderboard (see Section 12)

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
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth integrated with Okta via OIDC/SAML
- **User Provisioning:** SCIM from Okta → Supabase
- **API Layer:** Next.js API routes or Supabase Edge Functions
- **Row-Level Security:** Supabase RLS policies enforcing org hierarchy

### External Integrations
| System | Purpose | Method |
|--------|---------|--------|
| **Okta** | SSO Authentication | OIDC / SAML 2.0 |
| **Okta SCIM** | User provisioning & deprovisioning | SCIM 2.0 |
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
- FY2026 = February 1, 2026 → January 31, 2027
- Always label quarters as "Q1 FY2026", "Q2 FY2026", etc. — never use calendar quarter labels

### Implementation Note
- Store a `fiscal_config` table in Supabase with `fy_start_month = 2` (February)
- All date utility functions must accept and apply the fiscal offset
- Build a shared `getFiscalQuarter(date)` and `getFiscalYear(date)` utility used everywhere
- Never use JavaScript's native `getMonth()` for quarter logic without the fiscal offset applied

---

## 5. Authentication & Authorization

### Authentication Flow
1. User navigates to TD RevenueIQ
2. Redirect to Okta for OIDC login
3. Okta returns JWT with user identity and group membership
4. Supabase Auth validates JWT and maps to internal user record
5. User session established with role and hierarchy context

### User Provisioning via SCIM
- Okta SCIM pushes user creates, updates, and deactivations to Supabase
- SCIM maps Okta groups → RevenueIQ roles (`ae`, `manager`, `vp`, `cro`, `c_level`)
- Deprovisioned users are soft-deleted (historical data preserved, login disabled)
- Manager-to-AE relationships are synced from Okta group hierarchy or Salesforce role hierarchy

> **Open Question:** Which is the source of truth for the user-to-manager hierarchy — Okta groups or Salesforce role hierarchy? See Section 18, item #1.

### Salesforce Authorization
- Salesforce is also used as a source for authorization data: territory assignments, opportunity ownership, account ownership
- On each Salesforce sync, the system reconciles opportunity ownership against the internal `user_hierarchy` table
- If a Salesforce user does not exist in RevenueIQ, log a warning and skip (do not fail the sync)

### Session & Security
- JWT expiry: follow Okta session policy
- All API routes require authenticated session
- Supabase RLS enforces data access at the database level — API-level filtering is a secondary defense, not the primary one

---

## 6. Data Architecture

### Core Tables (Supabase / PostgreSQL)

#### `users`
```sql
id                  uuid PRIMARY KEY
okta_id             text UNIQUE NOT NULL
email               text UNIQUE NOT NULL
full_name           text NOT NULL
role                text NOT NULL  -- ae | manager | vp | cro | c_level
salesforce_user_id  text           -- SF User ID for mapping
region              text
is_active           boolean DEFAULT true
created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()
```

#### `user_hierarchy`
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES users(id)
manager_id      uuid REFERENCES users(id)
effective_from  date NOT NULL
effective_to    date           -- null = currently active
```
> Used for recursive org-tree RLS queries. Index on `manager_id` and `user_id`.

#### `quotas`
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES users(id)
fiscal_year     integer NOT NULL   -- e.g., 2026
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
arr                       numeric(18,2)
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
base_amount         numeric(18,2)   -- from opportunity ARR
usage_multiplier    numeric(6,4)    -- derived from Looker usage data
commission_rate     numeric(6,4)    -- e.g., 0.08 for 8%
commission_amount   numeric(18,2)   -- calculated: arr × rate × usage_multiplier
calculation_date    timestamptz
is_finalized        boolean DEFAULT false
notes               text
created_at          timestamptz DEFAULT now()
```

#### `sync_log`
```sql
id              uuid PRIMARY KEY
sync_type       text NOT NULL    -- salesforce | looker
triggered_by    uuid REFERENCES users(id)
started_at      timestamptz
completed_at    timestamptz
status          text             -- running | success | partial | failed
records_synced  integer
error_message   text
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
| `Opportunity` | Id, Name, AccountId, OwnerId, StageName, Amount, ARR__c, CloseDate, IsClosed, IsWon, Pilot_Type__c, Pilot_Start_Date__c, Pilot_End_Date__c, ForecastCategory, Probability, Type, LastStageChangeDate | `opportunities` |
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
1. Opportunity ARR (from Salesforce)
2. Commission rate (manually configured per AE/period in RevenueIQ)
3. Usage multiplier (derived from Looker usage data for the associated account)

### Commission Formula
```
commission_amount = arr × commission_rate × usage_multiplier
```

### Commission Rate Configuration
- Base commission rates are **managed directly in Supabase** by CRO / VP via the Settings → Commission Rates UI
- Rates can be set per: AE, fiscal year, fiscal quarter, and/or deal type
- A dedicated `commission_rates` table stores all rate configurations with full audit trail (`entered_by`, `created_at`, `updated_at`)
- AEs cannot view or edit commission rates — read access is restricted to Manager+ roles

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
- Commissions are also recalculated when an opportunity's ARR, stage, or close date changes
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
└── ⚙️  Settings                     (Quotas, commission rates, sync, preferences)
```

### Navigation Access by Role
| Nav Item | AE | Manager | VP | CRO | C-Level |
|----------|:--:|:-------:|:--:|:---:|:-------:|
| Home / My Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pipeline | ✅ | ✅ | ✅ | ✅ | ✅ |
| Paid Pilots | ✅ | ✅ | ✅ | ✅ | ✅ |
| Activities | ✅ | ✅ | ✅ | ✅ | ✅ |
| Performance (4Q) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Leaderboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Usage | ✅ | ✅ | ✅ | ✅ | ✅ |
| Team View | ❌ | ✅ | ✅ | ✅ | ✅ |
| Settings → Quotas | ❌ | ❌ | ✅ | ✅ | ✅ |
| Settings → Commission Rates | ❌ | ❌ | ✅ | ✅ | ✅ |
| Settings → Sync | ❌ | ✅ | ✅ | ✅ | ✅ |

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
| ARR Closed QTD | `sum(arr) WHERE is_closed_won AND close_date IN current_fiscal_quarter` | |
| ARR Closed YTD | `sum(arr) WHERE is_closed_won AND close_date IN current_fiscal_year` | |
| Deals Closed QTD | `count(*) WHERE is_closed_won AND close_date IN current_fiscal_quarter` | |
| Commission Earned QTD | Sum of finalized `commission_amount` this fiscal quarter | |
| Commission Projected QTD | Sum of unfinalized `commission_amount` this fiscal quarter | |
| Quota Attainment % | `ARR Closed YTD ÷ Annual Quota × 100` | Shown as percentage with color indicator |

#### Charts Section
- **ARR by Month (Bar Chart):** Last 12 months, FY-aligned, closed-won ARR per fiscal month
- **Pipeline by Stage (Horizontal Bar):** Current open opportunities grouped by stage, sized by ARR
- **Quota Attainment Gauge (Radial):** % to annual quota — green ≥ 75%, amber 50–74%, red < 50%

#### Recent Opportunities Table
Columns: Account Name | Opportunity Name | Stage | ARR | Close Date | Paid Pilot | Last Activity Date
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
- Paid Pilot (yes / no / all)
- AE (dropdown — Managers+ only; defaults to own AEs for managers, all for CRO+)

#### KPI Cards
| Card | Description |
|------|-------------|
| Total Pipeline ARR | Sum of ARR on all open opportunities (matching filters) |
| Weighted Pipeline ARR | Sum of ARR × Probability |
| Deals in Pipeline | Count of open opportunities |
| Avg Deal Size | Total Pipeline ARR ÷ Deals in Pipeline |
| Closing This Quarter | Count of open opps with close_date in current fiscal quarter |

#### Pipeline by Stage Table
Columns: Stage | # Deals | Total ARR | Weighted ARR | Avg Days in Stage
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
| Total Pilot ARR | Sum of ARR on active pilot opportunities |
| Pilot Conversion Rate | Closed-won pilots ÷ Total all-time pilots (for selected period) |
| Avg Pilot Duration | Avg days between `paid_pilot_start_date` and `close_date` (converted pilots only) |
| Expiring Within 30 Days | Count of pilots where `paid_pilot_end_date` ≤ today + 30 days AND not closed |

#### Pilots at Risk Section (Amber Alert Panel)
Displayed when any pilots have `paid_pilot_end_date` within 30 days and stage is not closed.

Columns: Account | AE | ARR | Start Date | End Date | Days Remaining | Stage
- Rows sorted by Days Remaining (ascending)
- Row background color: amber (≤ 30 days), red (≤ 7 days)

#### All Pilots Table
Columns: Account | AE | ARR | Pilot Start | Pilot End | Stage | Duration (days) | Status

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
- Each quarter labeled as "Q1 FY2026", etc.
- Navigation arrows to shift the window back to view older quarters

#### Performance Summary Table
Rows = Metrics | Columns = Q (current) | Q–1 | Q–2 | Q–3

| Metric Row |
|-----------|
| ARR Closed |
| Deals Closed |
| Quota Attainment % |
| Active Pilots (at quarter end) |
| Pilot Conversion Rate |
| Commission Earned |
| Total Activities |

- Delta indicators (▲▼) comparing each quarter to the prior quarter

#### Trend Charts
- **ARR Closed — Bar Chart** across 4 quarters with quota line overlay
- **Activity Volume — Line Chart** across 4 quarters
- **Quota Attainment % — Line Chart** across 4 quarters

#### AE / Team Selector *(Managers+ only)*
- Dropdown: own summary / individual AE / "All Team" aggregate
- When "All Team" selected, metrics show team totals/averages

---

### 11.6 Team View *(Managers and above only)*

Allows managers to compare performance across all AEs within their org tree.

#### Team Overview KPI Cards
- Total ARR Closed (team, QTD)
- Avg Quota Attainment % (team)
- Total Active Pilots (team)
- Total Activities QTD (team)

#### AE Roster Table
Columns: AE Name | Region | ARR Closed QTD | ARR Closed YTD | Annual Quota | Attainment % | Active Pilots | Activities QTD | Commission QTD
- Sortable by any column
- Clicking an AE row opens a full AE detail page (all dashboards rendered from that AE's data perspective)
- Color-code Attainment %: green ≥ 75%, amber 50–74%, red < 50%

#### Org Tree Navigation *(VP and above)*
- Breadcrumb navigation when drilling into a sub-team (e.g., Company → Region West → Manager Smith → AE Jones)
- Toggle: "My Direct Team" / "Full Org Tree" / individual manager's sub-team

---

## 12. Leaderboards

**All AEs can see the full leaderboard** — all AEs ranked company-wide. Managers and above have additional filter controls (by region, team, period).

The Leaderboard section contains **4 separate boards** accessed via horizontal tabs.

---

### Board 1: Revenue Leaderboard
**Primary Ranking Metric:** ARR Closed Won (QTD, default)

Columns: Rank | AE Name | Region | ARR Closed | Deals Closed | Quota Attainment %

Period Toggle: QTD / YTD / Custom Quarter

---

### Board 2: Pipeline Leaderboard
**Primary Ranking Metric:** Total Open Pipeline ARR

Columns: Rank | AE Name | Region | Pipeline ARR | Weighted Pipeline | # Open Deals | Avg Deal Size

Period Toggle: Current Quarter / All Open

---

### Board 3: Paid Pilots Leaderboard
**Primary Ranking Metric:** Count of Active Pilots (secondary: Pilot ARR)

Columns: Rank | AE Name | Region | Active Pilots | Pilot ARR | Conversion Rate | Avg Duration (days)

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
Columns: Account Name | AE Owner | Linked ARR | Navigator Interactions | Autopilot Interactions | [other product types] | Usage Trend (sparkline) | Last Updated

- Product type columns are dynamic — rendered based on distinct `product_type` values in `usage_metrics`

- Sortable and searchable (by account name or AE)
- Clicking an account row opens the **Account Usage Detail Panel**

### Account Usage Detail Panel
- Account header: Name, AE owner, Industry, Region
- All linked open opportunities (with stage, ARR, close date)
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
- **Empty:** Centered illustration + descriptive message (e.g., "No opportunities found for Q1 FY2026")
- **Error:** Error message + "Retry" button

### Data Visualization Standards
| Chart Type | Used For |
|-----------|---------|
| Bar Chart | ARR by period, activity counts, pipeline by stage |
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

### Phase 3: Partner Portal
> Schema stubs are defined in Section 6. Tables `partners` and `opportunity_partners` must be created in the v1 initial migration with all values NULL.

- New role: `partner` — scoped to opportunities attributed to their organization only
- Full attribution model: sourced / influenced / referred / fulfilled / resold
- Up to **4 partners per opportunity** with weighted attribution splits (must sum to 100%)
- Partner-facing dashboards: attributed pipeline, ARR, pilot count
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
- Supabase RLS is the **primary** data access enforcement layer — not just API-level filtering
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
| 1 | Source of truth for user-to-manager hierarchy: Okta groups or Salesforce role hierarchy? | **OPEN** | Recommend Okta SCIM as primary (synced on user provisioning), Salesforce as secondary reference |
| 2 | What Looker metrics and formula define "usage score" for the commission multiplier? | **RESOLVED** | Interaction counts per product type (Navigator, Autopilot, etc.). Multiplier = actual interactions ÷ target interactions. Targets configured in Supabase per product type. |
| 3 | Exact commission rate tiers per AE, deal type, and fiscal period | **RESOLVED** | Quotas and base commission rates managed natively in Supabase via `commission_rates` table. Configured by CRO/VP in Settings UI. |
| 4 | Should "Sync Now" trigger Salesforce + Looker simultaneously or separately? | **OPEN** | Recommend: single button triggers both sequentially; Settings page allows independent triggers |
| 5 | Exact Salesforce custom field API names for Paid Pilot | **RESOLVED** | Field is `Pilot_Type__c` (text). Opportunity is a Paid Pilot when `Pilot_Type__c = 'Paid Pilot'`. Also sync `Pilot_Start_Date__c` and `Pilot_End_Date__c`. |
| 6 | Commission dispute / correction workflow | **Phase 2** | Deferred to v2 |
| 7 | Partner portal scope, attribution logic, and partner tier definitions | **Phase 3** | Deferred to v3 — schema stubs defined and must be created in v1 migration |
| 8 | Delta sync vs. full sync for Salesforce (performance at scale) | **Phase 2** | v1 uses full sync on manual trigger; optimize with delta sync in v2 |
| 9 | Usage score target thresholds per product line | **RESOLVED** | Interaction count targets configured per product type in Supabase (Settings → Usage Thresholds, VP+ only). Product types confirmed as Navigator, Autopilot, and others as they exist in Looker. |

---

*End of TD RevenueIQ v1 Specification — Version 1.0*

> This document is the authoritative source of truth for the TD RevenueIQ v1 implementation. All items marked **OPEN** in Section 18 must be resolved before the relevant features are built. Engineering should update Section 18 with any additional gaps, contradictions, or assumptions discovered during implementation.
