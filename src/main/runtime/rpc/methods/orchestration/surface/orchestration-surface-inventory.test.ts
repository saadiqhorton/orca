import { describe, expect, it } from 'vitest'
import { collectHostSurfaceInventory } from './orchestration-surface-inventory'

describe('collectHostSurfaceInventory', () => {
  it('lists projects, folder workspaces, sessions, and detected agents', async () => {
    const inventory = await collectHostSurfaceInventory({
      getStatus: () => ({ machineName: 'dezignerdrugz00', hostPlatform: 'linux' }),
      listVisibleProjectGroups: () => [
        { id: 'grp_1', name: 'Orca orchestration', parentPath: '/home/saadiq' }
      ],
      listVisibleFolderWorkspaces: () => [
        {
          id: 'fld_1',
          name: 'scratch',
          folderPath: '/home/saadiq/orca-orchestration',
          projectGroupId: 'grp_1'
        }
      ],
      listTerminals: async () => ({
        terminals: [
          {
            handle: 'term_visible',
            title: 'claude',
            worktree: 'path:/home/saadiq/orca-orchestration',
            agentIdentity: { agent: 'claude' }
          }
        ]
      }),
      resolveAgentDetectionHost: async () => {
        throw new Error('skip live PATH probe in unit tests')
      }
    })
    expect(inventory.machineName).toBe('dezignerdrugz00')
    expect(inventory.platform).toBe('linux')
    expect(inventory.projects).toEqual([
      { id: 'grp_1', name: 'Orca orchestration', parentPath: '/home/saadiq' }
    ])
    expect(inventory.folderWorkspaces[0]?.path).toBe('/home/saadiq/orca-orchestration')
    expect(inventory.sessions).toEqual([
      {
        handle: 'term_visible',
        title: 'claude',
        worktree: 'path:/home/saadiq/orca-orchestration',
        agent: 'claude'
      }
    ])
    expect(inventory.agents).toEqual([])
  })
})
