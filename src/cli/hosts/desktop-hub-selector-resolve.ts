import { RuntimeClientError } from '../runtime/types'
import type { RuntimeClient } from '../runtime/client'
import { shouldWrapDesktopHubHost } from './desktop-hub-command-route'
import { wrapDesktopHubClient } from './desktop-hub-forwarding-client'

const SELECTOR_FLAGS = ['worktree', 'terminal', 'to', 'parent-worktree'] as const

type HostInventorySession = { handle: string }
type HostInventoryFolder = { id: string }
type HostInventoryRow = {
  name: string
  status?: string
  inventory?: {
    folderWorkspaces?: HostInventoryFolder[]
    sessions?: HostInventorySession[]
  }
}

type SelectorHit = { host: string; selector: string }

export function isCrossHostSelector(value: string): boolean {
  return value.startsWith('folder:') || value.startsWith('id:folder:') || value.startsWith('term_')
}

export function collectCrossHostSelectors(flags: ReadonlyMap<string, string | boolean>): string[] {
  const values: string[] = []
  for (const key of SELECTOR_FLAGS) {
    const value = flags.get(key)
    if (typeof value === 'string' && isCrossHostSelector(value)) {
      values.push(value)
    }
  }
  return values
}

function folderId(selector: string): string | null {
  if (selector.startsWith('folder:')) {
    return selector.slice('folder:'.length)
  }
  if (selector.startsWith('id:folder:')) {
    return selector.slice('id:folder:'.length)
  }
  return null
}

function inventoryHits(hosts: HostInventoryRow[], selector: string): SelectorHit[] {
  const folder = folderId(selector)
  const hits: SelectorHit[] = []
  for (const host of hosts) {
    if (host.status !== 'connected' || !host.inventory) {
      continue
    }
    const folders = host.inventory.folderWorkspaces ?? []
    const sessions = host.inventory.sessions ?? []
    const matched =
      (folder !== null && folders.some((entry) => entry.id === folder)) ||
      sessions.some((session) => session.handle === selector)
    if (matched) {
      hits.push({ host: host.name, selector })
    }
  }
  return hits
}

function formatCorrectedCommand(
  commandPath: readonly string[],
  flags: ReadonlyMap<string, string | boolean>,
  host: string
): string {
  const parts = ['orca', ...commandPath, `--host ${host}`]
  for (const [key, value] of flags) {
    if (key === 'host' || key === 'json' || key === 'help') {
      continue
    }
    if (value === true) {
      parts.push(`--${key}`)
    } else if (typeof value === 'string') {
      parts.push(`--${key} ${JSON.stringify(value)}`)
    }
  }
  return parts.join(' ')
}

export function resolveSelectorHostHits(
  hosts: HostInventoryRow[],
  selectors: readonly string[]
):
  | { kind: 'none' }
  | { kind: 'unique'; host: string }
  | { kind: 'ambiguous'; hits: SelectorHit[] } {
  const hits = selectors.flatMap((selector) => inventoryHits(hosts, selector))
  if (hits.length === 0) {
    return { kind: 'none' }
  }
  const uniqueHosts = [...new Set(hits.map((hit) => hit.host))]
  if (uniqueHosts.length === 1) {
    return { kind: 'unique', host: uniqueHosts[0]! }
  }
  return { kind: 'ambiguous', hits }
}

function throwAmbiguous(
  commandPath: readonly string[],
  flags: ReadonlyMap<string, string | boolean>,
  hits: SelectorHit[]
): never {
  const byHost = new Map<string, string[]>()
  for (const hit of hits) {
    const list = byHost.get(hit.host) ?? []
    list.push(hit.selector)
    byHost.set(hit.host, list)
  }
  const commands = [...byHost.entries()].map(
    ([host, selectors]) =>
      `${formatCorrectedCommand(commandPath, flags, host)}  (owns ${selectors.join(', ')})`
  )
  throw new RuntimeClientError(
    'selector_ambiguous',
    `Selector belongs to more than one connected host. Retry with --host:\n${commands.join('\n')}`,
    {
      hosts: [...byHost.keys()],
      nextSteps: commands
    }
  )
}

async function loadHubInventory(
  client: Pick<RuntimeClient, 'call'>
): Promise<HostInventoryRow[] | null> {
  try {
    const response = await client.call<{ hosts?: HostInventoryRow[] }>(
      'orchestration.desktopHub.inventory',
      {}
    )
    return Array.isArray(response.result.hosts) ? response.result.hosts : null
  } catch {
    return null
  }
}

/** Unique remote folder:/term_ selectors retarget the command; collisions name the owning hosts. */
export async function resolveRemoteSelectorsAcrossHosts(
  client: RuntimeClient,
  commandPath: readonly string[],
  flags: Map<string, string | boolean>
): Promise<RuntimeClient> {
  if (flags.has('host') || client.isRemote) {
    return client
  }
  const selectors = collectCrossHostSelectors(flags)
  if (selectors.length === 0) {
    return client
  }
  const hosts = await loadHubInventory(client)
  if (!hosts) {
    return client
  }
  const matched = resolveSelectorHostHits(hosts, selectors)
  if (matched.kind === 'none') {
    return client
  }
  if (matched.kind === 'ambiguous') {
    throwAmbiguous(commandPath, flags, matched.hits)
  }
  const host = matched.host
  const probe = new Map(flags)
  probe.set('host', host)
  if (shouldWrapDesktopHubHost(commandPath, probe)) {
    flags.delete('host')
    return wrapDesktopHubClient(client, host)
  }
  flags.set('host', host)
  return client
}
