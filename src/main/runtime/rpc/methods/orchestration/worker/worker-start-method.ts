import { stopHelperAfterStart } from './worker-stop'
import type { z } from 'zod'
import { defineOrchestrationMethod } from '../access/orchestration-method-access'
import { startFederatedWorker } from '../../../../orchestration/legacy-remote-home/federated-worker-start'
import { startLocalWorker } from './start/local-worker-start'
import { routeDesktopHubCommand } from '../../../../orchestration/desktop-hub/desktop-hub-route'
import type { WorkerFollowUp } from './follow-up/worker-follow-up-placement'
import { withWorkerStartNext } from '../receipt-next'
import { refuseWorkerStartItemOnRemote } from './start/admission/worker-start-authority'
import { WorkerStartParams } from '../../../../../../shared/rpc-contract/orchestration/orchestration-worker-start-params'
import { resolveWorkerStartReadinessTimeoutMs } from '../../../../../../shared/orchestration/orchestration-timing-budgets'
import { checkedWorkerOrigin } from '../../bots-items-worker-origin'
import { prepareWorkerStart, type WorkerStartContext } from './start/worker-start-prepare'
import { decideStartMode, noteTerminalFallbackOnItem } from './start/worker-chat-lineage'
import { withKeepOpenDefault } from './start/worker-keep-open-default'
import { withTerminalUsage } from './start/worker-start-terminal-usage'
import {
  linkWorkerToQuestion,
  openQuestionReminder,
  withOpenQuestion,
  withQuestionLink
} from './start/worker-question-link'

export { prepareWorkerStart } from './start/worker-start-prepare'

export const ORCHESTRATION_WORKER_START_METHODS = [
  defineOrchestrationMethod({
    name: 'orchestration.workerStart',
    access: {
      kind: 'writes',
      caller: 'from',
      server: 'on',
      targets: {
        task: 'task',
        parent: 'task',
        deps: 'task',
        run: 'run',
        retryOf: 'dispatch',
        terminal: 'worker',
        adoptTaskId: 'task'
      }
    },
    requires: ['accounts'],
    permission: 'workspace',
    params: WorkerStartParams,
    handler: async (params, ctx) => startWorker(params, ctx)
  })
]

/** worker-start, and a follow-up sent to a finished worker, which is worker-start run for the sender. */
export async function startWorker(
  startParams: z.infer<typeof WorkerStartParams>,
  ctx: WorkerStartContext,
  startFollowUp?: WorkerFollowUp
): Promise<unknown> {
  const { runtime, orchestrationMutation, orchestrationCaller } = ctx
  const hostIdentity = startParams.host
  startParams = await routeDesktopHubCommand(runtime, startParams)
  refuseWorkerStartItemOnRemote(startParams.origin, startParams.on)
  const checked =
    startParams.origin !== undefined
      ? await checkedWorkerOrigin(startParams.origin, ctx)
      : undefined
  const prepared = await prepareWorkerStart(
    checked ? { ...startParams, origin: checked.origin } : startParams,
    ctx,
    startFollowUp
  )
  const { params, followUp, coordinator, bindRun, helperCreator, taskDeps, existingTask, withRun } =
    prepared
  const db = runtime.getOrchestrationDb()
  const questionLink =
    params.forQuestion !== undefined
      ? linkWorkerToQuestion(db, params.forQuestion, coordinator, params.on !== undefined)
      : undefined
  const linkedParams =
    questionLink && !questionLink.linked ? { ...params, forQuestion: undefined } : params
  const reminder =
    params.forQuestion === undefined ? openQuestionReminder(db, coordinator) : undefined
  const withLink = <T>(started: T): T =>
    withOpenQuestion(reminder, withQuestionLink(questionLink, started))
  const { mode, chatLineage } = decideStartMode(runtime, db, params, orchestrationCaller, followUp)
  if (params.on) {
    // Remote workers are terminal-only; carry the mode receipt to explain structured-preference fallback.
    const receipt = await startFederatedWorker({
      params: linkedParams,
      runtime,
      db,
      bindRunId: () => bindRun().run.id,
      task: existingTask,
      taskDeps,
      orchestrationMutation,
      callerSession: orchestrationCaller
    })
    await stopHelperAfterStart(runtime, receipt, orchestrationMutation)
    const placed = receipt && typeof receipt === 'object' ? { ...receipt, mode } : receipt
    return withLink(withRun(withKeepOpenDefault(runtime, params.worktree, placed)))
  }
  const receipt = await startLocalWorker({
    params: {
      ...linkedParams,
      timeoutMs: resolveWorkerStartReadinessTimeoutMs(params.timeoutMs),
      host: hostIdentity
    },
    runtime,
    db,
    bindRun: () => bindRun().run,
    taskDeps,
    coordinator,
    callerSession: orchestrationCaller,
    existingTask,
    orchestrationMutation,
    mode,
    chatLineage,
    helperCreator,
    followUp
  })
  await stopHelperAfterStart(runtime, receipt, orchestrationMutation)
  const note = { itemUid: checked?.itemUid, chatLineage, terminal: params.terminal }
  void noteTerminalFallbackOnItem(runtime, note, receipt).catch(warnItemNote)
  const next = withKeepOpenDefault(runtime, params.worktree, withWorkerStartNext(receipt))
  const started = withTerminalUsage(runtime, withLink(withRun(next)))
  return checked && started && typeof started === 'object'
    ? { ...started, linkedItem: checked.linkedItem }
    : started
}

function warnItemNote(error: unknown): void {
  console.warn('[orchestration] item fallback note failed', error)
}
