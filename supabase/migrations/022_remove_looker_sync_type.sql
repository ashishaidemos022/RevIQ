-- Remove 'looker' from sync_log sync_type constraint
ALTER TABLE sync_log DROP CONSTRAINT sync_log_sync_type_check;
ALTER TABLE sync_log ADD CONSTRAINT sync_log_sync_type_check
  CHECK (sync_type IN ('salesforce', 'scim', 'snowflake'));
