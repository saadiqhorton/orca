import type { OrchestrationDb } from '../orchestration-db'

/** Startup prompt or first-turn failure a worker is stopped at, while its Dispatch stays open. */
export function migrateV52(this: OrchestrationDb, current: number): void {
  if (current >= 52) {
    return
  }
  if (!this.hasColumn('worker_dispatches', 'blocked_reason')) {
    this.db.exec('ALTER TABLE worker_dispatches ADD COLUMN blocked_reason TEXT')
  }
  if (!this.hasColumn('remote_dispatch_attachments', 'blocked_reason')) {
    this.db.exec('ALTER TABLE remote_dispatch_attachments ADD COLUMN blocked_reason TEXT')
  }
}
