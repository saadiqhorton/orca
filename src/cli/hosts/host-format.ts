import type { TuiAgent } from '../../shared/agent-launch/catalog/tui-agent'
import {
  orchestrationTiersFor,
  type OrchestrationTier
} from '../../shared/orchestration/orchestration-knowledge-tier'

export type HostListEntry = {
  kind: 'local' | 'ssh' | 'environment' | 'execution'
  name: string
  id: string
  selector: string
  platform?: string
  machineName?: string
  connected?: boolean
  connectionStatus?: string
}

// Explicit host selectors prevent callers from using a display name on the wrong host scope.
export function formatHostList(result: { hosts: HostListEntry[]; note?: string }): string {
  const kindLabel: Record<HostListEntry['kind'], string> = {
    local: 'local',
    ssh: 'ssh target',
    environment: 'orca server',
    execution: 'desktop host'
  }
  const lines = result.hosts
    .map(
      (host) =>
        `${kindLabel[host.kind].padEnd(12)} ${host.name}${host.machineName && host.machineName !== host.name ? ` (${host.machineName})` : ''}  ${host.platform ?? 'platform unknown'}  ${formatHostConnection(host)}  ->  ${host.selector}`
    )
    .join('\n')
  return result.note ? `${lines}\n${result.note}` : lines
}

/** What one runtime calls itself; `machineName` is absent when the runtime predates the field. */
export type HostNameResult = {
  machineName?: string
  platform?: string
}

export function formatHostName(result: HostNameResult): string {
  return `${result.machineName ?? 'unknown'}${result.platform ? ` (${result.platform})` : ''}`
}

export function formatScratchWorkspace(result: {
  path: string
  worktree: string
  created: boolean
  groupName?: string
  workspaceName?: string
  host?: string
  next?: string
}): string {
  const action = result.created ? 'Created' : 'Using'
  const where = result.host ? ` on ${result.host}` : ''
  return [
    `${action} ${result.groupName ?? 'Orca orchestration'} / ${result.workspaceName ?? 'scratch'} at ${result.path} (${result.worktree})${where}. Visible in the desktop Orca sidebar.`,
    ...(result.next ? [result.next] : [])
  ].join('\n')
}

type HostInventorySession = {
  handle: string
  title?: string | null
  worktree?: string
  agent?: string
}

type HostInventoryProjectMember = {
  kind: 'repo' | 'folder'
  id: string
  name: string
  path: string
  selector: string
  projectGroupId: string
  projectGroupName: string
}

type HostInventory = {
  machineName?: string
  platform?: string
  projects: {
    id: string
    name: string
    parentPath: string | null
    members?: HostInventoryProjectMember[]
  }[]
  folderWorkspaces: {
    id: string
    name: string
    path: string
    projectGroupId: string
    projectGroupName?: string
    selector?: string
  }[]
  repos?: {
    id: string
    name: string
    path: string
    selector: string
    projectGroupId?: string
    projectGroupName?: string
  }[]
  agents: string[]
  sessions: HostInventorySession[]
}

export type HostInventoryRow = {
  name: string
  machineName?: string
  status: string
  selector?: string
  error?: string
  inventory?: HostInventory
  orchestrationTiers?: Partial<Record<TuiAgent, OrchestrationTier>>
}

export function withHostOrchestrationTiers<T extends { result: { hosts: HostInventoryRow[] } }>(
  envelope: T
): T {
  const { hosts } = envelope.result
  return {
    ...envelope,
    result: {
      ...envelope.result,
      hosts: hosts.map((host) =>
        host.inventory
          ? { ...host, orchestrationTiers: orchestrationTiersFor(host.inventory.agents) }
          : host
      )
    }
  }
}

export function formatHostInventory(result: {
  hosts: HostInventoryRow[]
  message?: string
}): string {
  const blocks = result.hosts.map((host) => {
    const title = `${host.name}${host.machineName && host.machineName !== host.name ? ` (${host.machineName})` : ''}  ${host.status}${host.selector ? `  ${host.selector}` : ''}`
    if (host.error && !host.inventory) {
      return `${title}\n  error: ${host.error}`
    }
    const inventory = host.inventory
    if (!inventory) {
      return title
    }
    const agents = inventory.agents.length > 0 ? inventory.agents.join(', ') : '(none detected)'
    const projects =
      inventory.projects.length === 0
        ? '  projects: (none)'
        : inventory.projects
            .map((project) => {
              const members =
                project.members && project.members.length > 0
                  ? `  members: ${project.members.map((member) => member.selector).join(', ')}`
                  : ''
              return `  project: ${project.name}${project.parentPath ? `  ${project.parentPath}` : ''}${members}`
            })
            .join('\n')
    const folders =
      inventory.folderWorkspaces.length === 0
        ? '  folders: (none)'
        : inventory.folderWorkspaces
            .map((folder) => `  folder: ${folder.name}  folder:${folder.id}  path:${folder.path}`)
            .join('\n')
    const repos =
      !inventory.repos || inventory.repos.length === 0
        ? '  repos: (none)'
        : inventory.repos.map((repo) => `  repo: ${repo.name}  ${repo.selector}`).join('\n')
    const sessions =
      inventory.sessions.length === 0
        ? '  sessions: (none)'
        : inventory.sessions
            .map((session) => {
              const agent = session.agent ? `  ${session.agent}` : ''
              const titleText = session.title ? `  ${session.title}` : ''
              return `  session: ${session.handle}${agent}${titleText}`
            })
            .join('\n')
    return `${title}\n  agents: ${agents}\n${projects}\n${folders}\n${repos}\n${sessions}`
  })
  const body = blocks.join('\n\n')
  return result.message ? `${body}\n${result.message}` : body
}

function formatHostConnection(host: HostListEntry): string {
  if (host.kind === 'execution') {
    return host.connectionStatus ?? 'connection unknown'
  }
  if (host.kind !== 'ssh') {
    return ''
  }
  if (host.connected === undefined) {
    return `connection unknown${host.connectionStatus ? ` (${host.connectionStatus})` : ''}`
  }
  return host.connected
    ? `connected${host.connectionStatus ? ` (${host.connectionStatus})` : ''}`
    : `not connected${host.connectionStatus ? ` (${host.connectionStatus})` : ''}`
}
