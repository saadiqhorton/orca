import { describe, expect, it } from 'vitest'
import {
  agentTurnFailedBlockedReason,
  classifyAgentLaunchFirstTurnFailure
} from './agent-launch-first-turn'

describe('classifyAgentLaunchFirstTurnFailure', () => {
  it('treats Codex model_not_found as a fatal first turn', () => {
    expect(
      classifyAgentLaunchFirstTurnFailure(
        'ERROR: 400 model_not_found: gpt-6-luna is not a known model'
      )
    ).toBe('model_not_found')
    expect(agentTurnFailedBlockedReason('model_not_found')).toBe(
      'agent_turn_failed:model_not_found'
    )
  })

  it('ignores ordinary agent output', () => {
    expect(classifyAgentLaunchFirstTurnFailure('thinking about the repo')).toBeNull()
    expect(classifyAgentLaunchFirstTurnFailure('')).toBeNull()
  })
})
