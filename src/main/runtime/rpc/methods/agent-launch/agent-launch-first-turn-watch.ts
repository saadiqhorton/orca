import type { AgentLaunchResult } from '../../../../../shared/agent-launch/contracts/agent-launch-intent'
import {
  agentTurnFailedBlockedReason,
  classifyAgentLaunchFirstTurnFailure,
  isAgentFirstTurnActivity,
  isAgentFirstTurnIdle,
  isCodexWorkingTimerProgress,
  readCodexWorkingElapsedSeconds
} from '../../../../../shared/orchestration/agent-launch-first-turn'
import {
  failWorkerFirstTurnByHandle,
  type WorkerFirstTurnFailureRuntime
} from '../orchestration/worker/start/worker-start-first-turn-failure'

/** Long enough for a real Codex API round trip; ends early on turn activity or a fatal error. */
export const FIRST_TURN_WATCH_MS = 20_000

export type TerminalReader = {
  readTerminal?: (
    handle: string,
    opts?: { screen?: boolean }
  ) => Promise<{ tail?: unknown; screen?: unknown; text?: string }>
  getTerminalProcessIncarnation?: (handle: string) => unknown
} & WorkerFirstTurnFailureRuntime

export type FirstTurnWatchHalt =
  | { status: 'failed'; reason: string }
  | { status: 'settled' }
  | { status: 'idle' }
  | { status: 'progress' }

export type AgentLaunchFirstTurnWatch = {
  handle: string
  startedAt: number
  halt: FirstTurnWatchHalt | null
  promise: Promise<FirstTurnWatchHalt>
}

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
    settleOnIdle?: boolean
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
      if (reason) {
        return { status: 'failed', reason }
      }
      const retryMs = Math.min(250, deadline - now())
      if (retryMs <= 0) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, retryMs))
      continue
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
    if (options.settleOnIdle && isAgentFirstTurnIdle(output)) {
      return { status: 'idle' }
    }
    workingSeconds = readCodexWorkingElapsedSeconds(output) ?? workingSeconds
    const waitMs = Math.min(250, deadline - now())
    if (waitMs <= 0) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs))
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

function shouldWatchAgentLaunch(runtime: TerminalReader, result: AgentLaunchResult): boolean {
  const prompt = result.prompt
  return (
    result.outcome.kind === 'terminal' &&
    prompt?.outcome !== 'agent_blocked_on_prompt' &&
    prompt?.outcome !== 'timed_out' &&
    typeof runtime.readTerminal === 'function'
  )
}

function firstTurnFailedLaunch(result: AgentLaunchResult, reason: string): AgentLaunchResult {
  const prompt = result.prompt
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

function reportBackgroundFirstTurnFailure(
  runtime: TerminalReader,
  handle: string,
  reason: string,
  onFailure?: (reason: string) => void
): void {
  onFailure?.(reason)
  failWorkerFirstTurnByHandle({ runtime, handle, reason })
}

function followThroughAgentLaunchWatch(
  runtime: TerminalReader,
  watch: AgentLaunchFirstTurnWatch,
  now: () => number,
  onFailure?: (reason: string) => void
): void {
  void watch.promise
    .then((halt) => {
      if (halt.status === 'failed') {
        reportBackgroundFirstTurnFailure(runtime, watch.handle, halt.reason, onFailure)
        return
      }
      if (halt.status === 'progress' || halt.status === 'idle') {
        continueFirstTurnWatchInBackground({
          runtime,
          handle: watch.handle,
          deadline: watch.startedAt + FIRST_TURN_WATCH_MS,
          now,
          onFailure: (reason) =>
            reportBackgroundFirstTurnFailure(runtime, watch.handle, reason, onFailure)
        })
      }
    })
    .catch(() => undefined)
}

export function beginAgentLaunchFirstTurnWatch(
  runtime: TerminalReader,
  result: AgentLaunchResult,
  now = Date.now
): AgentLaunchFirstTurnWatch | null {
  if (!shouldWatchAgentLaunch(runtime, result)) {
    return null
  }
  const handle = result.outcome.kind === 'terminal' ? result.outcome.handle : ''
  const watch: AgentLaunchFirstTurnWatch = {
    handle,
    startedAt: now(),
    halt: null,
    promise: Promise.resolve({ status: 'settled' })
  }
  watch.promise = watchTerminalFirstTurn(runtime, handle, now).then((halt) => {
    watch.halt = halt
    return halt
  })
  return watch
}

export async function finishAgentLaunchFirstTurnWatch(
  runtime: TerminalReader,
  result: AgentLaunchResult,
  watch: AgentLaunchFirstTurnWatch | null,
  now = Date.now,
  onFailure?: (reason: string) => void
): Promise<AgentLaunchResult> {
  if (!shouldWatchAgentLaunch(runtime, result)) {
    return result
  }
  await Promise.resolve()
  if (watch?.halt?.status === 'failed') {
    return firstTurnFailedLaunch(result, watch.halt.reason)
  }
  if (watch) {
    followThroughAgentLaunchWatch(runtime, watch, now, onFailure)
    return result
  }
  return watchAgentLaunchFirstTurn(runtime, result, now, onFailure)
}

export async function watchAgentLaunchFirstTurn(
  runtime: TerminalReader,
  result: AgentLaunchResult,
  now = Date.now,
  onFailure?: (reason: string) => void
): Promise<AgentLaunchResult> {
  if (!shouldWatchAgentLaunch(runtime, result)) {
    return result
  }
  const handle = result.outcome.kind === 'terminal' ? result.outcome.handle : ''
  const startedAt = now()
  const halt = await watchTerminalFirstTurn(runtime, handle, now, { settleOnIdle: true })
  if (halt.status === 'failed') {
    return firstTurnFailedLaunch(result, halt.reason)
  }
  if (halt.status === 'progress' || halt.status === 'idle') {
    continueFirstTurnWatchInBackground({
      runtime,
      handle,
      deadline: startedAt + FIRST_TURN_WATCH_MS,
      now,
      onFailure: (reason) =>
        reportBackgroundFirstTurnFailure(runtime, handle, reason, onFailure)
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
