import { describe, expect, it, vi } from 'vitest'
import { wrapDesktopHubClient } from './desktop-hub-forwarding-client'
import type { RuntimeClient } from '../runtime/client'

function inner(calls: unknown[]): RuntimeClient {
  return {
    isRemote: false,
    call: vi.fn(async (method: string, params: unknown) => {
      calls.push({ method, params })
      return { id: '1', ok: true as const, result: { forwarded: method }, _meta: { runtimeId: 'local' } }
    })
  } as unknown as RuntimeClient
}

describe('wrapDesktopHubClient', () => {
  it('forwards agent.launch through orchestration.desktopHub.call', async () => {
    const calls: unknown[] = []
    const client = wrapDesktopHubClient(inner(calls), 'ubuntu-server-local')
    expect(client.isRemote).toBe(true)
    await client.call('agent.launch', { agent: 'claude' })
    expect(calls).toEqual([
      {
        method: 'orchestration.desktopHub.call',
        params: {
          host: 'ubuntu-server-local',
          method: 'agent.launch',
          params: { agent: 'claude' }
        }
      }
    ])
  })

  it('does not wrap hub control-plane methods', async () => {
    const calls: unknown[] = []
    const client = wrapDesktopHubClient(inner(calls), 'ubuntu-server-local')
    await client.call('orchestration.desktopHub.list', {})
    expect(calls).toEqual([{ method: 'orchestration.desktopHub.list', params: {} }])
  })
})
