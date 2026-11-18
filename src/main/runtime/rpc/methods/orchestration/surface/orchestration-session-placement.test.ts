import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveOrchestrationSessionPlacement } from './orchestration-session-placement'

const homes: string[] = []

afterEach(async () => {
  await Promise.all(homes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function runtimeWith(home: string) {
  const groups: { id: string; name: string }[] = []
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
    listManagedWorktrees: async () => ({
      worktrees: [{ id: `repo::${path.join(home, 'work')}`, lastActivityAt: 9_999 }]
    }),
    createProjectGroup: async (input: { name: string }) => {
      const group = { id: 'grp_orch', name: input.name }
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
})
