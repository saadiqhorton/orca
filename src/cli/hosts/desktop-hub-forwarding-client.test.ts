import { describe, expect, it, vi } from 'vitest'
import { wrapDesktopHubClient } from './desktop-hub-forwarding-client'
import type { RuntimeClient } from '../runtime/client'

function inner(calls: unknown[]): RuntimeClient {
  const stub = {
    isRemote: false as const,
    call: vi.fn(async (method: string, params: unknown) => {
      calls.push({ method, params })
      return {
        id: '1',
        ok: true as const,
        result: { forwarded: method },
        _meta: { runtimeId: 'local' }
      }
    })
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: vi.fn call mock is a partial RuntimeClient stub.
  return stub as unknown as RuntimeClient
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
          params: { agent: 'claude' },
          timeoutMs: 90_000
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

  it('forwards terminal.send prompt envelopes and reads status from the target host', async () => {
    const calls: unknown[] = []
    const remote = {
      ...inner(calls),
      call: vi.fn(async (method: string, params: unknown) => {
        calls.push({ method, params })
        if (method === 'orchestration.desktopHub.call') {
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: hub call params are an object envelope in this test.
          const forwarded = params as { method?: string }
          if (forwarded.method === 'status.get') {
            return {
              id: '1',
              ok: true as const,
              result: {
                runtimeId: 'host-b',
                graphStatus: 'ready',
                capabilities: ['terminal.prompt-delivery']
              },
              _meta: { runtimeId: 'host-b' }
            }
          }
        }
        return {
          id: '1',
          ok: true as const,
          result: { send: { accepted: true, prompt: { requestId: 'req_1' } } },
          _meta: { runtimeId: 'host-b' }
        }
      })
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: vi.fn call mock is a partial RuntimeClient stub.
    const client = wrapDesktopHubClient(remote as never, 'ubuntu-server-local')
    const status = await client.getCliStatus()
    expect(status.result.runtime.runtimeId).toBe('host-b')
    expect(status.result.runtime.capabilities).toEqual(['terminal.prompt-delivery'])
    await client.call(
      'terminal.send',
      {
        terminal: 'term_1',
        text: 'hello',
        enter: true,
        agentPrompt: true,
        client: { id: 'orca-cli', type: 'desktop' }
      },
      { terminalPromptPreflight: { runtimeId: 'host-b' } }
    )
    type SendCall = { params: { envelope?: { orchestrationRequestId?: string }; method: string } }
    const send = calls.find((entry): entry is SendCall => {
      if (typeof entry !== 'object' || entry === null || !('params' in entry)) {
        return false
      }
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: find only inspects method on captured hub-call params.
      const params = (entry as { params?: { method?: string } }).params
      return params?.method === 'terminal.send'
    })
    expect(send).toBeDefined()
    expect(send?.params.method).toBe('terminal.send')
    expect(send?.params.envelope?.orchestrationRequestId).toEqual(expect.any(String))
  })
})
