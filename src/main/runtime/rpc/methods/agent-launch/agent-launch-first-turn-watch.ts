import type { AgentLaunchResult } from '../../../../../shared/agent-launch/contracts/agent-launch-intent'
import {
  agentTurnFailedBlockedReason,
  classifyAgentLaunchFirstTurnFailure,
  isAgentFirstTurnActivity,
  isCodexWorkingTimerProgress,
  readCodexWorkingElapsedSeconds
} from '../../../../../shared/orchestration/agent-launch-first-turn'

/** Long enough for a real Codex API round trip; ends early on turn activity or a fatal error. */
export const FIRST_TURN_WATCH_MS = 20_000

type TerminalReader = {
  readTerminal?: (
    handle: string,
    opts?: { screen?: boolean }
  ) => Promise<{ tail?: unknown; screen?: unknown; text?: string }>
  getTerminalProcessIncarnation?: (handle: string) => unknown
}

function terminalHasExited(runtime: TerminalReader, handle: string): boolean {
  return (
    typeof runtime.getTerminalProcessIncarnation === 'function' &&
    runtime.getTerminalProcessIncarnation(handle) == null
  )
}

export async function watchTerminalFirstTurnFailure(
  runtime: TerminalReader,
  handle: string,
  now = Date.now
): Promise<string | null> {
  if (!runtime.readTerminal) {
    return null
  }
  const deadline = now() + FIRST_TURN_WATCH_MS
  let lastOutput = ''
  let workingSeconds: number | null = null
  while (now() <= deadline) {
    let output = lastOutput
    try {
      const read = await runtime.readTerminal(handle, { screen: true })
      output = flattenTerminalRead(read)
      lastOutput = output
    } catch {
      return classifyAgentLaunchFirstTurnFailure(lastOutput)
    }
    const reason = classifyAgentLaunchFirstTurnFailure(output)
    if (reason) {
      return reason
    }
    if (
      isAgentFirstTurnActivity(output) ||
      isCodexWorkingTimerProgress(output, workingSeconds) ||
      terminalHasExited(runtime, handle)
    ) {
      return null
    }
    workingSeconds = readCodexWorkingElapsedSeconds(output) ?? workingSeconds
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return classifyAgentLaunchFirstTurnFailure(lastOutput)
}

export async function watchAgentLaunchFirstTurn(
  runtime: TerminalReader,
  result: AgentLaunchResult,
  now = Date.now
): Promise<AgentLaunchResult> {
  const prompt = result.prompt
  if (
    result.outcome.kind !== 'terminal' ||
    prompt?.outcome === 'agent_blocked_on_prompt' ||
    prompt?.outcome === 'timed_out' ||
    !runtime.readTerminal
  ) {
    return result
  }
  const reason = await watchTerminalFirstTurnFailure(runtime, result.outcome.handle, now)
  if (!reason) {
    return result
  }
  return {
    ...result,
    prompt: {
      delivery: prompt?.delivery ?? 'submit',
      outcome: 'agent_blocked_on_prompt',
      blockedReason: agentTurnFailedBlockedReason(reason),
      next: `The agent failed on its first turn (${reason}). This launch is not success; the tab may still be open.`
    }
  }
}

function flattenTerminalRead(read: { tail?: unknown; screen?: unknown; text?: string }): string {
  if (typeof read.text === 'string') {
    return read.text
  }
  return [read.screen, read.tail]
    .flatMap((value) => (Array.isArray(value) ? value : value == null ? [] : [value]))
    .map((chunk) => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk)))
    .join('\n')
}
