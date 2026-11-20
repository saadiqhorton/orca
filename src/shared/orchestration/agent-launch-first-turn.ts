/** First-turn Codex/agent failures that must not report launch success. */

export const AGENT_TURN_FAILED_PREFIX = 'agent_turn_failed'

const FATAL_PATTERNS: readonly { reason: string; pattern: RegExp }[] = [
  { reason: 'model_not_found', pattern: /\bmodel_not_found\b/i },
  { reason: 'unknown_model', pattern: /\bunknown model\b/i },
  { reason: 'invalid_model', pattern: /\binvalid[_ ]model\b/i }
]

/** Real turn work — not the Codex banner that prints before a 400. */
const FIRST_TURN_ACTIVITY = /\b(?:thinking|exploring|i'll|i will|tokens?\s+used|tool[_ ]calls?)\b/i

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

export function agentTurnFailedBlockedReason(reason: string): string {
  return `${AGENT_TURN_FAILED_PREFIX}:${reason}`
}

export function isAgentTurnFailedBlockedReason(reason: string | undefined): boolean {
  return typeof reason === 'string' && reason.startsWith(`${AGENT_TURN_FAILED_PREFIX}:`)
}
