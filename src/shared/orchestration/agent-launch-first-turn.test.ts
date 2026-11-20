import { describe, expect, it } from 'vitest'
import {
  agentTurnFailedBlockedReason,
  classifyAgentLaunchFirstTurnFailure,
  isAgentFirstTurnActivity,
  isCodexWorkingTimerProgress,
  readCodexWorkingElapsedSeconds
} from './agent-launch-first-turn'

const CODEX_BANNER = `>_ OpenAI Codex (v0.154.0)
  model: gpt-6-luna
  To get started, describe a task`

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

  it('does not treat the Codex banner as a fatal error or as turn activity', () => {
    expect(classifyAgentLaunchFirstTurnFailure(CODEX_BANNER)).toBeNull()
    expect(isAgentFirstTurnActivity(CODEX_BANNER)).toBe(false)
  })

  it('treats thinking as first-turn activity', () => {
    expect(isAgentFirstTurnActivity('thinking about the repo')).toBe(true)
  })

  it('does not treat Working as first-turn activity', () => {
    expect(
      isAgentFirstTurnActivity(
        '>_ OpenAI Codex (v0.154.0)\nTASK submitted\nWorking'
      )
    ).toBe(false)
    expect(
      isAgentFirstTurnActivity('• Working (0s • 0 tokens)')
    ).toBe(false)
  })

  it('reads Codex Working timer seconds and treats an advancing timer as progress', () => {
    expect(readCodexWorkingElapsedSeconds('• Working (0s • esc to interrupt)')).toBe(0)
    expect(readCodexWorkingElapsedSeconds('• Working (3s • 12 tokens)')).toBe(3)
    expect(isCodexWorkingTimerProgress('• Working (3s • 12 tokens)', null)).toBe(false)
    expect(isCodexWorkingTimerProgress('• Working (2s • 12 tokens)', 1)).toBe(false)
    expect(isCodexWorkingTimerProgress('• Working (3s • 12 tokens)', 2)).toBe(true)
    expect(
      isCodexWorkingTimerProgress(
        'ERROR: 400 model_not_found gpt-5.4\n• Working (5s)',
        4
      )
    ).toBe(false)
  })
})
