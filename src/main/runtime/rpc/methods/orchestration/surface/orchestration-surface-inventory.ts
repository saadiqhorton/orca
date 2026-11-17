import {
  detectAgentsOnHost,
  type AgentDetectionHost
} from '../../../../../preflight/workspace-agent-detection'
import { agentCommandOverrideDetectionOptions } from '../../../../../preflight/installed-agent-detection'

type InventoryRuntime = {
  listVisibleProjectGroups: () => { id: string; name: string; parentPath: string | null }[]
  listVisibleFolderWorkspaces: () => {
    id: string
    name: string
    folderPath: string
    projectGroupId: string
  }[]
  listVisibleRepos?: () => {
    id: string
    path: string
    displayName?: string
    kind?: string
  }[]
  listTerminals?: () => Promise<{
    terminals: {
      handle: string
      title?: string | null
      worktree?: string
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
  projects: { id: string; name: string; parentPath: string | null }[]
  folderWorkspaces: { id: string; name: string; path: string; projectGroupId: string }[]
  repos: { id: string; name: string; path: string; selector: string }[]
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
  const projects = runtime.listVisibleProjectGroups().map((group) => ({
    id: group.id,
    name: group.name,
    parentPath: group.parentPath
  }))
  const folderWorkspaces = runtime.listVisibleFolderWorkspaces().map((folder) => ({
    id: folder.id,
    name: folder.name,
    path: folder.folderPath,
    projectGroupId: folder.projectGroupId
  }))
  const repos = listHostRepos(runtime)
  const agents = await listHostAgents(runtime)
  const sessions = await listHostSessions(runtime)
  return {
    ...(status?.machineName ? { machineName: status.machineName } : {}),
    ...(status?.hostPlatform ? { platform: status.hostPlatform } : {}),
    projects,
    folderWorkspaces,
    repos,
    agents,
    sessions
  }
}

function listHostRepos(runtime: InventoryRuntime): HostSurfaceInventory['repos'] {
  return (runtime.listVisibleRepos?.() ?? []).map((repo) => ({
    id: repo.id,
    name: repo.displayName || repo.id,
    path: repo.path,
    selector: `path:${repo.path}`
  }))
}

async function listHostAgents(runtime: InventoryRuntime): Promise<string[]> {
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
    return terminals.map((terminal) => ({
      handle: terminal.handle,
      ...(terminal.title ? { title: terminal.title } : {}),
      ...(terminal.worktree ? { worktree: terminal.worktree } : {}),
      ...(agentOf(terminal.agentIdentity) ? { agent: agentOf(terminal.agentIdentity) } : {})
    }))
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
