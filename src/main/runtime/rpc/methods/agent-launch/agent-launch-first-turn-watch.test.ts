import { describe, expect, it } from 'vitest'
import { watchAgentLaunchFirstTurn } from './agent-launch-first-turn-watch'
import type { AgentLaunchResult } from '../../../../../shared/agent-launch/contracts/agent-launch-intent'

function launched(): AgentLaunchResult {
  return {
    outcome: { kind: 'terminal', handle: 'term_codex' },
    worktreeId: 'folder:fld_1',
    receipt: {
      mode: 'terminal',
      preferred: 'terminal',
      reason: 'requested',
      detail: 'fixture'
    },
    prompt: { delivery: 'submit', outcome: 'handed-to-terminal' }
  }
}

describe('watchAgentLaunchFirstTurn', () => {
  it('fails launch when the first screen is model_not_found', async () => {
    const result = await watchAgentLaunchFirstTurn(
      {
        readTerminal: async () => ({
          text: 'ERROR: 400 model_not_found gpt-6-luna'
        })
      },
      launched()
    )
    expect(result.prompt).toMatchObject({
      outcome: 'agent_blocked_on_prompt',
      blockedReason: 'agent_turn_failed:model_not_found'
    })
  })

  it('keeps a successful first turn', async () => {
    const result = await watchAgentLaunchFirstTurn(
      { readTerminal: async () => ({ text: 'thinking about the repo' }) },
      launched()
    )
    expect(result.prompt?.outcome).toBe('handed-to-terminal')
  })

  it('fails when model_not_found arrives after the Codex banner', async () => {
    const screens = [
      '>_ OpenAI Codex (v0.154.0)\n  model: gpt-6-luna\n  To get started, describe a task',
      '>_ OpenAI Codex (v0.154.0)\n  model: gpt-6-luna\nERROR: 400 model_not_found gpt-6-luna'
    ]
    let i = 0
    const result = await watchAgentLaunchFirstTurn(
      {
        readTerminal: async () => ({
          text: screens[Math.min(i++, screens.length - 1)] ?? screens[0]!
        })
      },
      launched()
    )
    expect(result.prompt).toMatchObject({
      outcome: 'agent_blocked_on_prompt',
      blockedReason: 'agent_turn_failed:model_not_found'
    })
  })
})
