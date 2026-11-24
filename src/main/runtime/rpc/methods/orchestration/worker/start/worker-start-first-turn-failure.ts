import {
  agentTurnFailedBlockedReason,
  isAgentTurnFailedBlockedReason
} from '../../../../../../../shared/orchestration/agent-launch-first-turn'
import type { OrchestrationDb } from '../../../../../orchestration/db/orchestration-db'
import { reportFailedWorkerStart } from '../../../../../orchestration/workers/turn-stops/failed-worker-start-report'

export type WorkerFirstTurnFailureRuntime = {
  getExistingOrchestrationDb?: () => OrchestrationDb | null
  getOrchestrationDb?: () => OrchestrationDb
  notifyMessageArrived?: (handle: string, type: string) => void
}

export function failWorkerFirstTurnAfterReady(args: {
  db: OrchestrationDb
  dispatchId: string
  reason: string
  notify: (handle: string, type: string) => void
}): void {
  const blocked = isAgentTurnFailedBlockedReason(args.reason)
    ? args.reason
    : agentTurnFailedBlockedReason(args.reason)
  try {
    const worker = args.db.failWorkerStart(args.dispatchId, blocked, blocked)
    reportFailedWorkerStart(args.db, worker, args.notify)
  } catch {
    // Already left starting/ready — worker-show and wait keep the settled record.
  }
}

export function failWorkerFirstTurnByHandle(args: {
  runtime: WorkerFirstTurnFailureRuntime
  handle: string
  reason: string
}): void {
  if (!args.handle) {
    return
  }
  const db =
    args.runtime.getExistingOrchestrationDb?.() ?? args.runtime.getOrchestrationDb?.() ?? null
  const resource = db?.getWorkerTerminalResourceByHandle(args.handle)
  if (!db || !resource?.owner_dispatch_id) {
    return
  }
  failWorkerFirstTurnAfterReady({
    db,
    dispatchId: resource.owner_dispatch_id,
    reason: args.reason,
    notify: (handle, type) => args.runtime.notifyMessageArrived?.(handle, type)
  })
}
