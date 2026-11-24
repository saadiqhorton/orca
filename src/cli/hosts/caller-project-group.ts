import { resolve as resolvePath } from 'node:path'
import type { FolderWorkspace } from '../../shared/folder-workspaces/folder-workspace-types'
import type { ProjectGroup } from '../../shared/project/groups/project-group-types'
import type { Repo } from '../../shared/repository/repo-types'
import { parseWorkspaceKey } from '../../shared/workspace/identity/workspace-scope'
import type { RuntimeClient } from '../runtime/client'
import { RuntimeClientError } from '../runtime/connection/types'
import { resolveCurrentWorktreeSelection } from '../workspace-selection/workspace-selector'

/** The visible project group that contains the caller’s current workspace, matched by name across hosts. */
export async function readCallerProjectGroupName(
  client: RuntimeClient,
  cwd: string
): Promise<string | undefined> {
  let selector: string
  let worktreeId: string | undefined
  try {
    const selection = await resolveCurrentWorktreeSelection(cwd, client)
    selector = selection.selector
    worktreeId = selection.worktreeId
  } catch (error) {
    if (error instanceof RuntimeClientError && error.code === 'selector_not_found') {
      return undefined
    }
    throw error
  }
  const [groups, folders, repos] = await Promise.all([
    readGroups(client),
    readFolders(client),
    readRepos(client)
  ])
  const folderId =
    folderIdOf(selector) ?? (typeof worktreeId === 'string' ? folderIdOf(worktreeId) : undefined)
  if (folderId) {
    const folder = folders.find((row) => row.id === folderId)
    return groups.find((group) => group.id === folder?.projectGroupId)?.name
  }
  const cwdPath = resolvePath(cwd)
  const repo = repos.find(
    (row) =>
      cwdPath === row.path ||
      cwdPath.startsWith(`${row.path}/`) ||
      cwdPath.startsWith(`${row.path}\\`)
  )
  return groups.find((group) => group.id === repo?.projectGroupId)?.name
}

function folderIdOf(selector: string): string | undefined {
  const parsed = parseWorkspaceKey(selector.startsWith('id:') ? selector.slice(3) : selector)
  return parsed?.type === 'folder' ? parsed.folderWorkspaceId : undefined
}

async function readGroups(client: RuntimeClient): Promise<ProjectGroup[]> {
  try {
    return (await client.call<{ groups: ProjectGroup[] }>('projectGroup.list')).result.groups
  } catch (error) {
    return missingCatalog(error)
  }
}

async function readFolders(client: RuntimeClient): Promise<FolderWorkspace[]> {
  try {
    return (await client.call<{ folderWorkspaces: FolderWorkspace[] }>('folderWorkspace.list'))
      .result.folderWorkspaces
  } catch (error) {
    return missingCatalog(error)
  }
}

async function readRepos(client: RuntimeClient): Promise<Repo[]> {
  try {
    return (await client.call<{ repos: Repo[] }>('repo.list')).result.repos
  } catch (error) {
    return missingCatalog(error)
  }
}

function missingCatalog(error: unknown): [] {
  if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
    return []
  }
  throw error
}
