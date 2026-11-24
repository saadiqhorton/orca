import { describe, expect, it } from 'vitest'
import {
  collectHostSurfaceInventory,
  filterHostSurfaceInventory
} from './orchestration-surface-inventory'

describe('collectHostSurfaceInventory', () => {
  it('links repos and folders to project groups and ready selectors', async () => {
    const inventory = await collectHostSurfaceInventory({
      getStatus: () => ({ machineName: 'dezignerdrugz00', hostPlatform: 'linux' }),
      listVisibleProjectGroups: () => [
        { id: 'grp_1', name: 'Orca orchestration', parentPath: '/home/saadiq' },
        { id: 'd51c5999', name: 'dockhand group', parentPath: '/home/clawd' }
      ],
      listVisibleFolderWorkspaces: () => [
        {
          id: 'fld_1',
          name: 'scratch',
          folderPath: '/home/saadiq/orca-orchestration',
          projectGroupId: 'grp_1'
        }
      ],
      listVisibleRepos: () => [
        {
          id: '1a093718',
          path: '/home/clawd',
          displayName: 'clawd',
          kind: 'git',
          projectGroupId: 'd51c5999'
        },
        { id: 'repo_work', path: '/home/hostb/work', displayName: 'work', kind: 'git' }
      ],
      listTerminals: async () => ({
        terminals: [
          {
            handle: 'term_visible',
            title: 'claude',
            worktree: 'path:/home/saadiq/orca-orchestration',
            agentIdentity: { agent: 'claude' }
          },
          {
            handle: 'term_exited',
            title: 'codex',
            status: 'exited',
            agentIdentity: { agent: 'codex' }
          }
        ]
      }),
      resolveAgentDetectionHost: async () => {
        throw new Error('skip live PATH probe in unit tests')
      }
    })
    expect(inventory.machineName).toBe('dezignerdrugz00')
    expect(inventory.projects).toEqual([
      {
        id: 'grp_1',
        name: 'Orca orchestration',
        parentPath: '/home/saadiq',
        members: [
          {
            kind: 'folder',
            id: 'fld_1',
            name: 'scratch',
            path: '/home/saadiq/orca-orchestration',
            selector: 'folder:fld_1',
            projectGroupId: 'grp_1',
            projectGroupName: 'Orca orchestration'
          }
        ]
      },
      {
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
    ])
    expect(inventory.folderWorkspaces[0]).toMatchObject({
      path: '/home/saadiq/orca-orchestration',
      selector: 'folder:fld_1',
      projectGroupName: 'Orca orchestration'
    })
    expect(inventory.repos).toEqual([
      {
        id: '1a093718',
        name: 'clawd',
        path: '/home/clawd',
        selector: 'id:1a093718::/home/clawd',
        projectGroupId: 'd51c5999',
        projectGroupName: 'dockhand group'
      },
      {
        id: 'repo_work',
        name: 'work',
        path: '/home/hostb/work',
        selector: 'id:repo_work::/home/hostb/work'
      }
    ])
    expect(inventory.sessions).toEqual([
      {
        handle: 'term_visible',
        title: 'claude',
        worktree: 'path:/home/saadiq/orca-orchestration',
        agent: 'claude'
      },
      { handle: 'term_exited', title: 'codex' }
    ])
    const filtered = filterHostSurfaceInventory(inventory, 'dockhand group')
    expect(filtered.projects).toHaveLength(1)
    expect(filtered.repos.map((repo) => repo.id)).toEqual(['1a093718'])
    expect(filtered.folderWorkspaces).toEqual([])
    expect(inventory.agents).toEqual([])
  })
})
