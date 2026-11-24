import type { OrchestrationWorkerLaunchReceipt } from '../../rpc/methods/orchestration/worker/start/launch/worker-launch-preferences'
import type { OrchestrationDb } from '../db/orchestration-db'
import { reportFailedWorkerStart } from '../workers/turn-stops/failed-worker-start-report'
import { isAgentTurnFailedBlockedReason } from '../../../../shared/orchestration/agent-launch-first-turn'
import {
  workerStartBlockedPromptReason,
  withWorkerStartBlockedPromptIdentity
} from '../../rpc/methods/orchestration/worker/start/worker-start-blocked-prompt'

export function persistFederatedHomeBlockedPrompt(args: {
  db: OrchestrationDb
  dispatchId: string
  error: unknown
  host?: string
  notify: (handle: string, type: string) => void
}): unknown | null {
  const reason = workerStartBlockedPromptReason(args.error)
  if (reason === null) {
    return null
  }
  if (isAgentTurnFailedBlockedReason(reason)) {
    const worker = args.db.failWorkerStart(
      args.dispatchId,
      reason,
      args.error instanceof Error ? args.error.message : String(args.error)
    )
    reportFailedWorkerStart(args.db, worker, args.notify)
  } else {
    args.db.markWorkerBlockedOnPrompt(args.dispatchId, reason)
  }
  return withWorkerStartBlockedPromptIdentity(args.error, {
    dispatchId: args.dispatchId,
    host: args.host
  })
}

export function isKnownRemoteStartFailure(code: string): boolean {
  return [
    'invalid_argument',
    // Refused before the remote attached anything: the worker start failed.
    'selector_not_found',
    'agent_unconfigured',
    'worktree_not_found_on_server',
    'terminal_worktree_mismatch',
    'terminal_busy',
    'capability_unsupported'
  ].includes(code)
}

type FederatedStartWorker = {
  dispatch_id: string
  state: string
  stage: string
  last_error: string | null
}

export function federatedFailedReceipt(
  worker: FederatedStartWorker,
  ids: { runId: string; taskId: string },
  server: { environmentId: string; name: string },
  outcome: {
    launch: OrchestrationWorkerLaunchReceipt
    setup?: { state: string }
    effects?: unknown[]
    residualResources?: unknown[]
  }
): unknown {
  return {
    ...ids,
    dispatchId: worker.dispatch_id,
    state: worker.state,
    stage: worker.stage,
    server: { environmentId: server.environmentId, name: server.name },
    failedStage: worker.stage,
    lastError: worker.last_error,
    ...outcome,
    effects: outcome.effects ?? [],
    residualResources: outcome.residualResources ?? []
  }
}

export function federatedUnknownReceipt(
  worker: FederatedStartWorker,
  taskId: string,
  serverName: string,
  launch: OrchestrationWorkerLaunchReceipt
): unknown {
  return {
    taskId,
    dispatchId: worker.dispatch_id,
    state: 'outcome_unknown',
    stage: worker.stage,
    server: { name: serverName },
    launch,
    failedStage: worker.stage,
    lastError: worker.last_error,
    effects: [],
    residualResources: [],
    nextCommands: [
      `orca orchestration worker-show --dispatch ${worker.dispatch_id} --json`,
      `orca orchestration worker-abandon --dispatch ${worker.dispatch_id} --json`
    ]
  }
}
