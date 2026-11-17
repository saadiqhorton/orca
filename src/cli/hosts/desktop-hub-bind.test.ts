import { describe, expect, it, vi } from 'vitest'
import { RuntimeClientError } from '../runtime/types'
import {
  bindDesktopHubHost,
  resolveDesktopHubHost,
  throwDesktopHubHostResolution
} from './desktop-hub-bind'

function hubList(hosts: unknown) {
  return {
    call: vi.fn(async (method: string) => {
      if (method === 'orchestration.desktopHub.list') {
        return {
          id: '1',
          ok: true as const,
          result: { hosts },
          _meta: { runtimeId: 'local' }
        }
      }
      return { id: '1', ok: true as const, result: {}, _meta: { runtimeId: 'local' } }
    })
  }
}

describe('resolveDesktopHubHost', () => {
  it('refuses unknown --host for agent launch, terminal create/list/send, and worker-start', async () => {
    const client = hubList([
      { kind: 'execution', name: 'ubuntu-server-local', status: 'connected', id: 'env-u' }
    ])
    await expect(resolveDesktopHubHost(client as never, 'TEMPLEOFDOOM')).resolves.toMatchObject({
      status: 'unknown',
      names: ['ubuntu-server-local']
    })
    expect(() =>
      throwDesktopHubHostResolution('TEMPLEOFDOOM', {
        status: 'unknown',
        names: ['ubuntu-server-local']
      })
    ).toThrow(RuntimeClientError)
    try {
      throwDesktopHubHostResolution('TEMPLEOFDOOM', {
        status: 'unknown',
        names: ['ubuntu-server-local']
      })
    } catch (error) {
      expect(error).toMatchObject({ code: 'unknown_host' })
    }
  })

  it('refuses when the hub list fails', async () => {
    const client = {
      call: vi.fn(async () => {
        throw new RuntimeClientError('runtime_unavailable', 'down')
      })
    }
    await expect(resolveDesktopHubHost(client, 'ubuntu-server-local')).resolves.toMatchObject({
      status: 'unavailable'
    })
    const flags = new Map<string, string | boolean>([['host', 'ubuntu-server-local']])
    await expect(bindDesktopHubHost(client as never, flags)).rejects.toMatchObject({
      code: 'desktop_hub_unavailable'
    })
  })
})
