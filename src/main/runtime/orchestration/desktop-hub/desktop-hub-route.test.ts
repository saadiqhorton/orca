import { afterEach, describe, expect, it } from 'vitest'
import { desktopHubSelector } from '../../../../shared/orchestration/desktop-hub-contract'
import { buildDesktopHubCatalog } from './desktop-hub-catalog'
import { setDesktopHubCatalogProvider } from './desktop-hub-provider'
import { getDesktopHubRegistry } from './desktop-hub-registry'
import { routeDesktopHubCommand } from './desktop-hub-route'

const catalog = buildDesktopHubCatalog({
  machineName: 'windows-desktop',
  executions: [
    {
      label: 'ubuntu',
      machineName: 'ubuntu-server-local',
      environmentId: 'env-ubuntu',
      health: 'available',
      server: { name: 'ubuntu', peerFingerprint: 'fp-ubuntu' }
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

afterEach(() => {
  setDesktopHubCatalogProvider(null)
})

describe('desktop hub route', () => {
  it('uses the desktop pairing store when this process is the hub', async () => {
    setDesktopHubCatalogProvider(async () => catalog)
    const runtime = { resolveOrchestrationWorkerServer: () => ({ environmentId: 'should-not-run' }) }
    await expect(routeDesktopHubCommand(runtime, { host: 'ubuntu-server-local' })).resolves.toEqual({
      host: undefined,
      on: 'env-ubuntu'
    })
    await expect(routeDesktopHubCommand(runtime, { host: 'TEMPLEOFDOOM' })).rejects.toMatchObject({
      code: 'needs_sign_in'
    })
    await expect(
      routeDesktopHubCommand(runtime, { host: 'ubuntu-server-local', on: 'elsewhere' })
    ).rejects.toThrow(/not both/)
  })

  it('asks the paired desktop from a remote session instead of SSH', async () => {
    const runtime = {}
    const registry = getDesktopHubRegistry(runtime)
    const ssh = (): void => {
      throw new Error('ssh')
    }
    registry.register({
      userId: 'desktop-user-000001',
      appInstallationId: 'desktop-install-0001',
      pairedDeviceId: 'desktop-device',
      emit(event) {
        if (event.name?.startsWith('ssh:')) {
          ssh()
        }
        registry.answer('desktop-device', {
          requestId: event.requestId,
          ok: true,
          result: catalog.placements.find((row) => row.hostKey === 'env-ubuntu')
        })
      }
    })
    await expect(routeDesktopHubCommand(runtime, { host: 'ubuntu-server-local' })).resolves.toEqual({
      host: undefined,
      on: desktopHubSelector('env-ubuntu')
    })
    await expect(routeDesktopHubCommand(runtime, {})).resolves.toEqual({})
  })
})
