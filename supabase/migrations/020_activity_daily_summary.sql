-- Migration: Add activity_daily_summary table for Snowflake-sourced activity data
-- and update sync_log to support 'snowflake' sync type.

-- 1. Create activity_daily_summary table
CREATE TABLE activity_daily_summary (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_sf_id     text NOT NULL,
  ae_name         text NOT NULL,
  activity_date   date NOT NULL,
  activity_count  integer NOT NULL DEFAULT 0,
  call_count      integer NOT NULL DEFAULT 0,
  email_count     integer NOT NULL DEFAULT 0,
  linkedin_count  integer NOT NULL DEFAULT 0,
  meeting_count   integer NOT NULL DEFAULT 0,
  synced_at       timestamptz DEFAULT now(),
  UNIQUE(owner_sf_id, activity_date)
);

CREATE INDEX idx_activity_daily_summary_date ON activity_daily_summary(activity_date);
CREATE INDEX idx_activity_daily_summary_owner ON activity_daily_summary(owner_sf_id);

-- 2. Update sync_log CHECK constraint to allow 'snowflake'
ALTER TABLE sync_log DROP CONSTRAINT sync_log_sync_type_check;
ALTER TABLE sync_log ADD CONSTRAINT sync_log_sync_type_check
  CHECK (sync_type IN ('salesforce', 'looker', 'scim', 'snowflake'));
