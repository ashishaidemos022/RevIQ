-- TD RevenueIQ — Auth Log Table
-- Tracks all authentication events for security auditing

CREATE TABLE auth_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL,        -- login_success | login_failed | logout | jit_provision | session_expired
  auth_method     text NOT NULL,        -- saml | dev_login
  user_id         uuid REFERENCES users(id) NULL,  -- NULL for failed attempts where user is unknown
  email           text NULL,            -- email used in the attempt (always logged when available)
  failure_reason  text NULL,            -- NULL on success; e.g., invalid_saml, missing_attributes, invalid_password
  ip_address      text NULL,
  user_agent      text NULL,
  created_at      timestamptz DEFAULT now()
);

-- Index for querying recent events by user
CREATE INDEX idx_auth_log_user_id ON auth_log (user_id, created_at DESC);

-- Index for querying by event type (e.g., finding all failed attempts)
CREATE INDEX idx_auth_log_event_type ON auth_log (event_type, created_at DESC);

-- Index for time-based queries and cleanup
CREATE INDEX idx_auth_log_created_at ON auth_log (created_at DESC);
