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
import { watchTerminalFirstTurnFailure } from '../../../agent-launch/agent-launch-first-turn-watch'

type FirstTurnRuntime = Parameters<typeof watchTerminalFirstTurnFailure>[0]

function blockedWorkerNext(blockedReason: string): string {
  if (isAgentTurnFailedBlockedReason(blockedReason)) {
    const reason = blockedReason.slice(blockedReason.indexOf(':') + 1)
    return `The agent failed on its first turn (${reason}). This worker is not success; the tab may still be open.`
  }
  return blockedOnPromptNext(blockedReason)
}

export function throwIfWorkerStartBlockedOnPrompt(
  blockedReason: string | undefined,
  handle: string
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
  const next = blockedWorkerNext(blockedReason)
  throw new OrchestrationError('agent_blocked_on_prompt', next, {
    handle,
    blockedReason,
    promptText: startupDialogPromptLabel(blockedReason),
    next
  })
}

export async function throwIfWorkerFirstTurnFailed(
  runtime: FirstTurnRuntime,
  handle: string
): Promise<void> {
  const reason = await watchTerminalFirstTurnFailure(runtime, handle)
  if (!reason) {
    return
  }
  throwIfWorkerStartBlockedOnPrompt(agentTurnFailedBlockedReason(reason), handle)
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
