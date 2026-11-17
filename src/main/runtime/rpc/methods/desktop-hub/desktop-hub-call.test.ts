import { describe, expect, it, vi } from 'vitest'
import { desktopHubSelector } from '../../../../../shared/orchestration/desktop-hub-contract'
import { getDesktopHubRegistry } from '../../../orchestration/desktop-hub/desktop-hub-registry'
import { callDesktopHubHost } from './desktop-hub-call'

describe('callDesktopHubHost', () => {
  it('places the host then forwards the method through the worker server', async () => {
    const runtime = {
      callOrchestrationWorkerServer: vi.fn(async () => ({ handle: 'term_1' }))
    }
    const registry = getDesktopHubRegistry(runtime)
    registry.register({
      userId: 'desktop-user-000001',
      appInstallationId: 'desktop-install-0001',
      pairedDeviceId: 'desktop-device',
      emit(event) {
        registry.answer('desktop-device', {
          requestId: event.requestId,
          ok: true,
          result: {
            kind: 'execution',
            name: 'ubuntu-server-local',
            id: 'env-ubuntu',
            hostKey: 'env-ubuntu',
            selector: desktopHubSelector('env-ubuntu'),
            status: 'connected',
            peerFingerprint: 'fp'
          }
        })
      }
    })
    await expect(
      callDesktopHubHost(runtime, {
        host: 'ubuntu-server-local',
        method: 'agent.launch',
        params: { agent: 'claude' }
      })
    ).resolves.toEqual({ handle: 'term_1' })
    expect(runtime.callOrchestrationWorkerServer).toHaveBeenCalledWith(
      desktopHubSelector('env-ubuntu'),
      'agent.launch',
      { agent: 'claude' },
      undefined,
      undefined
    )
  })

  it('refuses to forward hub control-plane methods', async () => {
    await expect(
      callDesktopHubHost(
        { callOrchestrationWorkerServer: vi.fn() },
        { host: 'ubuntu-server-local', method: 'orchestration.desktopHub.list' }
      )
    ).rejects.toMatchObject({ code: 'invalid_argument' })
  })
})
