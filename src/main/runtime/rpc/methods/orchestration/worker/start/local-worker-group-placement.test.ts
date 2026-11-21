import { describe, expect, it, vi } from 'vitest'
import { resolveLocalWorkerGroupPlacement } from './local-worker-group-placement'

describe('resolveLocalWorkerGroupPlacement', () => {
  it('leaves group: selectors unchanged when federating to another host', async () => {
    const runtime = { listVisibleProjectGroups: vi.fn() }
    const params = {
      worktree: 'group:"dockhand group"',
      on: 'env-ubuntu'
    }
    await expect(
      resolveLocalWorkerGroupPlacement(runtime as never, params as never)
    ).resolves.toEqual(params)
    expect(runtime.listVisibleProjectGroups).not.toHaveBeenCalled()
  })
})
