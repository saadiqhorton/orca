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

export type TerminalReader = {
  readTerminal?: (
    handle: string,
    opts?: { screen?: boolean }
  ) => Promise<{ tail?: unknown; screen?: unknown; text?: string }>
  getTerminalProcessIncarnation?: (handle: string) => unknown
}

export type FirstTurnWatchHalt =
  | { status: 'failed'; reason: string }
  | { status: 'settled' }
  | { status: 'progress' }

function terminalHasExited(runtime: TerminalReader, handle: string): boolean {
  return (
    typeof runtime.getTerminalProcessIncarnation === 'function' &&
    runtime.getTerminalProcessIncarnation(handle) == null
  )
}

export async function watchTerminalFirstTurn(
  runtime: TerminalReader,
  handle: string,
  now = Date.now,
  options: {
    deadline?: number
    haltOnProgress?: boolean
  } = {}
): Promise<FirstTurnWatchHalt> {
  if (!runtime.readTerminal) {
    return { status: 'settled' }
  }
  const deadline = options.deadline ?? now() + FIRST_TURN_WATCH_MS
  const haltOnProgress = options.haltOnProgress !== false
  let lastOutput = ''
  let workingSeconds: number | null = null
  while (now() <= deadline) {
    let output = lastOutput
    try {
      const read = await runtime.readTerminal(handle, { screen: true })
      output = flattenTerminalRead(read)
      lastOutput = output
    } catch {
      const reason = classifyAgentLaunchFirstTurnFailure(lastOutput)
      return reason ? { status: 'failed', reason } : { status: 'settled' }
    }
    const reason = classifyAgentLaunchFirstTurnFailure(output)
    if (reason) {
      return { status: 'failed', reason }
    }
    if (isAgentFirstTurnActivity(output) || terminalHasExited(runtime, handle)) {
      return { status: 'settled' }
    }
    if (haltOnProgress && isCodexWorkingTimerProgress(output, workingSeconds)) {
      return { status: 'progress' }
    }
    workingSeconds = readCodexWorkingElapsedSeconds(output) ?? workingSeconds
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const reason = classifyAgentLaunchFirstTurnFailure(lastOutput)
  return reason ? { status: 'failed', reason } : { status: 'settled' }
}

export async function watchTerminalFirstTurnFailure(
  runtime: TerminalReader,
  handle: string,
  now = Date.now
): Promise<string | null> {
  const halt = await watchTerminalFirstTurn(runtime, handle, now)
  return halt.status === 'failed' ? halt.reason : null
}

/** Keep reading after an early ready until real activity, a fatal error, or the original deadline. */
export async function watchRemainingFirstTurnFailure(
  runtime: TerminalReader,
  handle: string,
  now: () => number,
  deadline: number
): Promise<string | null> {
  const halt = await watchTerminalFirstTurn(runtime, handle, now, {
    deadline,
    haltOnProgress: false
  })
  return halt.status === 'failed' ? halt.reason : null
}

export function continueFirstTurnWatchInBackground(args: {
  runtime: TerminalReader
  handle: string
  deadline: number
  now?: () => number
  onFailure?: (reason: string) => void
}): void {
  void watchRemainingFirstTurnFailure(
    args.runtime,
    args.handle,
    args.now ?? Date.now,
    args.deadline
  )
    .then((reason) => {
      if (reason) {
        args.onFailure?.(reason)
      }
    })
    .catch(() => undefined)
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
  const startedAt = now()
  const halt = await watchTerminalFirstTurn(runtime, result.outcome.handle, now)
  if (halt.status === 'failed') {
    return {
      ...result,
      prompt: {
        delivery: prompt?.delivery ?? 'submit',
        outcome: 'agent_blocked_on_prompt',
        blockedReason: agentTurnFailedBlockedReason(halt.reason),
        next: `The agent failed on its first turn (${halt.reason}). This launch is not success; the tab may still be open.`
      }
    }
  }
  if (halt.status === 'progress') {
    continueFirstTurnWatchInBackground({
      runtime,
      handle: result.outcome.handle,
      deadline: startedAt + FIRST_TURN_WATCH_MS,
      now
    })
  }
  return result
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
