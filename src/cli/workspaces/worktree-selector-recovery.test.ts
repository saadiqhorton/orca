import { describe, expect, it } from 'vitest'
import { worktreeSelectorRecovery } from './worktree-selector-recovery'

describe('worktreeSelectorRecovery', () => {
  it('explains a folder: id that is listed but whose record is missing', () => {
    const recovery = worktreeSelectorRecovery('folder:27940437')
    expect(recovery).toBeDefined()
    if (!recovery) {
      return
    }
    expect(recovery.nextSteps.join('\n')).toContain('missing from this host')
    expect(recovery.nextSteps.join('\n')).toContain('group:"<project-group-name>"')
    expect(recovery.validSelectorForms).toContain('group:"<project-group-name>"')
  })
})
