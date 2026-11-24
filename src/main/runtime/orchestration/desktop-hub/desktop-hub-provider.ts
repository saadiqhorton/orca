import type { DesktopHubCatalog } from '../../../../shared/orchestration/desktop-hub-contract'

type DesktopHubCatalogProvider = () => Promise<DesktopHubCatalog>

let provider: DesktopHubCatalogProvider | null = null

/** Set by the desktop process. A remote daemon leaves this empty and asks the paired desktop. */
export function setDesktopHubCatalogProvider(next: DesktopHubCatalogProvider | null): void {
  provider = next
}

export function readDesktopHubCatalogProvider(): DesktopHubCatalogProvider | null {
  return provider
}
