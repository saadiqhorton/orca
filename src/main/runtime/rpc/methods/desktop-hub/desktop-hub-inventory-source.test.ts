import { afterEach, describe, expect, it } from 'vitest'
import { getDesktopHubRegistry } from '../../../orchestration/desktop-hub/desktop-hub-registry'
import { setDesktopHubCatalogProvider } from '../../../orchestration/desktop-hub/desktop-hub-provider'
import { inventoryUsesLocalDesktopRuntime } from './desktop-hub-methods'

describe('inventoryUsesLocalDesktopRuntime', () => {
  afterEach(() => {
    setDesktopHubCatalogProvider(null)
  })

  it('uses the local runtime only on the desktop process that holds the catalog', () => {
    const desktop = {}
    const remote = {}
    setDesktopHubCatalogProvider(async () => ({ hosts: [], placements: [] }))
    expect(inventoryUsesLocalDesktopRuntime(desktop)).toBe(true)
    getDesktopHubRegistry(remote).register({
      userId: 'desktop-user-000001',
      appInstallationId: 'desktop-install-0001',
      pairedDeviceId: 'desktop-device',
      emit: () => {}
    })
    setDesktopHubCatalogProvider(null)
    expect(inventoryUsesLocalDesktopRuntime(remote)).toBe(false)
  })
})
