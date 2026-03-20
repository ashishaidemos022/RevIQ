CREATE TABLE view_as_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiated_by uuid NOT NULL REFERENCES users(id),
  initiated_by_role text NOT NULL,
  viewed_as uuid NOT NULL REFERENCES users(id),
  viewed_as_role text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX idx_view_as_log_initiated_by ON view_as_log(initiated_by);
CREATE INDEX idx_view_as_log_started_at ON view_as_log(started_at DESC);
