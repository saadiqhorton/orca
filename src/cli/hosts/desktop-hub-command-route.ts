import { isDesktopHubHostValue } from './desktop-hub-host-flag'
import { ignoresRemoteSelection } from '../dispatch/remote-selection-scope'
import {
  desktopHubHostError,
  desktopHubRowMatches
} from '../../shared/orchestration/desktop-hub-contract'
import { isHomeRunMailboxSelector } from '../../shared/orchestration/orchestration-dispatch-id'
import type { RuntimeClient } from '../runtime/client'
import { RuntimeClientError } from '../runtime/types'
import { wrapDesktopHubClient } from './desktop-hub-forwarding-client'

const KEEP_HOST_ORCHESTRATION = new Set(['worker-start', 'send', 'reply'])

/** Dispatch ids live on the caller's Run; home RPCs already federate to the worker host. */
export const DISPATCH_SCOPED_ORCHESTRATION_COMMANDS: ReadonlySet<string> = new Set([
  'worker-show',
  'worker-read',
  'worker-stop',
  'worker-abandon',
  'worker-release',
  'worker-keep-open',
  'worker-retain',
  'approve',
  'deny'
])

const HOME_RUN_MAILBOX_FLAGS = [
  'dispatch',
  'retry-of',
  'dispatch-id',
  'to',
  'terminal',
  'run'
] as const

/** Commands that still consume `--host` themselves instead of retargeting the runtime client. */
export function desktopHubCommandKeepsHostFlag(commandPath: readonly string[]): boolean {
  const key = commandPath.join(' ')
  if (key === 'host list' || key === 'host rm' || key === 'host name' || key === 'host inventory') {
    return true
  }
  if (commandPath[0] === 'environment') {
    return true
  }
  return commandPath[0] === 'orchestration' && KEEP_HOST_ORCHESTRATION.has(commandPath[1] ?? '')
}

export function orchestrationCommandStaysOnHomeRun(
  commandPath: readonly string[],
  flags: ReadonlyMap<string, string | boolean>
): boolean {
  if (commandPath[0] !== 'orchestration') {
    return false
  }
  if (DISPATCH_SCOPED_ORCHESTRATION_COMMANDS.has(commandPath[1] ?? '')) {
    return true
  }
  for (const key of HOME_RUN_MAILBOX_FLAGS) {
    const value = flags.get(key)
    if (typeof value === 'string' && isHomeRunMailboxSelector(value)) {
      return true
    }
  }
  return false
}

export function orchestrationRunsOnCallersOrca(
  commandPath: readonly string[],
  flags: ReadonlyMap<string, string | boolean>
): boolean {
  if (commandPath[0] !== 'orchestration' || (!flags.has('on') && !flags.has('host'))) {
    return false
  }
  if (KEEP_HOST_ORCHESTRATION.has(commandPath[1] ?? '')) {
    return flags.has('on') || isDesktopHubHostValue(flags.get('host'))
  }
  return orchestrationCommandStaysOnHomeRun(commandPath, flags)
}

export function shouldWrapDesktopHubHost(
  commandPath: readonly string[],
  flags: ReadonlyMap<string, string | boolean>
): boolean {
  const host = flags.get('host')
  if (!isDesktopHubHostValue(host)) {
    return false
  }
  if (
    desktopHubCommandKeepsHostFlag(commandPath) ||
    ignoresRemoteSelection(commandPath) ||
    orchestrationCommandStaysOnHomeRun(commandPath, flags)
  ) {
    return false
  }
  return true
}

export function needsDefaultRemoteWorktree(
  commandPath: readonly string[],
  flags: ReadonlyMap<string, string | boolean>
): boolean {
  if (flags.has('worktree')) {
    return false
  }
  const key = commandPath.join(' ')
  return key === 'agent launch' || key === 'terminal create'
}

export function isFolderWorktreeCreateWithoutRepo(
  commandPath: readonly string[],
  flags: ReadonlyMap<string, string | boolean>
): boolean {
  return (
    commandPath.join(' ') === 'worktree create' &&
    !flags.has('repo') &&
    !flags.has('project') &&
    !flags.has('project-host-setup')
  )
}

type HubListRow = {
  kind?: string
  name: string
  machineName?: string
  label?: string
  id?: string
  status?: string
}

/**
 * When `--host` names a connected desktop-hub machine, retarget the client there and
 * drop `--host` so existing commands run as if they were invoked on that host.
 * Unknown names are left for SSH / project-host resolution. A known but not-connected
 * hub host is refused (Orca will not try SSH).
 */
export async function bindDesktopHubHost(
  client: RuntimeClient,
  flags: Map<string, string | boolean>
): Promise<RuntimeClient> {
  const host = flags.get('host')
  if (!isDesktopHubHostValue(host)) {
    return client
  }
  const row = await matchDesktopHubHost(client, host)
  if (!row) {
    return client
  }
  const blocked = desktopHubHostError(
    row.status === 'needs_sign_in' || row.status === 'unreachable' || row.status === 'connected'
      ? row.status
      : 'unreachable',
    row.name
  )
  if (blocked) {
    throw new RuntimeClientError(blocked.code, blocked.message)
  }
  flags.delete('host')
  return wrapDesktopHubClient(client, row.name)
}

export async function matchDesktopHubHost(
  client: Pick<RuntimeClient, 'call'>,
  alias: string
): Promise<HubListRow | null> {
  let hosts: unknown
  try {
    hosts = (await client.call<{ hosts?: unknown }>('orchestration.desktopHub.list', {})).result
      .hosts
  } catch {
    return null
  }
  if (!Array.isArray(hosts)) {
    return null
  }
  const row = (hosts as HubListRow[]).find(
    (candidate) => typeof candidate?.name === 'string' && desktopHubRowMatches(candidate, alias)
  )
  return row ?? null
}
