import {
  DESKTOP_HUB_SESSION_REFUSED_MESSAGE,
  DESKTOP_HUB_UNAVAILABLE_MESSAGE,
  DesktopHubAnswerParams,
  DesktopHubError,
  type DesktopHubHostRow,
  type DesktopHubLocate
} from '../../../../../shared/orchestration/desktop-hub-contract'
import {
  DesktopHubCallParams,
  DesktopHubLocateParams
} from '../../../../../shared/rpc-contract/orchestration/desktop-hub-call-params'
import { getDesktopHubRegistry } from '../../../orchestration/desktop-hub/desktop-hub-registry'
import { readDesktopHubCatalogProvider } from '../../../orchestration/desktop-hub/desktop-hub-provider'
import { defineOrchestrationMethod } from '../orchestration/access/orchestration-method-access'
import { callDesktopHubHost, type HubCallRuntime } from './desktop-hub-call'
import {
  collectHostSurfaceInventory,
  type InventoryRuntime
} from '../orchestration/surface/orchestration-surface-inventory'
import {
  rememberOrcaHostNames,
  rememberOrcaInstructionFile
} from '../../../orchestration/desktop-hub/orca-host-name-cache'
import {
  installOrcaHostInstructions,
  orcaHostInstructionPath,
  settingsWriteGlobalSlice,
  type GlobalInstructionSettingsSource
} from '../../../orchestration/desktop-hub/orca-host-instruction-install'
import {
  getAppEnvironment,
  hasAppEnvironment
} from '../../../../../shared/app-lifecycle/app-environment'

/**
 * Routing control plane, not a Run mutation. A local CLI session may list, place, and forward.
 * Only the paired desktop that registered as the hub may answer.
 */
export const DESKTOP_HUB_METHODS = [
  defineOrchestrationMethod({
    name: 'orchestration.desktopHub.list',
    permission: 'workspace',
    params: null,
    access: { kind: 'localOnly', targets: {} },
    handler: async (_params, ctx) => listDesktopHub(ctx)
  }),
  defineOrchestrationMethod({
    name: 'orchestration.desktopHub.call',
    permission: 'workspace',
    params: DesktopHubCallParams,
    access: { kind: 'localOnly', targets: {} },
    handler: async (params, ctx) => {
      getDesktopHubRegistry(ctx.runtime).assertCaller({ pairedDeviceId: ctx.pairedDeviceId })
      return callDesktopHubHost(ctx.runtime, params)
    }
  }),
  defineOrchestrationMethod({
    name: 'orchestration.desktopHub.inventory',
    permission: 'workspace',
    params: null,
    access: { kind: 'localOnly', targets: {} },
    handler: async (_params, ctx) => {
      const listed = await listDesktopHub(ctx)
      return {
        hub: listed.hub,
        hosts: await collectDesktopHubInventory(ctx),
        ...(listed.message ? { message: listed.message } : {})
      }
    }
  }),
  defineOrchestrationMethod({
    name: 'orchestration.desktopHub.locate',
    permission: 'workspace',
    params: DesktopHubLocateParams,
    access: { kind: 'localOnly', targets: {} },
    handler: async (params, ctx) => locateDesktopHubSession(ctx, params.handle)
  }),
  defineOrchestrationMethod({
    name: 'orchestration.desktopHub.answer',
    permission: 'workspace',
    params: DesktopHubAnswerParams,
    access: { kind: 'localOnly', targets: {} },
    handler: async (params, ctx) => {
      if (!ctx.pairedDeviceId) {
        throw new DesktopHubError('session_refused', DESKTOP_HUB_SESSION_REFUSED_MESSAGE)
      }
      return getDesktopHubRegistry(ctx.runtime).answer(ctx.pairedDeviceId, params)
    }
  })
]

type HubInventoryRow = ReturnType<typeof snapshotHost> & {
  inventory?: unknown
  error?: string
}

type HubRuntime = InventoryRuntime & HubCallRuntime

