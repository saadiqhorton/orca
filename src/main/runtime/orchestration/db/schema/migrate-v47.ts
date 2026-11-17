import type { OrchestrationDb } from '../orchestration-db'

/** The startup prompt a worker's agent is stopped at, while its Dispatch stays open. */
export function migrateV47(this: OrchestrationDb, current: number): void {
  if (current >= 47) {
    return
  }
  if (!this.hasColumn('worker_dispatches', 'blocked_reason')) {
    this.db.exec('ALTER TABLE worker_dispatches ADD COLUMN blocked_reason TEXT')
  }
}
