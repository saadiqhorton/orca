import { describe, expect, it, vi } from 'vitest'
import {
  bindDesktopHubHost,
  desktopHubCommandKeepsHostFlag,
  isFolderWorktreeCreateWithoutRepo,
  needsDefaultRemoteWorktree,
  orchestrationCommandStaysOnHomeRun,
  orchestrationRunsOnCallersOrca,
  shouldWrapDesktopHubHost
} from './desktop-hub-command-route'
import { RuntimeClientError } from '../runtime/types'
import { formatHostInventory } from './host-format'

describe('desktop hub CLI --host routing', () => {
  it('wraps agent launch, terminal create, and worktree create for a desktop-connected name', () => {
    const host = new Map<string, string | boolean>([['host', 'ubuntu-server-local']])
    expect(shouldWrapDesktopHubHost(['agent', 'launch'], host)).toBe(true)
    expect(shouldWrapDesktopHubHost(['terminal', 'create'], host)).toBe(true)
    expect(shouldWrapDesktopHubHost(['worktree', 'create'], host)).toBe(true)
    expect(shouldWrapDesktopHubHost(['terminal', 'list'], host)).toBe(true)
    expect(shouldWrapDesktopHubHost(['terminal', 'send'], host)).toBe(true)
    expect(shouldWrapDesktopHubHost(['terminal', 'close'], host)).toBe(true)
  })

  it('leaves worker-start/send/reply and host inventory on their own --host handling', () => {
    const host = new Map<string, string | boolean>([['host', 'ubuntu-server-local']])
    expect(shouldWrapDesktopHubHost(['orchestration', 'worker-start'], host)).toBe(false)
    expect(shouldWrapDesktopHubHost(['orchestration', 'send'], host)).toBe(false)
    expect(shouldWrapDesktopHubHost(['orchestration', 'reply'], host)).toBe(false)
    expect(shouldWrapDesktopHubHost(['host', 'inventory'], host)).toBe(false)
    expect(shouldWrapDesktopHubHost(['host', 'list'], host)).toBe(false)
    expect(desktopHubCommandKeepsHostFlag(['host', 'inventory'])).toBe(true)
  })

  it('resolves dispatch-scoped commands with --host on the owning Run, not the named host', () => {
    const host = new Map<string, string | boolean>([
      ['host', 'ubuntu-server-local'],
      ['dispatch', 'ctx_793e1b7ab138']
    ])
    for (const command of [
      'worker-stop',
      'worker-read',
      'worker-show',
      'worker-abandon',
      'worker-release',
      'worker-keep-open',
      'worker-retain',
      'approve',
      'deny'
    ]) {
      expect(shouldWrapDesktopHubHost(['orchestration', command], host)).toBe(false)
      expect(orchestrationCommandStaysOnHomeRun(['orchestration', command], host)).toBe(true)
      expect(orchestrationRunsOnCallersOrca(['orchestration', command], host)).toBe(true)
    }
  })

  it('keeps check/inbox/list on the caller when the target is a home-run mailbox', () => {
    const dispatchMailbox = new Map<string, string | boolean>([
      ['host', 'ubuntu-server-local'],
      ['terminal', 'ctx_793e1b7ab138']
    ])
    expect(shouldWrapDesktopHubHost(['orchestration', 'check'], dispatchMailbox)).toBe(false)
    expect(shouldWrapDesktopHubHost(['orchestration', 'inbox'], dispatchMailbox)).toBe(false)
    expect(
      shouldWrapDesktopHubHost(
        ['orchestration', 'check'],
        new Map([
          ['host', 'ubuntu-server-local'],
          ['dispatch', 'ctx_793e1b7ab138']
        ])
      )
    ).toBe(false)
    expect(
      shouldWrapDesktopHubHost(
        ['orchestration', 'worker-list'],
        new Map([
          ['host', 'ubuntu-server-local'],
          ['run', 'run_home']
        ])
      )
    ).toBe(false)
  })

  it('still wraps check and worker-list when --host names a live tab or an unscoped list', () => {
    const liveTab = new Map<string, string | boolean>([
      ['host', 'ubuntu-server-local'],
      ['terminal', 'term_visible']
    ])
    expect(shouldWrapDesktopHubHost(['orchestration', 'check'], liveTab)).toBe(true)
    expect(
      shouldWrapDesktopHubHost(
        ['orchestration', 'worker-list'],
        new Map([['host', 'ubuntu-server-local']])
      )
    ).toBe(true)
  })

  it('does not wrap ssh: or runtime: values', () => {
    expect(shouldWrapDesktopHubHost(['agent', 'launch'], new Map([['host', 'ssh:abc']]))).toBe(
      false
    )
    expect(
      shouldWrapDesktopHubHost(['agent', 'launch'], new Map([['host', 'runtime:env-1']]))
    ).toBe(false)
    expect(shouldWrapDesktopHubHost(['agent', 'launch'], new Map([['host', 'local']]))).toBe(false)
  })

  it('injects a scratch worktree only when agent launch or terminal create omit --worktree', () => {
    expect(needsDefaultRemoteWorktree(['agent', 'launch'], new Map())).toBe(true)
    expect(
      needsDefaultRemoteWorktree(['agent', 'launch'], new Map([['worktree', 'path:/x']]))
    ).toBe(false)
    expect(needsDefaultRemoteWorktree(['terminal', 'create'], new Map())).toBe(true)
    expect(
      needsDefaultRemoteWorktree(['agent', 'launch'], new Map([['group', 'dockhand group']]))
    ).toBe(false)
    expect(needsDefaultRemoteWorktree(['worktree', 'create'], new Map())).toBe(false)
  })

  it('treats worktree create without a repo as a folder workspace on the target host', () => {
    expect(isFolderWorktreeCreateWithoutRepo(['worktree', 'create'], new Map())).toBe(true)
    expect(
      isFolderWorktreeCreateWithoutRepo(['worktree', 'create'], new Map([['repo', 'id:abc']]))
    ).toBe(false)
  })
})

