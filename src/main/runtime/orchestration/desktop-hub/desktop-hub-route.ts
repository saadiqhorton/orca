import {
  DESKTOP_HUB_UNAVAILABLE_MESSAGE,
  DesktopHubError,
  desktopHubHostError,
  desktopHubRowMatches,
  unknownDesktopHubHost,
  type DesktopHubCatalog
} from '../../../../shared/orchestration/desktop-hub-contract'
import { getDesktopHubRegistry } from './desktop-hub-registry'
import { readDesktopHubCatalogProvider } from './desktop-hub-provider'

type LocalServerResolver = {
  resolveOrchestrationWorkerServer?: (selector: string) => { environmentId: string }
}

/**
 * `--host` on worker-start and send. A remote session asks the paired desktop.
 * The desktop itself already holds the pairing store, so it uses that environment id.
 */
export async function desktopHubOnSelector(
  runtime: WeakKey,
  host: string | undefined,
  on: string | undefined
): Promise<string | undefined> {
  if (host === undefined) {
    return on
  }
  if (on !== undefined) {
    throw new DesktopHubError('invalid_argument', 'Use either --host or --on, not both.')
  }
  if (host.startsWith('ssh:')) {
    throw new DesktopHubError(
      'host_unreachable',
      `Host "${host}" is an SSH target. Orca will not use SSH to start a worker.`
    )
  }
  const registry = getDesktopHubRegistry(runtime)
  if (registry.hasVolunteer()) {
    return (await registry.place(host)).selector
  }
  const provider = readDesktopHubCatalogProvider()
  if (provider) {
    return selectorFromDesktopCatalog(await provider(), host)
  }
  const resolved = resolveLocalServer(runtime, host)
  if (resolved) {
    return resolved
  }
  throw new DesktopHubError('desktop_hub_unavailable', DESKTOP_HUB_UNAVAILABLE_MESSAGE)
}

export async function routeDesktopHubCommand<T extends { host?: string; on?: string }>(
  runtime: WeakKey,
  params: T
): Promise<T> {
  const on = await desktopHubOnSelector(runtime, params.host, params.on)
  if (params.host === undefined) {
    return params
  }
  return { ...params, on, host: undefined }
}

function selectorFromDesktopCatalog(catalog: DesktopHubCatalog, host: string): string | undefined {
  const row = catalog.hosts.find((candidate) => desktopHubRowMatches(candidate, host))
  if (!row) {
    throw unknownDesktopHubHost(
      host,
      catalog.hosts.map((candidate) => candidate.name)
    )
  }
  const blocked = desktopHubHostError(row.status, row.name)
  if (blocked) {
    throw blocked
  }
  if (row.hostKey === 'desktop') {
    return undefined
  }
  return row.hostKey
}

function resolveLocalServer(runtime: WeakKey, host: string): string | null {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: optional worker-server lookup on runtimes that expose it; missing method means no local row.
  const resolver = runtime as LocalServerResolver
  if (!resolver.resolveOrchestrationWorkerServer) {
    return null
  }
  try {
    return resolver.resolveOrchestrationWorkerServer(host).environmentId
  } catch {
    return null
  }
}
