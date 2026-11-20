import {
  agentTurnFailedBlockedReason,
  isAgentTurnFailedBlockedReason
} from '../../../../../../../shared/orchestration/agent-launch-first-turn'
import type { OrchestrationDb } from '../../../../../orchestration/db/orchestration-db'
import type { OrcaRuntimeService } from '../../../../../orca-runtime'
import { reportFailedWorkerStart } from '../../../../../orchestration/workers/turn-stops/failed-worker-start-report'
import {
  continueFirstTurnWatchInBackground,
  FIRST_TURN_WATCH_MS,
  type TerminalReader
} from '../../../agent-launch/agent-launch-first-turn-watch'

type FollowThroughRuntime = TerminalReader & {
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

export function armWorkerFirstTurnFollowThrough(args: {
  runtime: FollowThroughRuntime
  db: OrchestrationDb
  dispatchId: string
  handle: string
  deadline?: number
  now?: () => number
}): void {
  const now = args.now ?? Date.now
  continueFirstTurnWatchInBackground({
    runtime: args.runtime,
    handle: args.handle,
    deadline: args.deadline ?? now() + FIRST_TURN_WATCH_MS,
    now,
    onFailure: (reason) =>
      failWorkerFirstTurnAfterReady({
        db: args.db,
        dispatchId: args.dispatchId,
        reason,
        notify: (handle, type) => args.runtime.notifyMessageArrived?.(handle, type)
      })
  })
}

export function remoteHostTerminalReader(
  runtime: Pick<OrcaRuntimeService, 'callOrchestrationWorkerServer'>,
  environmentId: string
): TerminalReader {
  return {
    readTerminal: async (handle) => {
      const result = (await runtime.callOrchestrationWorkerServer(
        environmentId,
        'terminal.read',
        { terminal: handle, screen: true },
        5_000
      )) as { terminal?: { tail?: unknown; screen?: unknown; text?: string } }
      return result.terminal ?? {}
    }
  }
}

export function armRemoteAttachmentFirstTurnFollowThrough(args: {
  runtime: TerminalReader
  db: {
    failRemoteAttachment: (
      dispatchId: string,
      stage: string,
      reason: string,
      unknown: boolean
    ) => unknown
  }
  dispatchId: string
  handle: string
  deadline?: number
  now?: () => number
}): void {
  const now = args.now ?? Date.now
  continueFirstTurnWatchInBackground({
    runtime: args.runtime,
    handle: args.handle,
    deadline: args.deadline ?? now() + FIRST_TURN_WATCH_MS,
    now,
    onFailure: (reason) => {
      const blocked = agentTurnFailedBlockedReason(reason)
      try {
        args.db.failRemoteAttachment(args.dispatchId, blocked, blocked, false)
      } catch {
        // Attachment already left starting/ready.
      }
    }
  })
}

export function armFederatedHomeFirstTurnFollowThrough(args: {
  runtime: Pick<OrcaRuntimeService, 'callOrchestrationWorkerServer' | 'notifyMessageArrived'>
  db: OrchestrationDb
  dispatchId: string
  environmentId: string
  handle: string
}): void {
  armWorkerFirstTurnFollowThrough({
    runtime: {
      ...remoteHostTerminalReader(args.runtime, args.environmentId),
      notifyMessageArrived: args.runtime.notifyMessageArrived
    },
    db: args.db,
    dispatchId: args.dispatchId,
    handle: args.handle
  })
}
