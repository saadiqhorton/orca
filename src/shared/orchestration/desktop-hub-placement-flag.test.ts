import { describe, expect, it } from 'vitest'
import { desktopHubSelector } from './desktop-hub-contract'
import { remotePlacementFlag, remoteWorktreeRequiredMessage } from './desktop-hub-placement-flag'

describe('remotePlacementFlag', () => {
  it('names --host after the hub rewrites it to a dhub selector', () => {
    expect(remotePlacementFlag({ on: desktopHubSelector('env-ubuntu') })).toBe('--host')
    expect(remotePlacementFlag({ host: 'ubuntu-server-local' })).toBe('--host')
    expect(remotePlacementFlag({ on: 'paired-server' })).toBe('--on')
  })

  it('tells --host callers to pass a path on that host', () => {
    expect(remoteWorktreeRequiredMessage({ on: desktopHubSelector('env-ubuntu') })).toContain(
      '--host requires --worktree path:'
    )
    expect(remoteWorktreeRequiredMessage({ on: 'paired' })).toContain('--on requires')
  })
})
