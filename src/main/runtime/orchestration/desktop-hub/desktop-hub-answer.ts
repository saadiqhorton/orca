import type { RuntimeRpcResponse } from '../../../../shared/remote-runtime/rpc/runtime-rpc-envelope'
import {
  DesktopHubError,
  desktopHubHostError,
  desktopHubRowMatches,
  unknownDesktopHubHost,
  type DesktopHubCatalog,
  type DesktopHubPlacement,
  type DesktopHubRequestEvent
} from '../../../../shared/orchestration/desktop-hub-contract'

export type DesktopHubHostCaller = (
  placement: DesktopHubPlacement,
  method: string,
  params: unknown,
  timeoutMs: number | undefined,
  envelope: unknown
) => Promise<RuntimeRpcResponse<unknown>>

/** Pure: decides from the desktop's catalog. A host that is not connected is never dialed. */
export async function answerDesktopHubRequest(input: {
  request: DesktopHubRequestEvent
  catalog: () => DesktopHubCatalog | Promise<DesktopHubCatalog>
  callHost: DesktopHubHostCaller
  callLocal?: DesktopHubHostCaller
}): Promise<
  { ok: true; result: unknown } | { ok: false; error: { code: string; message: string } }
> {
  try {
    const catalog = await input.catalog()
    if (input.request.op === 'list') {
      return { ok: true, result: { hosts: catalog.hosts } }
    }
    const row = findRow(catalog, input.request)
    if (!row) {
      const error = unknownDesktopHubHost(input.request.name ?? input.request.hostKey ?? '')
      return { ok: false, error: { code: error.code, message: error.message } }
    }
    const blocked = desktopHubHostError(row.status, row.name)
    if (blocked) {
      return { ok: false, error: { code: blocked.code, message: blocked.message } }
    }
    const placement = catalog.placements.find((candidate) => candidate.hostKey === row.hostKey)
    if (!placement?.peerFingerprint) {
      return {
        ok: false,
        error: {
          code: 'host_unreachable',
          message: `Host "${row.name}" is connected, but this desktop could not open a worker route to it. Orca will not try SSH.`
        }
      }
    }
    if (input.request.op === 'resolve') {
      return { ok: true, result: placement }
    }
    if (input.request.op !== 'call' || !input.request.method) {
      return {
        ok: false,
        error: { code: 'invalid_argument', message: 'Desktop hub call is missing a method.' }
      }
    }
    const dial = row.hostKey === 'desktop' ? input.callLocal : input.callHost
    if (!dial) {
      return {
        ok: false,
        error: {
          code: 'invalid_argument',
          message: `Host "${row.name}" is the desktop app. Start that worker in a session on the desktop. Orca will not use SSH.`
        }
      }
    }
    const result = await dial(
      placement,
      input.request.method,
      input.request.params,
      input.request.timeoutMs,
      input.request.envelope
    )
    return { ok: true, result }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code = error instanceof DesktopHubError ? error.code : 'host_unreachable'
    return { ok: false, error: { code, message } }
  }
}

function findRow(catalog: DesktopHubCatalog, request: DesktopHubRequestEvent) {
  if (request.hostKey) {
    return catalog.hosts.find((row) => row.hostKey === request.hostKey)
  }
  const name = request.name
  if (!name) {
    return undefined
  }
  return catalog.hosts.find((row) => desktopHubRowMatches(row, name))
}
