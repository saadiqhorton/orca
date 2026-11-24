import { describe, expect, it, vi } from 'vitest'
import { promptDisposalFromWait, waitForStartedAgentReady } from './agent-launch-terminal-prompt'
import type { RuntimeTerminalWait } from '../../../../../shared/terminal/runtime/runtime-terminal-contracts'

vi.mock('../../../terminal/wait/launched-agent-composer-readiness', () => ({
  waitForLaunchedAgentComposer: vi.fn(async () => ({
    handle: 'term_hooks',
    condition: 'tui-idle',
    satisfied: false,
    status: 'running',
    blockedReason: 'agent-hooks-review-prompt',
    exitCode: null
  }))
}))

describe('launch readiness blocked on a startup dialog', () => {
  it('maps hooks review to agent_blocked_on_prompt, not a delivered prompt', () => {
    const wait: RuntimeTerminalWait = {
      handle: 'term_hooks',
      condition: 'tui-idle',
      satisfied: false,
      status: 'running',
      blockedReason: 'agent-hooks-review-prompt',
      exitCode: null
    }
    expect(promptDisposalFromWait(wait)).toMatchObject({
      outcome: 'agent_blocked_on_prompt',
      blockedReason: 'agent-hooks-review-prompt',
      promptText: 'Hooks need review'
    })
  })

  it('maps an unsatisfied wait without a dialog to timed_out', () => {
    const wait: RuntimeTerminalWait = {
      handle: 'term_slow',
      condition: 'tui-idle',
      satisfied: false,
      status: 'running',
      exitCode: null
    }
    expect(promptDisposalFromWait(wait)).toMatchObject({ outcome: 'timed_out' })
  })

  it('returns immediately when the composer is on Hooks need review', async () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: waitForLaunchedAgentComposer is mocked; the runtime is unused.
    const wait = await waitForStartedAgentReady({} as never, 'term_hooks', 'codex')
    expect(wait?.blockedReason).toBe('agent-hooks-review-prompt')
    expect(wait?.satisfied).toBe(false)
  })
})
