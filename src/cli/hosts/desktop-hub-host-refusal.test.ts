import { describe, expect, it } from 'vitest'
import type { RuntimeClient } from '../runtime/client'
import { refuseDesktopHubHostAlias } from './desktop-hub-host-refusal'
import { RuntimeClientError } from '../runtime/connection/types'

const hubHosts = [
  { kind: 'local', name: 'this machine', id: 'local', machineName: 'dockhand' },
  { kind: 'execution', name: 'FLEXTOP', id: 'desktop', machineName: 'FLEXTOP' },
  {
    kind: 'execution',
    name: 'ubuntu-server-local',
    id: 'f12a5fc4-a853-4aa2-8b76-b0b6977b45c5',
    machineName: 'dezignerdrugz00'
  }
]

function client(result: unknown, fail?: Error): Pick<RuntimeClient, 'call'> {
  const stub = {
    call: async () => {
      if (fail) {
        throw fail
      }
      return { id: 'x', ok: true as const, result, _meta: { runtimeId: 'local' } }
    }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: call mock is a partial RuntimeClient stub.
  return stub as Pick<RuntimeClient, 'call'>
}

describe('refuseDesktopHubHostAlias', () => {
  it('points worktree create --host at visible-tab commands on a desktop-connected machine', async () => {
    const error = await refuseDesktopHubHostAlias(
      client({ hub: 'remote', hosts: hubHosts }),
      'ubuntu-server-local',
      '--host ubuntu-server-local'
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(RuntimeClientError)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial RuntimeClient or DOMRect stub for a unit test.
    expect((error as RuntimeClientError).code).toBe('invalid_argument')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial RuntimeClient or DOMRect stub for a unit test.
    expect((error as Error).message).toContain('a machine the desktop app is connected to')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial RuntimeClient or DOMRect stub for a unit test.
    expect((error as Error).message).toContain('orca agent launch --host ubuntu-server-local')
  })

  it('matches the machine name too', async () => {
    await expect(
      refuseDesktopHubHostAlias(
        client({ hub: 'remote', hosts: hubHosts }),
        'dezignerdrugz00',
        '--host dezignerdrugz00'
      )
    ).rejects.toThrow('agent launch --host ubuntu-server-local')
  })

  it('stays silent for names the hub does not know, and for runtimes without a hub', async () => {
    await expect(
      refuseDesktopHubHostAlias(client({ hub: 'remote', hosts: hubHosts }), 'nope', '--host nope')
    ).resolves.toBeUndefined()
    await expect(
      refuseDesktopHubHostAlias(client({ hub: 'unavailable', hosts: [] }), 'x', '--host x')
    ).resolves.toBeUndefined()
    await expect(
      refuseDesktopHubHostAlias(
        client(null, new RuntimeClientError('method_not_found', 'old runtime')),
        'ubuntu-server-local',
        '--host ubuntu-server-local'
      )
    ).resolves.toBeUndefined()
  })
})
