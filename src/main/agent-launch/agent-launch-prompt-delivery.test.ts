import { describe, expect, it, vi } from 'vitest'
import { settleLaunchPromptDisposal } from './agent-launch-prompt-delivery'
import type { AgentLaunchSurfaceExecution } from './agent-launch-execution'
import { blockedOnPromptDisposal } from '../../shared/agent-launch/startup/agent-launch-blocked-prompt'

describe('settleLaunchPromptDisposal', () => {
  it('never reports handed-to-terminal when argv-carried prompt is blocked on hooks review', async () => {
    const observeStartupPrompt = vi.fn(async () =>
      blockedOnPromptDisposal('agent-hooks-review-prompt', {
        promptText: 'Hooks need review'
      })
    )
    const execution = {
      intent: { agent: 'codex', prompt: { text: 'review the deploy', delivery: 'submit' } },
      surfaces: { observeStartupPrompt }
    } as unknown as AgentLaunchSurfaceExecution
    const disposal = await settleLaunchPromptDisposal(execution, {
      outcome: { kind: 'terminal', handle: 'term_blocked' },
      promptRodeLaunchCommand: true
    })
    expect(observeStartupPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ handle: 'term_blocked', agent: 'codex' })
    )
    expect(disposal).toMatchObject({
      outcome: 'agent_blocked_on_prompt',
      blockedReason: 'agent-hooks-review-prompt',
      promptText: 'Hooks need review'
    })
  })
})
