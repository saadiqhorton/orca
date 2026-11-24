import type { OrchestrationDb } from '../db/orchestration-db'
import type { ReadyRemoteFederatedWorkerStartReceipt } from './federated-attach-receipt'
import { armFederatedHomeFirstTurnFollowThrough } from '../../rpc/methods/orchestration/worker/start/worker-start-first-turn-follow-through'
import type { OrcaRuntimeService } from '../../orca-runtime'

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
