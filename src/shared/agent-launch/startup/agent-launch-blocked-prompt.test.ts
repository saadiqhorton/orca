import { describe, expect, it } from 'vitest'
import {
  blockedOnPromptDisposal,
  isStartupDialogBlockedReason,
  isStartupSecurityDialogReason,
  startupDialogPromptLabel
} from './agent-launch-blocked-prompt'

describe('startup dialog classification', () => {
  it('treats Codex hooks and Claude trust as blocking security dialogs', () => {
    expect(isStartupDialogBlockedReason('agent-hooks-review-prompt')).toBe(true)
    expect(isStartupSecurityDialogReason('agent-hooks-review-prompt')).toBe(true)
    expect(isStartupSecurityDialogReason('agent-trust-workspace')).toBe(true)
    expect(isStartupSecurityDialogReason('agent-startup-menu-prompt')).toBe(true)
    expect(isStartupSecurityDialogReason('agent-interactive-prompt')).toBe(false)
  })

  it('never describes a blocked launch as delivered', () => {
    const disposal = blockedOnPromptDisposal('agent-hooks-review-prompt', {
      promptText: 'Hooks need review',
      host: 'ubuntu-server-local'
    })
    expect(disposal.outcome).toBe('agent_blocked_on_prompt')
    expect(disposal.promptText).toBe('Hooks need review')
    expect(disposal.next).toContain('ubuntu-server-local')
    expect(disposal.next).toContain(
      'Never answer trust, hooks, or security prompts with keystrokes'
    )
    expect(startupDialogPromptLabel('agent-hooks-review-prompt')).toBe('Hooks need review')
  })
})
