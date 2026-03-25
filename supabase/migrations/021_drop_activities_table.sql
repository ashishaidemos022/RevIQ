-- Drop the legacy activities table.
-- All activity data now comes from Snowflake via activity_daily_summary.
DROP TABLE IF EXISTS activities;
