import { describe, expect, it, vi } from 'vitest'
import { RuntimeClientError } from '../runtime/types'
import {
  collectCrossHostSelectors,
  isCrossHostSelector,
  resolveRemoteSelectorsAcrossHosts,
  resolveSelectorHostHits,
  routeTerminalHandlesToOwner
} from './desktop-hub-selector-resolve'
import { ORCHESTRATION_HANDLE_ROUTING_RUNTIME_CAPABILITY } from '../../shared/orchestration/orchestration-runtime-capabilities'

const inventory = [
  {
    name: 'ubuntu-server-local',
    kind: 'execution',
    hostKey: 'env-ubuntu',
    status: 'connected' as const,
    inventory: {
      folderWorkspaces: [{ id: 'fld_remote' }],
      sessions: [{ handle: 'term_remote1' }]
    }
  },
  {
    name: 'TEMPLEOFDOOM',
    kind: 'execution',
    hostKey: 'env-temple',
    status: 'connected' as const,
    inventory: {
      folderWorkspaces: [{ id: 'fld_other' }],
      sessions: [{ handle: 'term_shared' }]
    }
  },
  {
    name: 'ARCHIT4ME',
    kind: 'execution',
    hostKey: 'env-arch',
    status: 'connected' as const,
    inventory: {
      folderWorkspaces: [],
      sessions: [{ handle: 'term_shared' }]
    }
  },
  {
    name: 'FLEXTOP',
    kind: 'desktop',
    hostKey: 'desktop',
    status: 'connected' as const,
    inventory: {
      folderWorkspaces: [{ id: 'fld_local' }],
      sessions: []
    }
  }
]

describe('cross-host selector matching', () => {
  it('recognizes folder and terminal handles', () => {
    expect(isCrossHostSelector('folder:fld_remote')).toBe(true)
    expect(isCrossHostSelector('id:folder:fld_remote')).toBe(true)
    expect(isCrossHostSelector('term_abc123')).toBe(true)
    expect(isCrossHostSelector('path:/home/saadiq/work')).toBe(false)
    expect(
      collectCrossHostSelectors(
        new Map([
          ['worktree', 'folder:fld_remote'],
          ['terminal', 'term_remote1']
        ])
      )
    ).toEqual(['folder:fld_remote', 'term_remote1'])
  })

  it('auto-resolves a unique remote folder id', () => {
    expect(resolveSelectorHostHits(inventory, ['folder:fld_remote'])).toEqual({
      kind: 'unique',
      host: 'ubuntu-server-local'
    })
  })

  it('names every owner when a handle is on more than one host', () => {
    const matched = resolveSelectorHostHits(inventory, ['term_shared'])
    expect(matched.kind).toBe('ambiguous')
    if (matched.kind !== 'ambiguous') {
      return
    }
    expect(matched.hits.map((hit) => hit.host).sort()).toEqual(['ARCHIT4ME', 'TEMPLEOFDOOM'])
  })

  it('leaves unknown selectors for the local resolver', () => {
    expect(resolveSelectorHostHits(inventory, ['folder:missing'])).toEqual({ kind: 'none' })
  })
})

describe('resolveRemoteSelectorsAcrossHosts', () => {
  function clientWithInventory() {
    return {
      isRemote: false,
      call: vi.fn(async () => ({
        id: '1',
        ok: true as const,
        result: { hosts: inventory },
        _meta: { runtimeId: 'local' }
      }))
    }
  }

  it('wraps unique remote folder selectors so follow-ups do not need --host', async () => {
    const flags = new Map<string, string | boolean>([['worktree', 'folder:fld_remote']])
    const wrapped = await resolveRemoteSelectorsAcrossHosts(
      clientWithInventory() as never,
      ['agent', 'launch'],
      flags
    )
    expect(wrapped.isRemote).toBe(true)
    expect(flags.has('host')).toBe(false)
    await wrapped.call('agent.launch', { agent: 'claude' })
  })

  it('leaves a local desktop folder worktree on this machine without wrapping --host FLEXTOP', async () => {
    const flags = new Map<string, string | boolean>([['worktree', 'folder:fld_local']])
    const inner = clientWithInventory()
    const result = await resolveRemoteSelectorsAcrossHosts(
      inner as never,
      ['orchestration', 'worker-start'],
      flags
    )
    expect(result).toBe(inner)
    expect(result.isRemote).toBe(false)
    expect(flags.has('host')).toBe(false)
  })

  it('sets --host on worker-start instead of wrapping the client', async () => {
    const flags = new Map<string, string | boolean>([['worktree', 'folder:fld_remote']])
    const inner = clientWithInventory()
    const result = await resolveRemoteSelectorsAcrossHosts(
      inner as never,
      ['orchestration', 'worker-start'],
      flags
    )
    expect(result).toBe(inner)
    expect(flags.get('host')).toBe('ubuntu-server-local')
  })

  it('errors with the exact --host command when a handle is on two machines', async () => {
    const flags = new Map<string, string | boolean>([['terminal', 'term_shared']])
    await expect(
      resolveRemoteSelectorsAcrossHosts(clientWithInventory() as never, ['terminal', 'send'], flags)
    ).rejects.toBeInstanceOf(RuntimeClientError)
    await expect(
      resolveRemoteSelectorsAcrossHosts(clientWithInventory() as never, ['terminal', 'send'], flags)
    ).rejects.toMatchObject({
      code: 'selector_ambiguous',
      message: expect.stringContaining('--host TEMPLEOFDOOM')
    })
  })
})

describe('routeTerminalHandlesToOwner', () => {
  function clientOwnedBy(owner: unknown) {
    return {
      isRemote: false,
      getCliStatus: vi.fn(async () => ({
        result: { runtime: { capabilities: [ORCHESTRATION_HANDLE_ROUTING_RUNTIME_CAPABILITY] } }
      })),
      call: vi.fn(async () => ({ id: '1', ok: true as const, result: owner, _meta: {} }))
    }
  }

  it('refuses a --host that does not own the handle', async () => {
    const flags = new Map<string, string | boolean>([
      ['terminal', 'term_remote1'],
      ['host', 'TEMPLEOFDOOM']
    ])
    const client = clientOwnedBy({
      owner: 'host',
      name: 'ubuntu-server-local',
      hostKey: 'env-ubuntu'
    })
    await expect(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: fake client implements only the calls routing makes.
      routeTerminalHandlesToOwner(client as never, ['terminal', 'read'], flags)
    ).rejects.toMatchObject({ code: 'host_mismatch' })
  })

  it('retargets a host-less handle to the host that owns it', async () => {
    const flags = new Map<string, string | boolean>([['terminal', 'term_remote1']])
    const client = clientOwnedBy({
      owner: 'host',
      name: 'ubuntu-server-local',
      hostKey: 'env-ubuntu'
    })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: fake client implements only the calls routing makes.
    const routed = await routeTerminalHandlesToOwner(client as never, ['terminal', 'read'], flags)
    expect(routed.handled).toBe(true)
    expect(routed.client?.isRemote).toBe(true)
    expect(flags.has('host')).toBe(false)
  })
})
