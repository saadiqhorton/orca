import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveOrchestrationSessionPlacement } from './orchestration-session-placement'

const homes: string[] = []

afterEach(async () => {
  await Promise.all(homes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function runtimeWith(
  home: string,
  extras: {
    groups?: { id: string; name: string; parentPath: string | null }[]
    repos?: {
      id: string
      path: string
      displayName?: string
      projectGroupId?: string | null
    }[]
  } = {}
) {
  const groups: { id: string; name: string; parentPath: string | null }[] = extras.groups ?? []
  const folders: { id: string; name: string; folderPath: string; projectGroupId: string }[] = [
    {
      id: 'fld_work',
      name: 'work',
      folderPath: path.join(home, 'work'),
      projectGroupId: 'grp_hidden'
    }
  ]
  return {
    listVisibleProjectGroups: () => groups,
    listVisibleFolderWorkspaces: () => folders,
    listVisibleRepos: () => extras.repos ?? [],
    listManagedWorktrees: async () => ({
      worktrees: [{ id: `repo::${path.join(home, 'work')}`, lastActivityAt: 9_999 }]
    }),
    createProjectGroup: async (input: { name: string }) => {
      const group = { id: 'grp_orch', name: input.name, parentPath: null }
      groups.push(group)
      return group
    },
    createFolderWorkspace: async (input: {
      projectGroupId: string
      name?: string
      folderPath?: string | null
    }) => {
      const folder = {
        id: 'fld_scratch',
        name: input.name ?? 'scratch',
        folderPath: input.folderPath ?? path.join(home, 'orca-orchestration'),
        projectGroupId: input.projectGroupId
      }
      folders.push(folder)
      return { folderWorkspace: folder }
    }
  }
}

describe('resolveOrchestrationSessionPlacement', () => {
  it('defaults to the visible Orca orchestration scratch folder, not a more recent real repo', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'orca-place-'))
    homes.push(home)
    const placed = await resolveOrchestrationSessionPlacement(runtimeWith(home), home)
    expect(placed.source).toBe('scratch')
    expect(placed.worktree).toBe('folder:fld_scratch')
    expect(placed.worktree).not.toContain('work')
  })

  it('places --worktree group:"name" onto that group’s single workspace', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'orca-place-named-'))
    homes.push(home)
    const placed = await resolveOrchestrationSessionPlacement(
      runtimeWith(home, {
        groups: [{ id: 'd51c5999', name: 'dockhand group', parentPath: '/home/clawd' }],
        repos: [
          {
            id: '1a093718',
            path: '/home/clawd',
            displayName: 'clawd',
            projectGroupId: 'd51c5999'
          }
        ]
      }),
      home,
      { namedGroup: 'dockhand group' }
    )
    expect(placed.source).toBe('named')
    expect(placed.worktree).toBe('id:1a093718::/home/clawd')
    expect(placed.group).toEqual({ id: 'd51c5999', name: 'dockhand group' })
  })

  it('uses a same-named group on the target host when --worktree is absent', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'orca-place-same-'))
    homes.push(home)
    const placed = await resolveOrchestrationSessionPlacement(
      runtimeWith(home, {
        groups: [{ id: '8c735346', name: 'dockhand group', parentPath: '/home/clawd' }],
        repos: [
          {
            id: '1a093718',
            path: '/home/clawd',
            displayName: 'clawd',
            projectGroupId: '8c735346'
          }
        ]
      }),
      home,
      { callerGroup: 'dockhand group' }
    )
    expect(placed.source).toBe('same-group')
    expect(placed.worktree).toBe('id:1a093718::/home/clawd')
  })
})
