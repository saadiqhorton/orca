import { describe, expect, it, vi } from 'vitest'
import type { OrchestrationEnvironmentTransport } from '../federation/environment-transport'
import { desktopHubSelector } from '../../../../shared/orchestration/desktop-hub-contract'
import { getDesktopHubRegistry } from './desktop-hub-registry'
import { wrapDesktopHubTransport } from './desktop-hub-transport'

describe('desktop hub transport', () => {
  it('forwards dhub selectors to the desktop and leaves saved servers on the existing transport', async () => {
    const ssh = vi.fn()
    const innerCall = vi.fn(async () => ({
      id: 'local',
      ok: true as const,
      result: { via: 'paired-server' },
      _meta: { runtimeId: 'local' }
    }))
    const inner: OrchestrationEnvironmentTransport = {
      resolve: () => ({ environmentId: 'env-saved', name: 'saved', peerFingerprint: 'fp-saved' }),
      call: innerCall
    }
    const runtime = {}
    const wrapped = wrapDesktopHubTransport(inner, runtime)
    expect((await wrapped?.resolve('env-saved'))?.environmentId).toBe('env-saved')
    const registry = getDesktopHubRegistry(runtime)
    registry.register({
      userId: 'desktop-user-000001',
      appInstallationId: 'desktop-install-0001',
      pairedDeviceId: 'desktop-device',
      emit(event) {
        if (event.method?.includes('ssh')) {
          ssh()
        }
        if (event.op === 'resolve') {
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
              peerFingerprint: 'fp-ubuntu',
              homePeerFingerprint: 'fp-home'
            }
          })
          return
        }
        registry.answer('desktop-device', {
          requestId: event.requestId,
          ok: true,
          result: {
            ok: true,
            result: { method: event.method },
            _meta: { runtimeId: 'host-b' }
          }
        })
      }
    })
    await registry.place('ubuntu-server-local')
    const selector = desktopHubSelector('env-ubuntu')
    expect(await wrapped?.resolve(selector)).toMatchObject({
      environmentId: selector,
      peerFingerprint: 'fp-ubuntu'
    })
    const response = await wrapped?.call(selector, 'orchestration.federationAttachStart', {
      task: 'hostname'
    })
    expect(response).toMatchObject({
      ok: true,
      result: { method: 'orchestration.federationAttachStart' }
    })
    expect(innerCall).not.toHaveBeenCalled()
    expect(ssh).not.toHaveBeenCalled()
    await wrapped?.call('env-saved', 'status.get', undefined)
    expect(innerCall).toHaveBeenCalledWith(
      'env-saved',
      'status.get',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    )
  })
})
