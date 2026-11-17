import { describe, expect, it } from 'vitest'
import { RuntimeClientError } from '../runtime/types'
import { assertAgentLaunchPromptDelivered, formatAgentLaunch } from './agent-launch-request'
import type { AgentLaunchResult } from '../../shared/agent-launch/contracts/agent-launch-intent'

const launched = {
  outcome: { kind: 'terminal' as const, handle: 'term_blocked' },
  worktreeId: 'folder:fld_1',
  receipt: {
    mode: 'terminal' as const,
    preferred: 'terminal' as const,
    reason: 'user_default' as const,
    detail: 'terminal'
  },
  prompt: {
    delivery: 'submit' as const,
    outcome: 'agent_blocked_on_prompt' as const,
    blockedReason: 'agent-hooks-review-prompt',
    promptText: 'Hooks need review',
    next: 'open the tab'
  }
} satisfies AgentLaunchResult

describe('assertAgentLaunchPromptDelivered', () => {
  it('exits as agent_blocked_on_prompt and never prints handed-to-terminal', () => {
    expect(formatAgentLaunch(launched)).toContain('agent_blocked_on_prompt')
    expect(formatAgentLaunch(launched)).not.toContain('handed-to-terminal')
    expect(() => assertAgentLaunchPromptDelivered(launched)).toThrow(RuntimeClientError)
    try {
      assertAgentLaunchPromptDelivered(launched)
    } catch (error) {
      expect(error).toMatchObject({
        code: 'agent_blocked_on_prompt',
        data: expect.objectContaining({ handle: 'term_blocked' })
      })
    }
  })
})
