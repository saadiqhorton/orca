import { OrchestrationError } from '../../../../../orchestration/orchestration-error'
import {
  blockedOnPromptNext,
  isStartupDialogBlockedReason,
  startupDialogPromptLabel
} from '../../../../../../../shared/agent-launch/startup/agent-launch-blocked-prompt'

export function throwIfWorkerStartBlockedOnPrompt(
  blockedReason: string | undefined,
  handle: string
): void {
  if (!isStartupDialogBlockedReason(blockedReason)) {
    return
  }
  throw new OrchestrationError('agent_blocked_on_prompt', blockedOnPromptNext(blockedReason), {
    handle,
    blockedReason,
    promptText: startupDialogPromptLabel(blockedReason),
    next: blockedOnPromptNext(blockedReason)
  })
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
