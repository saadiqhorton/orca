import { describe, expect, it, vi } from 'vitest'
import { prepareDesktopHubCliClient } from './desktop-hub-cli-bind'

function hubClient(calls: { method: string; params: unknown }[]) {
  const handle = async (method: string, params: unknown) => {
    calls.push({ method, params })
    if (method === 'orchestration.desktopHub.list') {
      return {
        id: '1',
        ok: true as const,
        result: {
          hosts: [
            {
              kind: 'execution',
              name: 'ubuntu-server-local',
              status: 'connected',
              id: 'env-ubuntu'
            }
          ]
        },
        _meta: { runtimeId: 'local' }
      }
    }
    if (method === 'orchestration.surface.ensureScratch') {
      return {
        id: '1',
        ok: true as const,
        result: {
          path: '/home/saadiq/orca-orchestration',
          worktree: 'folder:fld_scratch',
          created: true,
          groupName: 'Orca orchestration',
          workspaceName: 'scratch'
        },
        _meta: { runtimeId: 'host-b' }
      }
    }
    return { id: '1', ok: true as const, result: {}, _meta: { runtimeId: 'local' } }
  }
  return {
    isRemote: false,
    call: vi.fn(async (method: string, params: unknown) => {
      if (method === 'orchestration.desktopHub.call') {
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: hub call params are an object envelope in this test.
        const forwarded = params as { method: string; params?: unknown }
        return handle(forwarded.method, forwarded.params)
      }
      return handle(method, params)
    })
  }
}

describe('prepareDesktopHubCliClient', () => {
  it('rewrites worktree create --host --agent into agent launch on the scratch folder', async () => {
    const calls: { method: string; params: unknown }[] = []
    const flags = new Map<string, string | boolean>([
      ['host', 'ubuntu-server-local'],
      ['agent', 'claude'],
      ['prompt', 'review the deploy'],
      ['name', 'scratch']
    ])
    const prepared = await prepareDesktopHubCliClient(
      ['worktree', 'create'],
      flags,
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial RuntimeClient or DOMRect stub for a unit test.
      hubClient(calls) as never,
      true
    )
    expect(prepared.printed).toBe(false)
    expect(prepared.commandPath).toEqual(['agent', 'launch'])
    expect(flags.get('worktree')).toBe('folder:fld_scratch')
    expect(flags.get('agent')).toBe('claude')
    expect(flags.get('prompt')).toBe('review the deploy')
    expect(flags.has('host')).toBe(false)
    expect(flags.has('name')).toBe(false)
  })

  it('prints scratch with a pointer to agent launch --host when --agent is omitted', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const flags = new Map<string, string | boolean>([
      ['host', 'ubuntu-server-local'],
      ['name', 'scratch']
    ])
    const prepared = await prepareDesktopHubCliClient(
      ['worktree', 'create'],
      flags,
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial RuntimeClient or DOMRect stub for a unit test.
      hubClient([]) as never,
      false
    )
    expect(prepared.printed).toBe(true)
    expect(prepared.commandPath).toEqual(['worktree', 'create'])
    expect(log.mock.calls.join('\n')).toContain('orca agent launch --host ubuntu-server-local')
    log.mockRestore()
  })
})
