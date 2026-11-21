import { describe, expect, it } from 'vitest'
import {
  describeGroupMemberCandidates,
  folderWorktreeSelector,
  formatGroupWorktreeSelector,
  parseGroupWorktreeSelector,
  repoWorktreeSelector,
  resolveUniqueGroupMember,
  type InventoryProjectGroup
} from './orchestration-group-selector'

const dockhand: InventoryProjectGroup = {
  id: 'd51c5999',
  name: 'dockhand group',
  parentPath: '/home/clawd',
  members: [
    {
      kind: 'repo',
      id: '1a093718',
      name: 'clawd',
      path: '/home/clawd',
      selector: 'id:1a093718::/home/clawd',
      projectGroupId: 'd51c5999',
      projectGroupName: 'dockhand group'
    }
  ]
}

describe('group worktree selectors', () => {
  it('parses group: names with optional quotes', () => {
    expect(parseGroupWorktreeSelector('group:dockhand group')).toBe('dockhand group')
    expect(parseGroupWorktreeSelector('group:"dockhand group"')).toBe('dockhand group')
    expect(parseGroupWorktreeSelector('folder:abc')).toBeUndefined()
    expect(formatGroupWorktreeSelector('dockhand group')).toBe('group:dockhand group')
    expect(repoWorktreeSelector('1a093718', '/home/clawd')).toBe('id:1a093718::/home/clawd')
    expect(folderWorktreeSelector('fld_1')).toBe('folder:fld_1')
  })

  it('resolves a uniquely named group to its one workspace', () => {
    expect(resolveUniqueGroupMember([dockhand], 'dockhand group')).toEqual({
      status: 'unique',
      member: dockhand.members[0],
      members: [dockhand.members[0]]
    })
    expect(resolveUniqueGroupMember([dockhand], 'missing')).toEqual({
      status: 'missing',
      members: []
    })
  })

  it('lists candidates when a group has several workspaces', () => {
    const split: InventoryProjectGroup = {
      ...dockhand,
      members: [
        dockhand.members[0]!,
        {
          kind: 'folder',
          id: 'fld_extra',
          name: 'notes',
          path: '/home/clawd/notes',
          selector: 'folder:fld_extra',
          projectGroupId: 'd51c5999',
          projectGroupName: 'dockhand group'
        }
      ]
    }
    const resolved = resolveUniqueGroupMember([split], 'dockhand group')
    expect(resolved.status).toBe('ambiguous')
    expect(describeGroupMemberCandidates('dockhand group', resolved.members)).toContain(
      'folder:fld_extra'
    )
  })
})
