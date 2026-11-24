import type { RuntimeTerminalShow } from '../../shared/terminal/runtime/runtime-terminal-contracts'
import {
  blockedOnPromptNext,
  isStartupSecurityDialogReason,
  startupDialogPromptLabel
} from '../../shared/agent-launch/startup/agent-launch-blocked-prompt'
import { RuntimeClientError } from '../runtime/connection/types'
import type { RuntimeClient } from '../runtime/client'

export async function refuseStartupDialogKeystrokes(
  client: RuntimeClient,
  handle: string,
  flags: ReadonlyMap<string, string | boolean>
): Promise<void> {
  if (flags.get('answer-dialog') === true) {
    return
  }
  let shown: RuntimeTerminalShow | undefined
  try {
    shown = (
      await client.call<{ terminal: RuntimeTerminalShow }>('terminal.show', { terminal: handle })
    ).result.terminal
  } catch {
    return
  }
  const reason = shown?.agentWait?.reason
  if (!isStartupSecurityDialogReason(reason)) {
    return
  }
  throw new RuntimeClientError('agent_blocked_on_prompt', blockedOnPromptNext(reason), {
    handle,
    blockedReason: reason,
    promptText: startupDialogPromptLabel(reason),
    next: blockedOnPromptNext(reason)
  })
}
