import { describe, expect, it } from 'vitest'
import { describeTerminalWaitBlockedReason } from './terminal-wait-blocked-reason-legacy-alias'

describe('describeTerminalWaitBlockedReason', () => {
  it('tells the operator to open Claude trust and startup menus in the desktop window', () => {
    expect(describeTerminalWaitBlockedReason('agent-trust-workspace')).toContain(
      'Open the tab in the desktop Orca window'
    )
    expect(describeTerminalWaitBlockedReason('agent-startup-menu-prompt')).toContain(
      'Open the tab in the desktop Orca window'
    )
  })

  it('tells the operator Codex hooks review cannot be answered by send', () => {
    expect(describeTerminalWaitBlockedReason('agent-hooks-review-prompt')).toContain(
      'send cannot pass this'
    )
    expect(describeTerminalWaitBlockedReason('agent-hooks-review-prompt')).toContain(
      'Open the tab in the desktop Orca window'
    )
  })
})
