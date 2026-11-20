/** First-turn Codex/agent failures that must not report launch success. */

export const AGENT_TURN_FAILED_PREFIX = 'agent_turn_failed'

const FATAL_PATTERNS: readonly { reason: string; pattern: RegExp }[] = [
  { reason: 'model_not_found', pattern: /\bmodel_not_found\b/i },
  { reason: 'unknown_model', pattern: /\bunknown model\b/i },
  { reason: 'invalid_model', pattern: /\binvalid[_ ]model\b/i }
]

/** Real turn work — not a status timer that can precede a 400. */
const FIRST_TURN_ACTIVITY = /\b(?:thinking|exploring|i'll|i will|tokens?\s+used|tool[_ ]calls?)\b/i
/** Codex `Working (Ns)`, Claude `✻ Verb… (Ns · esc to interrupt)`, or any interrupt timer. */
const ELAPSED_STATUS_LINE = /(?:Working|\u273B|interrupt)/i
const WORKING_TIMER_PROGRESS_S = 3

export function classifyAgentLaunchFirstTurnFailure(output: string): string | null {
  const text = output.trim()
  if (!text) {
    return null
  }
  for (const { reason, pattern } of FATAL_PATTERNS) {
    if (pattern.test(text)) {
      return reason
    }
  }
  if (/\b400\b/.test(text) && /\bmodel\b/i.test(text) && /\bnot found\b/i.test(text)) {
    return 'model_not_found'
  }
  return null
}

export function isAgentFirstTurnActivity(output: string): boolean {
  const text = output.trim()
  if (!text || classifyAgentLaunchFirstTurnFailure(text)) {
    return false
  }
  return FIRST_TURN_ACTIVITY.test(text)
}

export function readCodexWorkingElapsedSeconds(output: string): number | null {
  let max: number | null = null
  for (const line of output.split(/\r?\n/)) {
    if (!ELAPSED_STATUS_LINE.test(line)) {
      continue
    }
    for (const match of line.matchAll(/\((\d+)\s*s\b/gi)) {
      const seconds = Number(match[1])
      if (max === null || seconds > max) {
        max = seconds
      }
    }
  }
  return max
}

/** True once a known agent's elapsed-seconds status line has advanced past a few seconds. */
export function isCodexWorkingTimerProgress(
  output: string,
  previousSeconds: number | null
): boolean {
  if (classifyAgentLaunchFirstTurnFailure(output)) {
    return false
  }
  const seconds = readCodexWorkingElapsedSeconds(output)
  return (
    seconds !== null &&
    previousSeconds !== null &&
    seconds > previousSeconds &&
    seconds >= WORKING_TIMER_PROGRESS_S
  )
}

export function agentTurnFailedBlockedReason(reason: string): string {
  return `${AGENT_TURN_FAILED_PREFIX}:${reason}`
}

export function isAgentTurnFailedBlockedReason(reason: string | undefined): boolean {
  return typeof reason === 'string' && reason.startsWith(`${AGENT_TURN_FAILED_PREFIX}:`)
}
