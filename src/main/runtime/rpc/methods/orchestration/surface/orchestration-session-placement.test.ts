import { describe, expect, it } from 'vitest'
import { resolveOrchestrationSessionPlacement } from './orchestration-session-placement'

const home = '/home/tester'

function runtimeWith(options: {
  worktrees: { id: string; hostId?: string; lastActivityAt?: number }[]
  folders: { id: string; folderPath: string; lastActivityAt: number; executionHostId?: string }[]
}) {
  return {
    listVisibleProjectGroups: () => [],
    listVisibleFolderWorkspaces: () =>
      options.folders.map((folder) => ({
        name: folder.id,
        projectGroupId: 'group',
        isArchived: false,
        ...folder
      })),
    listManagedWorktrees: async () => ({ worktrees: options.worktrees }),
    createProjectGroup: async () => {
      throw new Error('unexpected')
    },
    createFolderWorkspace: async () => {
      throw new Error('unexpected')
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test fake supplies only the members placement reads.
  } as unknown as Parameters<typeof resolveOrchestrationSessionPlacement>[0]
}

describe('resolveOrchestrationSessionPlacement', () => {
  it('places on the most recently active non-scratch workspace of this host', async () => {
    const placed = await resolveOrchestrationSessionPlacement(
      runtimeWith({
        worktrees: [
          { id: 'repo::/a', lastActivityAt: 100 },
          { id: 'repo::/remote', hostId: 'ssh:other', lastActivityAt: 900 }
        ],
        folders: [
          { id: 'fld_recent', folderPath: '/home/tester/notes', lastActivityAt: 500 },
          {
            id: 'fld_scratch',
            folderPath: '/home/tester/orca-orchestration/scratch',
            lastActivityAt: 999
          }
        ]
      }),
      home
    )
    expect(placed).toEqual({ worktree: 'folder:fld_recent', source: 'recent-folder' })
  })
})