async function collectDesktopHubInventory(ctx: {
  runtime: HubRuntime
  pairedDeviceId?: string
}): Promise<HubInventoryRow[]> {
  const listed = await listDesktopHub(ctx)
  const hosts: HubInventoryRow[] = []
  const onDesktop = inventoryUsesLocalDesktopRuntime(ctx.runtime)
  for (const row of listed.hosts) {
    const base = snapshotHost(row)
    if (row.status !== 'connected') {
      hosts.push({ ...base, error: row.status })
      continue
    }
    try {
      const inventory =
        row.hostKey === 'desktop' && onDesktop
          ? await collectHostSurfaceInventory(ctx.runtime)
          : await callDesktopHubHost(ctx.runtime, {
              host: row.name,
              method: 'orchestration.surface.inventory',
              timeoutMs: 20_000
            })
      hosts.push({ ...base, inventory })
    } catch (error) {
      hosts.push({
        ...base,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return hosts
}

type LocalTerminalRuntime = {
  listTerminals: (
    worktreeSelector?: string,
    limit?: number,
    opts?: { includeVisualLayouts?: boolean }
  ) => Promise<{ terminals: { handle: string }[] }>
}

function listsLocalTerminals(runtime: HubRuntime): runtime is HubRuntime & LocalTerminalRuntime {
  return 'listTerminals' in runtime && typeof runtime.listTerminals === 'function'
}

async function ownsHandleLocally(runtime: HubRuntime, handle: string): Promise<boolean> {
  if (!listsLocalTerminals(runtime)) {
    return false
  }
  try {
    const { terminals } = await runtime.listTerminals(undefined, undefined, {
      includeVisualLayouts: false
    })
    return terminals.some((terminal) => terminal.handle === handle)
  } catch {
    return false
  }
}

function inventoryOwnsHandle(inventory: unknown, handle: string): boolean {
  if (!inventory || typeof inventory !== 'object' || !('sessions' in inventory)) {
    return false
  }
  const { sessions } = inventory
  return (
    Array.isArray(sessions) &&
    sessions.some(
      (session: unknown) =>
        typeof session === 'object' &&
        session !== null &&
        'handle' in session &&
        session.handle === handle
    )
  )
}

/** Local runtime first, then the hub's remembered host, then every connected host's inventory. */
async function locateDesktopHubSession(
  ctx: { runtime: HubRuntime; pairedDeviceId?: string },
  handle: string
): Promise<DesktopHubLocate> {
  if (await ownsHandleLocally(ctx.runtime, handle)) {
    return { owner: 'local' }
  }
  const listed = await listDesktopHub(ctx)
  if (listed.hub === 'unavailable') {
    throw new DesktopHubError('desktop_hub_unavailable', DESKTOP_HUB_UNAVAILABLE_MESSAGE)
  }
  const registry = getDesktopHubRegistry(ctx.runtime)
  const remembered = registry.knownSessionHost(handle)
  if (remembered) {
    const row = listed.hosts.find(
      (candidate) => candidate.hostKey === remembered && candidate.status === 'connected'
    )
    if (row) {
      return locatedHost(row)
    }
  }
  for (const host of await collectDesktopHubInventory(ctx)) {
    if (inventoryOwnsHandle(host.inventory, handle)) {
      registry.rememberSession(handle, host.hostKey)
      return locatedHost(host)
    }
  }
  return { owner: 'none' }
}

function locatedHost(row: {
  name: string
  hostKey: string
  machineName?: string
  id?: string
  label?: string
}): DesktopHubLocate {
  return {
    owner: 'host',
    name: row.name,
    hostKey: row.hostKey,
    ...(row.machineName ? { machineName: row.machineName } : {}),
    ...(row.id ? { id: row.id } : {}),
    ...(row.label ? { label: row.label } : {})
  }
}

async function listDesktopHub(ctx: { runtime: object; pairedDeviceId?: string }): Promise<{
  hub: 'desktop' | 'remote' | 'unavailable'
  hosts: DesktopHubHostRow[]
  message?: string
}> {
  const registry = getDesktopHubRegistry(ctx.runtime)
  registry.assertCaller({ pairedDeviceId: ctx.pairedDeviceId })
  const provider = readDesktopHubCatalogProvider()
  const listed =
    provider && !registry.hasVolunteer()
      ? { hub: 'desktop' as const, hosts: (await provider()).hosts }
      : await registry.list()
  await rememberListedOrcaHosts(listed.hosts, ctx.runtime)
  return listed
}

async function rememberListedOrcaHosts(
  hosts: DesktopHubHostRow[],
  runtime?: GlobalInstructionSettingsSource
): Promise<void> {
  const names = hosts.map((row) => row.name).filter((name) => name.length > 0)
  rememberOrcaHostNames(names)
  if (!hasAppEnvironment()) {
    return
  }
  const userDataPath = getAppEnvironment().getPath('userData')
  rememberOrcaInstructionFile(orcaHostInstructionPath(userDataPath))
  try {
    await installOrcaHostInstructions({
      userDataPath,
      settings: settingsWriteGlobalSlice(runtime)
    })
  } catch {
    // Discovery copy is best-effort; listing hosts must still succeed.
  }
}

/** The desktop process holds the catalog; a remote asks the hub instead of reading its own store. */
export function inventoryUsesLocalDesktopRuntime(runtime: WeakKey): boolean {
  return Boolean(readDesktopHubCatalogProvider()) && !getDesktopHubRegistry(runtime).hasVolunteer()
}

function snapshotHost(row: DesktopHubHostRow) {
  return {
    name: row.name,
    machineName: row.machineName,
    id: row.id,
    label: row.label,
    ...(row.aliases ? { aliases: row.aliases } : {}),
    hostKey: row.hostKey,
    selector: row.selector,
    status: row.status
  }
}
