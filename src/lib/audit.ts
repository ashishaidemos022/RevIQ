import { getSupabaseClient } from '@/lib/supabase/client';

export interface AuditEntry {
  event_type: string;
  actor_id?: string;
  actor_email?: string;
  target_type?: string;
  target_id?: string;
  target_label?: string;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event. Fire-and-forget — errors are logged but never thrown.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = getSupabaseClient();
    await db.from('audit_log').insert({
      event_type: entry.event_type,
      actor_id: entry.actor_id && entry.actor_id !== 'dev-admin' ? entry.actor_id : null,
      actor_email: entry.actor_email || null,
      target_type: entry.target_type || null,
      target_id: entry.target_id || null,
      target_label: entry.target_label || null,
      before_state: entry.before_state || null,
      after_state: entry.after_state || null,
      metadata: entry.metadata || null,
    });
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err);
  }
}
