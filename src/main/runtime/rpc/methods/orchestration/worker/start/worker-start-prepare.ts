import type { RpcContext } from '../../../../core'
import { OrchestrationError } from '../../../../../orchestration/orchestration-error'
import { resolveLocalWorkerGroupPlacement } from './local-worker-group-placement'
import type { WorkerFollowUp } from '../follow-up/worker-follow-up-placement'
import { resolveOrchestrationCaller } from '../../runs/run-scope'
import {
  assertHelperStartScope,
  resolveWorkerStartRun,
  qualifyLiveWorkerFollowUp
} from './admission/worker-start-authority'
import { parseTaskDeps } from './admission/task-deps-argument'
import type { WorkerStartInput } from './worker-start-input'
import { isWorkerStartTimeoutWithinTimerLimit } from '../../../../../../../shared/orchestration/orchestration-timing-budgets'
import { buildOrchestrationTaskDisplayMetadata } from '../../../../../../../shared/orchestration/orchestration-task-display'
import { assertWorkerStartTaskSpecWithinPromptBudget } from './admission/worker-start-prompt-budget'
import { ORCA_SESSION_ADDRESS_PREFIX } from '../../../../../../../shared/agent-session/identity/orca-session-address-prefix'
import { ORCHESTRATION_SESSION_CALLER_ERROR_CODES as SESSION_CODES } from '../../../../../../../shared/orchestration/orchestration-session-caller-codes'
import { resolveDispatchCreator } from '../../runs/dispatch-creator'

export type WorkerStartContext = Pick<
  RpcContext,
  'runtime' | 'orchestrationMutation' | 'orchestrationCompatibilityEvidence' | 'orchestrationCaller'
>

export async function prepareWorkerStart(
  params: WorkerStartInput,
  {
    runtime,
    orchestrationCompatibilityEvidence,
    orchestrationCaller
  }: Omit<WorkerStartContext, 'orchestrationMutation'>,
  followUp?: WorkerFollowUp
) {
  if (!isWorkerStartTimeoutWithinTimerLimit(params.timeoutMs)) {
    throw new OrchestrationError(
      'invalid_argument',
      '--timeout-ms is too large for worker-start transport grace; the derived timeout must fit within the timer limit.'
    )
  }
  if (params.on && params.terminal?.startsWith(ORCA_SESSION_ADDRESS_PREFIX)) {
    throw new OrchestrationError(
      SESSION_CODES.hostBoundary,
      `${params.terminal} names a chat by its Orca session ID, which identifies it only on the host that runs it. Run worker-start on that host. No effects were applied.`,
      { effectsApplied: false }
    )
  }
  if (params.adoptTaskId !== undefined && orchestrationCaller?.kind !== 'peer') {
    throw new OrchestrationError(
      'invalid_argument',
      'Only the paired Orca coordinating a Run names its Task IDs. No effects were applied.',
      { effectsApplied: false }
    )
  }
  params = await resolveLocalWorkerGroupPlacement(runtime, params)
  const placement = params.worktree ?? 'current'
  if (
    params.crossStoreParent &&
    (orchestrationCaller?.kind !== 'peer' || placement !== 'new-child')
  ) {
    throw new OrchestrationError(
      'invalid_argument',
      "Only the paired Orca coordinating a Run names its own workspace as a new-child's parent. No effects were applied.",
      { effectsApplied: false }
    )
  }
  if (
    orchestrationCaller?.kind === 'peer' &&
    !followUp &&
    !params.terminal &&
    !params.crossStoreParent &&
    /^(current|new-child)$/.test(placement)
  ) {
    throw new OrchestrationError(
      'invalid_argument',
      `--on requires an exact remote worktree selector or new-top-level: ${orchestrationCaller.peerRun.home_label} has no workspace on this server for --worktree ${placement}. No effects were applied.`,
      { effectsApplied: false }
    )
  }
  const db = runtime.getOrchestrationDb()
  const coordinator = resolveOrchestrationCaller(runtime, {
    callerTerminalHandle: params.from,
    callerEvidence: orchestrationCompatibilityEvidence,
    callerSession: orchestrationCaller
  })
  if (params.spec) {
    await assertWorkerStartTaskSpecWithinPromptBudget(params.spec)
  }
  const taskDeps = parseTaskDeps(params.deps)
  const qualified = followUp
    ? qualifyLiveWorkerFollowUp(
        runtime,
        coordinator,
        params.from,
        orchestrationCaller,
        params.run!,
        followUp
      )
    : undefined
  const { bindRun, helperCreator } = qualified
    ? { bindRun: () => ({ run: qualified.run, created: false }), helperCreator: qualified.creator }
    : resolveWorkerStartRun(runtime, {
        coordinator,
        from: params.from,
        callerSession: orchestrationCaller,
        runId: params.run,
        objective: params.spec
          ? buildOrchestrationTaskDisplayMetadata({
              spec: params.spec,
              taskTitle: params.taskTitle
            }).taskTitle
          : undefined,
        taskReferences: [...(params.parent ? [params.parent] : []), ...(taskDeps ?? [])]
      })
  const withRun = (receipt: unknown): unknown => {
    if (!receipt || typeof receipt !== 'object') {
      return receipt
    }
    const { run, created } = bindRun()
    return { ...receipt, run: { id: run.id, objective: run.objective, created } }
  }
  const existingTask = params.task ? db.getTask(params.task) : undefined
  if (params.task && (!existingTask || existingTask.run_id !== bindRun().run.id)) {
    throw new OrchestrationError(
      'task_not_found',
      `Task ${params.task} was not found in Run ${bindRun().run.id}.`
    )
  }
  if (helperCreator && !followUp) {
    assertHelperStartScope(db, helperCreator, {
      task: existingTask,
      params,
      ...(followUp ? { followUp } : {})
    })
  }
  if (existingTask) {
    await assertWorkerStartTaskSpecWithinPromptBudget(existingTask.spec)
  }
  if (followUp) {
    const followUpPlacement = await followUp.place(() => {
      if (
        helperCreator &&
        db.resolveCreatorDispatchId(
          resolveDispatchCreator(runtime, params.from, orchestrationCaller)
        ) !== helperCreator.id
      ) {
        throw new OrchestrationError(
          'consumer_fenced',
          `Dispatch ${helperCreator.id} is no longer this caller's active work. No effects were applied.`,
          { effectsApplied: false }
        )
      }
    })
    const spec = [
      params.spec,
      followUpPlacement.delivery === 'started_fresh' ? followUpPlacement.earlierWork : undefined
    ]
      .filter(Boolean)
      .join('\n\n')
    params = {
      ...params,
      worktree: `id:${followUpPlacement.worktreeId}`,
      ...(followUpPlacement.terminal ? { terminal: followUpPlacement.terminal } : {}),
      ...(followUpPlacement.agent ? { agent: followUpPlacement.agent } : {}),
      ...(followUpPlacement.model ? { model: followUpPlacement.model } : {}),
      ...(followUpPlacement.effort ? { effort: followUpPlacement.effort } : {}),
      spec
    }
    followUp = {
      ...followUp,
      reopen: followUpPlacement.reopen,
      earlierWork: followUpPlacement.earlierWork
    }
    await assertWorkerStartTaskSpecWithinPromptBudget(spec)
  }
  return {
    params,
    followUp,
    coordinator,
    bindRun,
    helperCreator,
    taskDeps,
    existingTask,
    withRun
  }
}
