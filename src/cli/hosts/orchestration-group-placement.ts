import { getOptionalStringFlag } from '../arguments/flags'
import type { RuntimeClient } from '../runtime/client'
import { RuntimeClientError } from '../runtime/connection/types'
import { applyGroupWorktreeFlag } from './orchestration-group-flag'
import type { FolderWorkspace } from '../../shared/folder-workspaces/folder-workspace-types'
import {
  describeGroupMemberCandidates,
  folderWorktreeSelector,
  parseGroupWorktreeSelector,
  parseSameGroupWorktreeSelector,
  repoWorktreeSelector,
  resolveUniqueGroupMember,
  type InventoryProjectGroup
} from '../../shared/orchestration/orchestration-group-selector'
import type { ProjectGroup } from '../../shared/project/groups/project-group-types'
import type { Repo } from '../../shared/repository/repo-types'

/** Resolve `group:` / `same-group:` on the connected (target) host. Named misses refuse; same-group misses become scratch. */
export async function resolveGroupWorktreeOnTarget(
  client: RuntimeClient,
  flags: Map<string, string | boolean>
): Promise<void> {
  const worktree = getOptionalStringFlag(flags, 'worktree')
  if (!worktree) {
    return
  }
  const named = parseGroupWorktreeSelector(worktree)
  const same = parseSameGroupWorktreeSelector(worktree)
  if (!named && !same) {
    return
  }
  const groups = await listTargetGroups(client)
  const wanted = named ?? same!
  const resolved = resolveUniqueGroupMember(groups, wanted)
  if (resolved.status === 'unique') {
    flags.set('worktree', resolved.member.selector)
    return
  }
  if (resolved.status === 'ambiguous') {
    throw new RuntimeClientError(
      'selector_ambiguous',
      describeGroupMemberCandidates(wanted, resolved.members)
    )
  }
  if (named) {
    throw new RuntimeClientError(
      'selector_not_found',
      describeGroupMemberCandidates(named, resolved.members)
    )
  }
  const scratch = await client.call<{ worktree: string }>('orchestration.surface.ensureScratch', {})
  flags.set('worktree', scratch.result.worktree)
}

async function listTargetGroups(client: RuntimeClient): Promise<InventoryProjectGroup[]> {
  const [groups, folders, repos] = await Promise.all([
    readCatalog(client, 'projectGroup.list', (result: { groups: ProjectGroup[] }) => result.groups),
    readCatalog(
      client,
      'folderWorkspace.list',
      (result: { folderWorkspaces: FolderWorkspace[] }) => result.folderWorkspaces
    ),
    readCatalog(client, 'repo.list', (result: { repos: Repo[] }) => result.repos)
  ])
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    parentPath: group.parentPath,
    members: [
      ...repos
        .filter((repo) => repo.projectGroupId === group.id)
        .map((repo) => ({
          kind: 'repo' as const,
          id: repo.id,
          name: repo.displayName || repo.id,
          path: repo.path,
          selector: repoWorktreeSelector(repo.id, repo.path),
          projectGroupId: group.id,
          projectGroupName: group.name
        })),
      ...folders
        .filter((folder) => folder.projectGroupId === group.id)
        .map((folder) => ({
          kind: 'folder' as const,
          id: folder.id,
          name: folder.name,
          path: folder.folderPath,
          selector: folderWorktreeSelector(folder.id),
          projectGroupId: group.id,
          projectGroupName: group.name
        }))
    ]
  }))
}

async function readCatalog<T>(
  client: RuntimeClient,
  method: string,
  pick: (result: never) => T[]
): Promise<T[]> {
  try {
    return pick((await client.call(method)).result as never)
  } catch (error) {
    if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
      return []
    }
    throw error
  }
}

/** `--group` on worktree create places the new checkout under that group's workspace. */
export async function applyWorktreeCreateGroupPlacement(
  flags: Map<string, string | boolean>,
  client: RuntimeClient
): Promise<void> {
  applyGroupWorktreeFlag(flags)
  const worktree = getOptionalStringFlag(flags, 'worktree')
  if (
    !worktree ||
    !(parseGroupWorktreeSelector(worktree) || parseSameGroupWorktreeSelector(worktree))
  ) {
    return
  }
  await resolveGroupWorktreeOnTarget(client, flags)
  const groupPlacement = getOptionalStringFlag(flags, 'worktree')
  if (groupPlacement && !flags.has('parent-worktree') && flags.get('no-parent') !== true) {
    flags.set('parent-worktree', groupPlacement)
  }
  flags.delete('worktree')
}
