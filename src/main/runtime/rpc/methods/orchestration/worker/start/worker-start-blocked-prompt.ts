import { OrchestrationError } from '../../../../../orchestration/orchestration-error'
import {
  blockedOnPromptNext,
  isStartupDialogBlockedReason,
  startupDialogPromptLabel
} from '../../../../../../../shared/agent-launch/startup/agent-launch-blocked-prompt'
import {
  agentTurnFailedBlockedReason,
  isAgentTurnFailedBlockedReason
} from '../../../../../../../shared/orchestration/agent-launch-first-turn'
import {
  watchTerminalFirstTurn,
  type TerminalReader
} from '../../../agent-launch/agent-launch-first-turn-watch'

type FirstTurnRuntime = TerminalReader

export type WorkerStartBlockedPromptIdentity = {
  dispatchId?: string
  host?: string
}

function blockedWorkerNext(blockedReason: string): string {
  if (isAgentTurnFailedBlockedReason(blockedReason)) {
    const reason = blockedReason.slice(blockedReason.indexOf(':') + 1)
    return `The agent failed on its first turn (${reason}). This worker is not success; the tab may still be open.`
  }
  return blockedOnPromptNext(blockedReason)
}

function blockedPromptData(
  handle: string,
  blockedReason: string,
  identity?: WorkerStartBlockedPromptIdentity
): Record<string, unknown> {
  const next = blockedWorkerNext(blockedReason)
  return {
    handle,
    blockedReason,
    promptText: startupDialogPromptLabel(blockedReason),
    next,
    ...(identity?.dispatchId ? { dispatchId: identity.dispatchId } : {}),
    ...(identity?.host ? { host: identity.host } : {})
  }
}

export function throwIfWorkerStartBlockedOnPrompt(
  blockedReason: string | undefined,
  handle: string,
  identity?: WorkerStartBlockedPromptIdentity
): void {
  if (typeof blockedReason !== 'string') {
    return
  }
  if (
    !isStartupDialogBlockedReason(blockedReason) &&
    !isAgentTurnFailedBlockedReason(blockedReason)
  ) {
    return
  }
  const data = blockedPromptData(handle, blockedReason, identity)
  throw new OrchestrationError('agent_blocked_on_prompt', String(data.next), data)
}

/** Returns true when only a status timer advanced — keep watching after ready. */
export async function throwIfWorkerFirstTurnFailed(
  runtime: FirstTurnRuntime,
  handle: string,
  now = Date.now,
  identity?: WorkerStartBlockedPromptIdentity
): Promise<boolean> {
  const halt = await watchTerminalFirstTurn(runtime, handle, now)
  if (halt.status === 'failed') {
    throwIfWorkerStartBlockedOnPrompt(agentTurnFailedBlockedReason(halt.reason), handle, identity)
  }
  return halt.status === 'progress'
}

export function withWorkerStartBlockedPromptIdentity(
  error: unknown,
  identity: WorkerStartBlockedPromptIdentity & { handle?: string }
): unknown {
  if (!isWorkerStartBlockedPromptError(error)) {
    return error
  }
  const data =
    error.data && typeof error.data === 'object'
      ? { ...(error.data as Record<string, unknown>) }
      : {}
  return new OrchestrationError(error.code, error.message, {
    ...data,
    ...(identity.dispatchId ? { dispatchId: identity.dispatchId } : {}),
    ...(identity.handle ? { handle: identity.handle } : {}),
    ...(identity.host ? { host: identity.host } : {})
  })
}

export async function persistWorkerFirstTurnFailure(
  error: unknown,
  persist: () => unknown
): Promise<void> {
  const reason = workerStartBlockedPromptReason(error)
  if (!reason || !isAgentTurnFailedBlockedReason(reason)) {
    return
  }
  await persist()
}

export async function settleCaughtWorkerStartError<T>(
  error: unknown,
  persist: () => T | Promise<T>
): Promise<T> {
  if (isWorkerStartBlockedPromptError(error)) {
    await persistWorkerFirstTurnFailure(error, persist)
    throw error
  }
  return persist()
}

export function isWorkerStartBlockedPromptError(error: unknown): error is OrchestrationError {
  return error instanceof OrchestrationError && error.code === 'agent_blocked_on_prompt'
}

export function workerStartBlockedPromptReason(error: unknown): string | null {
  if (!isWorkerStartBlockedPromptError(error)) {
    return null
  }
  const data: unknown = error.data
  return data &&
    typeof data === 'object' &&
    'blockedReason' in data &&
    typeof data.blockedReason === 'string'
    ? data.blockedReason
    : null
}
