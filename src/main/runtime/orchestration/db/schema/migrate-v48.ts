import type { OrchestrationDb } from '../orchestration-db'

/** The startup prompt a federated worker's agent is stopped at, while its attachment stays ready. */
export function migrateV48(this: OrchestrationDb, current: number): void {
  if (current >= 48) {
    return
  }
  if (!this.hasColumn('remote_dispatch_attachments', 'blocked_reason')) {
    this.db.exec('ALTER TABLE remote_dispatch_attachments ADD COLUMN blocked_reason TEXT')
  }
}
