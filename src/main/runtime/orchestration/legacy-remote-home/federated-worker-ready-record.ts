import type { OrchestrationDb } from '../db/orchestration-db'
import type { ReadyRemoteFederatedWorkerStartReceipt } from './federated-attach-receipt'
import { armFederatedHomeFirstTurnFollowThrough } from '../../rpc/methods/orchestration/worker/start/worker-start-first-turn-follow-through'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { withWorkerStartNext } from '../../rpc/methods/orchestration/receipt-next'
import type { OrchestrationWorkerLaunchReceipt } from '../../rpc/methods/orchestration/worker/start/launch/worker-launch-preferences'

/** Records where a ready remote worker lives and that the server accepted its input. */
export function recordReadyFederatedDispatch(
  db: OrchestrationDb,
  dispatchId: string,
  remote: ReadyRemoteFederatedWorkerStartReceipt
): void {
  db.updateFederatedDispatchResources({
    dispatchId,
    remoteRuntimeEpoch: remote.runtimeEpoch,
    worktreeId: remote.worktreeId,
    terminalHandle: remote.terminalHandle
  })
  db.recordWorkerStage({
    dispatchId,
    stage: 'remote_input_accepted',
    worktreeId: remote.worktreeId,
    terminalHandle: remote.terminalHandle,
    setupState: remote.setup?.state,
    effects: remote.effects,
    residualResources: remote.residualResources
  })
}

export function settleReadyFederatedHome(args: {
  runtime: OrcaRuntimeService
  db: OrchestrationDb
  dispatchId: string
  remote: ReadyRemoteFederatedWorkerStartReceipt
  environmentId: string
  runId: string
}): ReturnType<OrchestrationDb['markWorkerDispatchReady']> {
  recordReadyFederatedDispatch(args.db, args.dispatchId, args.remote)
  const worker = args.db.markWorkerDispatchReady(args.dispatchId)
  armFederatedHomeFirstTurnFollowThrough({
    runtime: args.runtime,
    db: args.db,
    dispatchId: args.dispatchId,
    environmentId: args.environmentId,
    handle: args.remote.terminalHandle
  })
  args.runtime.ensureOrchestrationFederationRelay(args.runId)
  return worker
}

export function federatedReadyHomeReceipt(args: {
  runId: string
  taskId: string
  dispatchId: string
  stage: string
  server: { environmentId: string; name: string }
  remote: ReadyRemoteFederatedWorkerStartReceipt
  launch: OrchestrationWorkerLaunchReceipt
  timeoutMs: number
  warning?: string
  reportsTurnStops: boolean
  cli: string
}): unknown {
  return withWorkerStartNext(
    {
      runId: args.runId,
      taskId: args.taskId,
      dispatchId: args.dispatchId,
      state: 'ready',
      stage: args.stage,
      server: { environmentId: args.server.environmentId, name: args.server.name },
      setup: args.remote.setup,
      launch: args.launch,
      timeoutMs: args.timeoutMs,
      effects: args.remote.effects ?? [],
      residualResources: args.remote.residualResources ?? [],
      ...(args.warning ? { warning: args.warning } : {})
    },
    args.reportsTurnStops
      ? undefined
      : { name: args.server.name, dispatchId: args.dispatchId, cli: args.cli }
  )
}
