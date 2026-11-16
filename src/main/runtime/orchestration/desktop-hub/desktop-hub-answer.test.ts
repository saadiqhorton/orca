import { describe, expect, it, vi } from 'vitest'
import { buildDesktopHubCatalog } from './desktop-hub-catalog'
import { answerDesktopHubRequest } from './desktop-hub-answer'
import type { DesktopHubRequestEvent } from '../../../../shared/orchestration/desktop-hub-contract'

const catalog = buildDesktopHubCatalog({
  machineName: 'windows-desktop',
  executions: [
    {
      label: 'ubuntu',
      machineName: 'ubuntu-server-local',
      environmentId: 'env-ubuntu',
      health: 'available',
      server: { name: 'ubuntu', peerFingerprint: 'fp-ubuntu', homePeerFingerprint: 'fp-home' }
    },
    {
      label: 'temple',
      machineName: 'TEMPLEOFDOOM',
      environmentId: 'env-temple',
      health: 'blocked',
      blockedReason: 'access-revoked'
    }
  ]
})

describe('desktop hub answerer', () => {
  it('forwards a worker start to the connected host and does not dial one that needs sign-in', async () => {
    expect(catalog.hosts.map((host) => [host.name, host.status])).toEqual([
      ['windows-desktop', 'connected'],
      ['ubuntu-server-local', 'connected'],
      ['TEMPLEOFDOOM', 'needs_sign_in']
    ])
    const callHost = vi.fn(async () => ({
      id: 'host-b',
      ok: true as const,
      result: { started: true },
      _meta: { runtimeId: 'host-b' }
    }))
    const ssh = vi.fn()
    const refused = await answerDesktopHubRequest({
      request: request('resolve', { name: 'TEMPLEOFDOOM' }),
      catalog: () => catalog,
      callHost
    })
    expect(refused).toMatchObject({ ok: false, error: { code: 'needs_sign_in' } })
    expect(callHost).not.toHaveBeenCalled()
    expect(ssh).not.toHaveBeenCalled()
    const forwarded = await answerDesktopHubRequest({
      request: request('call', {
        hostKey: 'env-ubuntu',
        method: 'orchestration.federationAttachStart',
        params: { task: 'hostname' }
      }),
      catalog: () => catalog,
      callHost
    })
    expect(forwarded.ok).toBe(true)
    expect(callHost).toHaveBeenCalledOnce()
    expect(callHost).toHaveBeenCalledWith(
      expect.objectContaining({ hostKey: 'env-ubuntu' }),
      'orchestration.federationAttachStart',
      { task: 'hostname' },
      undefined,
      undefined
    )
    expect(ssh).not.toHaveBeenCalled()
  })
})

function request(
  op: DesktopHubRequestEvent['op'],
  fields: Omit<DesktopHubRequestEvent, 'type' | 'requestId' | 'op'>
): DesktopHubRequestEvent {
  return { type: 'orchestrationHubRequested', requestId: 'req-1', op, ...fields }
}
