import {
  DESKTOP_HUB_UNAVAILABLE_MESSAGE,
  desktopHubHostError,
  desktopHubRowMatches,
  type DesktopHubHostStatus
} from '../../shared/orchestration/desktop-hub-contract'
import { unknownDesktopHubHostMessage } from '../../shared/orchestration/orca-host-awareness'
import { quoteCliCommandArgument } from '../arguments/shell-command-quote'
import type { RuntimeClient } from '../runtime/client'
import { RuntimeClientError } from '../runtime/connection/types'
import { isDesktopHubHostValue } from './desktop-hub-host-flag'
import { wrapDesktopHubClient } from './desktop-hub-forwarding-client'

export type HubListRow = {
  kind?: string
  name: string
  machineName?: string
  label?: string
  id?: string
  hostKey?: string
  aliases?: string[]
  status?: string
}

export type DesktopHubHostResolution =
  | { status: 'matched'; row: HubListRow; names: string[]; hub?: unknown }
  | { status: 'unknown'; names: string[] }
  | { status: 'unavailable'; message: string }

function connectedNames(hosts: HubListRow[]): string[] {
  return hosts
    .map((row) => row.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
}

export function throwDesktopHubHostResolution(
  host: string,
  resolved: Exclude<DesktopHubHostResolution, { status: 'matched' }>
): never {
  if (resolved.status === 'unavailable') {
    throw new RuntimeClientError('desktop_hub_unavailable', resolved.message)
  }
  throw new RuntimeClientError('unknown_host', unknownDesktopHubHostMessage(host, resolved.names), {
    nextSteps: [
      'orca host inventory --json',
      ...resolved.names.map(
        (name) =>
          `orca agent launch --host ${quoteCliCommandArgument(name)} --agent <agent> --prompt "<task>" --json`
      )
    ]
  })
}

export async function resolveDesktopHubHost(
  client: Pick<RuntimeClient, 'call'>,
  alias: string
): Promise<DesktopHubHostResolution> {
  let listed: { hosts?: unknown; hub?: unknown }
  try {
    listed = (
      await client.call<{ hosts?: unknown; hub?: unknown }>('orchestration.desktopHub.list', {})
    ).result
  } catch (error) {
    const code = error instanceof RuntimeClientError ? error.code : undefined
    if (code === 'method_not_found') {
      throw error
    }
    return { status: 'unavailable', message: DESKTOP_HUB_UNAVAILABLE_MESSAGE }
  }
  if (!Array.isArray(listed.hosts)) {
    return { status: 'unavailable', message: DESKTOP_HUB_UNAVAILABLE_MESSAGE }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: list RPC hosts are catalog rows; unmatched shapes become unknown_host below.
  const rows = listed.hosts as HubListRow[]
  const names = connectedNames(rows)
  const row = rows.find(
    (candidate) => typeof candidate?.name === 'string' && desktopHubRowMatches(candidate, alias)
  )
  if (!row) {
    return { status: 'unknown', names }
  }
  return { status: 'matched', row, names, hub: listed.hub }
}

/**
 * When `--host` names a desktop-connected machine, retarget the client there.
 * Unknown names and hub failures refuse instead of running locally.
 */
export async function bindDesktopHubHost(
  client: RuntimeClient,
  flags: Map<string, string | boolean>
): Promise<RuntimeClient> {
  const host = flags.get('host')
  if (!isDesktopHubHostValue(host)) {
    return client
  }
  const resolved = await resolveDesktopHubHost(client, host)
  if (resolved.status !== 'matched') {
    throwDesktopHubHostResolution(host, resolved)
  }
  const status: DesktopHubHostStatus =
    resolved.row.status === 'needs_sign_in' ||
    resolved.row.status === 'unreachable' ||
    resolved.row.status === 'connected'
      ? resolved.row.status
      : 'unreachable'
  const blocked = desktopHubHostError(status, resolved.row.name)
  if (blocked) {
    throw new RuntimeClientError(blocked.code, blocked.message)
  }
  flags.delete('host')
  const namesThisDesktop =
    resolved.row.hostKey === 'desktop' ||
    resolved.row.kind === 'desktop' ||
    resolved.row.id === 'desktop'
  // Only the desktop process may skip the wrap. A remote listing the same row must hop the hub.
  if (namesThisDesktop && resolved.hub !== 'remote') {
    return client
  }
  return wrapDesktopHubClient(client, resolved.row.name)
}