describe('bindDesktopHubHost', () => {
  it('wraps a connected hub host and strips --host', async () => {
    const flags = new Map<string, string | boolean>([['host', 'ubuntu-server-local']])
    const inner = {
      isRemote: false,
      call: vi.fn(async (method: string) => {
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
        return { id: '1', ok: true as const, result: {}, _meta: { runtimeId: 'local' } }
      })
    }
    const wrapped = await bindDesktopHubHost(inner as never, flags)
    expect(flags.has('host')).toBe(false)
    expect(wrapped.isRemote).toBe(true)
    await wrapped.call('agent.launch', { agent: 'claude' })
    expect(inner.call).toHaveBeenCalledWith(
      'orchestration.desktopHub.call',
      expect.objectContaining({
        host: 'ubuntu-server-local',
        method: 'agent.launch',
        timeoutMs: 90_000
      }),
      expect.objectContaining({ timeoutMs: 100_000 })
    )
  })

  it('refuses a hub host that needs sign-in instead of falling through to SSH', async () => {
    const flags = new Map<string, string | boolean>([['host', 'TEMPLEOFDOOM']])
    const inner = {
      call: vi.fn(async () => ({
        id: '1',
        ok: true as const,
        result: {
          hosts: [{ kind: 'execution', name: 'TEMPLEOFDOOM', status: 'needs_sign_in', id: 'env-t' }]
        },
        _meta: { runtimeId: 'local' }
      }))
    }
    await expect(bindDesktopHubHost(inner as never, flags)).rejects.toBeInstanceOf(
      RuntimeClientError
    )
    expect(flags.get('host')).toBe('TEMPLEOFDOOM')
  })

  it('refuses an unknown --host instead of running locally', async () => {
    const flags = new Map<string, string | boolean>([['host', 'TEMPLEOFDOOM']])
    const inner = {
      call: vi.fn(async () => ({
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
      }))
    }
    await expect(bindDesktopHubHost(inner as never, flags)).rejects.toMatchObject({
      code: 'unknown_host',
      message: expect.stringContaining('ubuntu-server-local')
    })
    expect(flags.get('host')).toBe('TEMPLEOFDOOM')
  })

  it('refuses when the desktop hub list fails instead of running locally', async () => {
    const flags = new Map<string, string | boolean>([['host', 'ubuntu-server-local']])
    const inner = {
      call: vi.fn(async () => {
        throw new RuntimeClientError('runtime_unavailable', 'hub down')
      })
    }
    await expect(bindDesktopHubHost(inner as never, flags)).rejects.toMatchObject({
      code: 'desktop_hub_unavailable'
    })
    expect(flags.get('host')).toBe('ubuntu-server-local')
  })
})

describe('formatHostInventory', () => {
  it('prints agents, projects, and live sessions per host', () => {
    const text = formatHostInventory({
      hosts: [
        {
          name: 'ubuntu-server-local',
          machineName: 'dezignerdrugz00',
          status: 'connected',
          selector: 'dhub:env-ubuntu',
          inventory: {
            agents: ['claude', 'codex'],
            projects: [{ id: 'grp_1', name: 'Orca orchestration', parentPath: '/home/saadiq' }],
            folderWorkspaces: [
              {
                id: 'fld_1',
                name: 'scratch',
                path: '/home/saadiq/orca-orchestration',
                projectGroupId: 'grp_1'
              }
            ],
            repos: [
              {
                id: 'repo_work',
                name: 'work',
                path: '/home/hostb/work',
                selector: 'path:/home/hostb/work'
              }
            ],
            sessions: [{ handle: 'term_visible', agent: 'claude', title: 'review' }]
          }
        }
      ]
    })
    expect(text).toContain('ubuntu-server-local (dezignerdrugz00)  connected')
    expect(text).toContain('agents: claude, codex')
    expect(text).toContain('project: Orca orchestration')
    expect(text).toContain('folder: scratch  folder:fld_1  path:/home/saadiq/orca-orchestration')
    expect(text).toContain('repo: work  path:/home/hostb/work')
    expect(text).toContain('session: term_visible  claude  review')
  })
})
