import { describe, expect, it } from 'vitest'
import { getHeadlessMobileSessionGroupId } from './mobile-session-layout-projection'

describe('R08 reverse worker-start group id', () => {
  it('does not hide folder: scratch under headless-terminals:', () => {
    const group = getHeadlessMobileSessionGroupId('folder:fld_dockhand')
    expect(group.startsWith('headless-terminals:')).toBe(false)
    expect(group).toBe('orca-orchestration:folder:fld_dockhand')
  })

  it('keeps non-folder worktrees on the headless id', () => {
    expect(getHeadlessMobileSessionGroupId('wt_abc')).toBe('headless-terminals:wt_abc')
  })
})
