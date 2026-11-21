import { describe, expect, it } from 'vitest'
import { ROOT_HELP_TEXT_SECONDARY } from './root-help-text-secondary'

describe('root help exit codes', () => {
  it('documents orchestration/terminal/agent/host family codes 2-6', () => {
    expect(ROOT_HELP_TEXT_SECONDARY).toContain(
      'Exit Codes (orchestration, terminal, agent, host commands):'
    )
    expect(ROOT_HELP_TEXT_SECONDARY).toContain('2 host_mismatch')
    expect(ROOT_HELP_TEXT_SECONDARY).toContain('3 unknown_host')
    expect(ROOT_HELP_TEXT_SECONDARY).toContain('4 host_unreachable')
    expect(ROOT_HELP_TEXT_SECONDARY).toContain('5 agent_blocked_on_prompt')
    expect(ROOT_HELP_TEXT_SECONDARY).toContain('6 incompatible_runtime')
  })
})
