import {
  detectAgentsOnHost,
  type AgentDetectionHost
} from '../../../../../preflight/workspace-agent-detection'
import { agentCommandOverrideDetectionOptions } from '../../../../../preflight/installed-agent-detection'
import type { InventoryProjectGroup } from '../../../../../../shared/orchestration/orchestration-group-selector'
import {
  folderInventoryRow,
  projectGroupsWithMembers,
  repoInventoryRow,
  type InventoryFolderRow,
  type InventoryGroupRow,
  type InventoryRepoRow
} from './orchestration-inventory-membership'

export type InventoryRuntime = {
  listVisibleProjectGroups: () => InventoryGroupRow[]
  listVisibleFolderWorkspaces: () => InventoryFolderRow[]
  listVisibleRepos?: () => InventoryRepoRow[]
  listTerminals?: () => Promise<{
    terminals: {
      handle: string
      title?: string | null
      worktree?: string
      status?: string
      agentIdentity?: { agent?: string } | string | null
    }[]
  }>
  resolveAgentDetectionHost?: (
    worktreeId?: string | null,
    repoId?: string
  ) => AgentDetectionHost | Promise<AgentDetectionHost>
  requireStore?: () => {
    getSettings?: () => { agentCmdOverrides?: Partial<Record<string, string>> }
  }
  getStatus?: () => { machineName?: string; hostPlatform?: string }
}

export type HostSurfaceInventory = {
  machineName?: string
  platform?: string
  projects: InventoryProjectGroup[]
  folderWorkspaces: {
    id: string
    name: string
    path: string
    projectGroupId: string
    projectGroupName?: string
    selector: string
  }[]
  repos: {
    id: string
    name: string
    path: string
    selector: string
    projectGroupId?: string
    projectGroupName?: string
  }[]
  agents: string[]
  sessions: {
    handle: string
    title?: string | null
    worktree?: string
    agent?: string
  }[]
}

export async function collectHostSurfaceInventory(
  runtime: InventoryRuntime
): Promise<HostSurfaceInventory> {
  const status = runtime.getStatus?.()
  const groups = runtime.listVisibleProjectGroups()
  const folders = runtime.listVisibleFolderWorkspaces()
  const repos = runtime.listVisibleRepos?.() ?? []
  const nameById = new Map(groups.map((group) => [group.id, group.name]))
  const projects = projectGroupsWithMembers(groups, folders, repos)
  const agents = await listHostAgents(runtime)
  const sessions = await listHostSessions(runtime)
  return {
    ...(status?.machineName ? { machineName: status.machineName } : {}),
    ...(status?.hostPlatform ? { platform: status.hostPlatform } : {}),
    projects,
    folderWorkspaces: folders.map((folder) => {
      const row = folderInventoryRow(folder, nameById.get(folder.projectGroupId))
      return {
        id: row.id,
        name: row.name,
        path: row.folderPath,
        projectGroupId: row.projectGroupId,
        selector: row.selector,
        ...(row.projectGroupName ? { projectGroupName: row.projectGroupName } : {})
      }
    }),
    repos: repos.map((repo) =>
      repoInventoryRow(repo, repo.projectGroupId ? nameById.get(repo.projectGroupId) : undefined)
    ),
    agents,
    sessions
  }
}

export function filterHostSurfaceInventory(
  inventory: HostSurfaceInventory,
  groupName: string
): HostSurfaceInventory {
  const wanted = groupName.trim().toLowerCase()
  const projects = inventory.projects.filter((group) => group.name.trim().toLowerCase() === wanted)
  const ids = new Set(projects.map((group) => group.id))
  return {
    ...inventory,
    projects,
    folderWorkspaces: inventory.folderWorkspaces.filter(
      (folder) =>
        ids.has(folder.projectGroupId) || folder.projectGroupName?.toLowerCase() === wanted
    ),
    repos: inventory.repos.filter(
      (repo) =>
        (repo.projectGroupId && ids.has(repo.projectGroupId)) ||
        repo.projectGroupName?.toLowerCase() === wanted
    )
  }
}

export async function listHostAgents(runtime: InventoryRuntime): Promise<string[]> {
  try {
    const host = runtime.resolveAgentDetectionHost
      ? await runtime.resolveAgentDetectionHost(null)
      : ({ kind: 'local' } satisfies AgentDetectionHost)
    const overrides = runtime.requireStore?.().getSettings?.().agentCmdOverrides
    return await detectAgentsOnHost(host, agentCommandOverrideDetectionOptions(overrides ?? null))
  } catch {
    return []
  }
}

async function listHostSessions(
  runtime: InventoryRuntime
): Promise<HostSurfaceInventory['sessions']> {
  if (!runtime.listTerminals) {
    return []
  }
  try {
    const { terminals } = await runtime.listTerminals()
    return terminals.map((terminal) => {
      const exited = terminal.status === 'exited' || terminal.status === 'stopped'
      const agent = exited ? undefined : agentOf(terminal.agentIdentity)
      return {
        handle: terminal.handle,
        ...(terminal.title ? { title: terminal.title } : {}),
        ...(terminal.worktree ? { worktree: terminal.worktree } : {}),
        ...(agent ? { agent } : {})
      }
    })
  } catch {
    return []
  }
}

function agentOf(identity: { agent?: string } | string | null | undefined): string | undefined {
  if (typeof identity === 'string' && identity.length > 0) {
    return identity
  }
  if (identity && typeof identity === 'object' && typeof identity.agent === 'string') {
    return identity.agent
  }
  return undefined
}
