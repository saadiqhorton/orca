import type { OrcaRuntimeService } from '../../../../../../orca-runtime'
import type { OrchestrationDb } from '../../../../../../orchestration/db/orchestration-db'
import type { RunRow, TaskRow } from '../../../../../../orchestration/db/orchestration-records'
import type { AgentLaunchModeReceipt as WorkerStartModeReceipt } from '../../../../../../../../shared/agent-launch/contracts/agent-launch-intent'
import { rebindReusedStructuredWorker } from '../../../structured-workers/orchestration-structured-worker-session'
import { requireWorkerAuthority, type WorkerEffect } from '../placement/worker-placement-topology'
import type { placeWorkerAgent } from '../placement/worker-start-agent-placement'
import { deliverAndSettleWorkerStartReadiness } from './worker-start-readiness-settlement'
import type { WorkerStartInput } from '../worker-start-input'
import type { WorkerStartMutation } from '../worker-start-mutation'

type PlacedWorker = Awaited<ReturnType<typeof placeWorkerAgent>>

export function localWorkerStartHandover(args: {
  runtime: OrcaRuntimeService
  db: OrchestrationDb
  run: RunRow
  task: TaskRow
  params: WorkerStartInput
  startedDispatchId: string
  startedDispatchDepth: number
  placed: PlacedWorker
  handle: string
  worktreeId: string
  workerChat: boolean
  external: boolean
  authority?: {
    paneKey: string | null
    processIncarnation: string | null
    hostScope?: string
    launchTokenHash?: string
  }
  effects: WorkerEffect[]
  agent: string | undefined
  mode: WorkerStartModeReceipt
  timeoutMs: number
  readinessDeadline: number
  orchestrationMutation: WorkerStartMutation | undefined
  onStage: (stage: string) => void
}): { bindTerminal: () => void; handOver: (deliveryDeadline?: number) => Promise<unknown> } {
  const { runtime, db, handle, placed } = args
  const bindTerminal = (): void => {
    const terminalAuthority = args.authority ?? requireWorkerAuthority(runtime, handle)
    db.prepareStartingWorkerAuthority({
      dispatchId: args.startedDispatchId,
      handle,
      ...terminalAuthority,
      worktreeId: args.worktreeId,
      effects: args.effects,
      setupState: placed.setupReceipt.state,
      terminalOwnership: args.external ? 'external' : 'created'
    })
  }
  const handOver = async (deliveryDeadline = args.readinessDeadline): Promise<unknown> => {
    bindTerminal()
    if (args.workerChat) {
      rebindReusedStructuredWorker(handle, db)
    }
    return deliverAndSettleWorkerStartReadiness({
      runtime,
      db,
      run: args.run,
      task: placed.extraSpec
        ? { ...args.task, spec: `${args.task.spec}\n\n${placed.extraSpec}` }
        : args.task,
      dispatchId: args.startedDispatchId,
      dispatchDepth: args.startedDispatchDepth,
      structuredSession: placed.structuredSession,
      terminalHandle: handle,
      coordinatorHandle: args.params.from,
      devMode: args.params.devMode,
      requestId: args.orchestrationMutation?.requestId ?? args.startedDispatchId,
      agent: args.agent ?? null,
      launchedAgent: args.external || args.workerChat ? null : (args.agent ?? null),
      setupReceipt: placed.setupReceipt,
      launchReceipt: placed.launch,
      mode: args.mode,
      timeoutMs: args.timeoutMs,
      readinessDeadline: deliveryDeadline,
      effects: args.effects,
      terminalRevealWarning: placed.warning,
      onStage: args.onStage,
      host: args.params.host
    })
  }
  return { bindTerminal, handOver }
}
