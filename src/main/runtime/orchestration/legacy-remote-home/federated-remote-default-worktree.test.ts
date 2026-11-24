import { describe, expect, it, vi } from 'vitest'
import { resolveFederatedWorkerWorktree } from './federated-remote-default-worktree'

describe('resolveFederatedWorkerWorktree', () => {
  it('uses the scratch folder workspace selector when --worktree is omitted', async () => {
    const runtime = {
      callOrchestrationWorkerServer: vi.fn(async () => ({
        path: '/home/hostb/orca-orchestration',
        worktree: 'folder:fld_scratch',
        folderWorkspaceId: 'fld_scratch'
      }))
    }
    await expect(
      resolveFederatedWorkerWorktree(runtime as never, 'env-ubuntu', {
        host: 'ubuntu-server-local'
      } as never)
    ).resolves.toBe('folder:fld_scratch')
    expect(runtime.callOrchestrationWorkerServer).toHaveBeenCalledWith(
      'env-ubuntu',
      'orchestration.surface.ensureScratch',
      {},
      30_000
    )
  })

  it('keeps an explicit path: worktree, including folder project paths', async () => {
    const runtime = { callOrchestrationWorkerServer: vi.fn() }
    await expect(
      resolveFederatedWorkerWorktree(runtime as never, 'env-ubuntu', {
        worktree: 'path:/home/hostb/orca-orchestration/xh-wt'
      } as never)
    ).resolves.toBe('path:/home/hostb/orca-orchestration/xh-wt')
    expect(runtime.callOrchestrationWorkerServer).not.toHaveBeenCalled()
  })

  it('resolves group: against the target inventory, not the caller', async () => {
    const runtime = {
      callOrchestrationWorkerServer: vi.fn(async (_env: string, method: string) => {
        if (method === 'orchestration.surface.inventory') {
          return {
            projects: [
              {
                id: 'g-clawd',
                name: 'dockhand group',
                parentPath: '/home/hostb',
                members: [
                  {
                    kind: 'repo',
                    id: 'repo-clawd',
                    name: 'clawd',
                    path: '/home/hostb/clawd',
                    selector: 'id:repo-clawd::/home/hostb/clawd',
                    projectGroupId: 'g-clawd',
                    projectGroupName: 'dockhand group'
                  }
                ]
              }
            ]
          }
        }
        throw new Error(`unexpected ${method}`)
      })
    }
    await expect(
      resolveFederatedWorkerWorktree(runtime as never, 'env-ubuntu', {
        host: 'ubuntu-server-local',
        worktree: 'group:"dockhand group"'
      } as never)
    ).resolves.toBe('id:repo-clawd::/home/hostb/clawd')
    expect(runtime.callOrchestrationWorkerServer).toHaveBeenCalledWith(
      'env-ubuntu',
      'orchestration.surface.inventory',
      {},
      30_000
    )
  })
})
