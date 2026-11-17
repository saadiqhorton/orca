import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureOrchestrationScratchWorkspace } from './ensure-orchestration-scratch'

const homes: string[] = []

afterEach(async () => {
  await Promise.all(homes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('ensureOrchestrationScratchWorkspace', () => {
  it('creates the group and folder once, then reuses them', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'orca-scratch-'))
    homes.push(home)
    const groups: { id: string; name: string }[] = []
    const folders: { id: string; name: string; folderPath: string; projectGroupId: string }[] = []
    const created: { skipPrimaryTerminal?: boolean }[] = []
    const runtime = {
      listVisibleProjectGroups: () => groups,
      listVisibleFolderWorkspaces: () => folders,
      createProjectGroup: async (input: { name: string }) => {
        const group = { id: 'grp_1', name: input.name }
        groups.push(group)
        return group
      },
      createFolderWorkspace: async (input: {
        projectGroupId: string
        name?: string
        folderPath?: string | null
        skipPrimaryTerminal?: boolean
      }) => {
        created.push({ skipPrimaryTerminal: input.skipPrimaryTerminal })
        const folder = {
          id: 'fld_1',
          name: input.name ?? 'scratch',
          folderPath: input.folderPath ?? '',
          projectGroupId: input.projectGroupId
        }
        folders.push(folder)
        return { folderWorkspace: folder }
      }
    }
    const first = await ensureOrchestrationScratchWorkspace(runtime, undefined, home)
    expect(first.created).toBe(true)
    expect(created).toEqual([{ skipPrimaryTerminal: true }])
    expect(first.path).toBe(path.join(home, 'orca-orchestration'))
    expect(first.worktree).toBe(`folder:${first.folderWorkspaceId}`)
    const second = await ensureOrchestrationScratchWorkspace(runtime, undefined, home)
    expect(second.created).toBe(false)
    expect(second.folderWorkspaceId).toBe(first.folderWorkspaceId)
    expect(groups).toHaveLength(1)
    expect(folders).toHaveLength(1)
  })
})
