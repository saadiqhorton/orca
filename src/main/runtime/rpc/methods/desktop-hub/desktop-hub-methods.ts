import {
  DESKTOP_HUB_SESSION_REFUSED_MESSAGE,
  DesktopHubAnswerParams,
  DesktopHubError,
  type DesktopHubHostRow
} from '../../../../../shared/orchestration/desktop-hub-contract'
import { DesktopHubCallParams } from '../../../../../shared/rpc-contract/orchestration/desktop-hub-call-params'
import { getDesktopHubRegistry } from '../../../orchestration/desktop-hub/desktop-hub-registry'
import { readDesktopHubCatalogProvider } from '../../../orchestration/desktop-hub/desktop-hub-provider'
import { defineOrchestrationMethod } from '../orchestration/access/orchestration-method-access'
import { callDesktopHubHost } from './desktop-hub-call'
import { collectHostSurfaceInventory } from '../orchestration/surface/orchestration-surface-inventory'
import {
  rememberOrcaHostNames,
  rememberOrcaInstructionFile
} from '../../../orchestration/desktop-hub/orca-host-name-cache'
import {
  installOrcaHostInstructions,
  orcaHostInstructionPath,
  settingsWriteGlobalSlice
} from '../../../orchestration/desktop-hub/orca-host-instruction-install'
import { getAppEnvironment, hasAppEnvironment } from '../../../../../shared/app-environment'

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
    handler: async (params, ctx) => callDesktopHubHost(ctx.runtime, params)
  }),
  defineOrchestrationMethod({
    name: 'orchestration.desktopHub.inventory',
    permission: 'workspace',
    params: null,
    access: { kind: 'localOnly', targets: {} },
    handler: async (_params, ctx) => {
      const listed = await listDesktopHub(ctx)
      const hosts: (ReturnType<typeof snapshotHost> & {
        inventory?: unknown
        error?: string
      })[] = []
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
      return { hub: listed.hub, hosts, ...(listed.message ? { message: listed.message } : {}) }
    }
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
  runtime?: object
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
export function inventoryUsesLocalDesktopRuntime(runtime: object): boolean {
  return Boolean(readDesktopHubCatalogProvider()) && !getDesktopHubRegistry(runtime).hasVolunteer()
}

function snapshotHost(row: DesktopHubHostRow) {
  return {
    name: row.name,
    machineName: row.machineName,
    id: row.id,
    hostKey: row.hostKey,
    selector: row.selector,
    status: row.status
  }
}
