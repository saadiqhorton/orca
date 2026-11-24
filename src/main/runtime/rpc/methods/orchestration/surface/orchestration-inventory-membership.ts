import {
  folderWorktreeSelector,
  repoWorktreeSelector,
  type InventoryGroupMember,
  type InventoryProjectGroup
} from '../../../../../../shared/orchestration/orchestration-group-selector'

export type InventoryGroupRow = { id: string; name: string; parentPath: string | null }
export type InventoryFolderRow = {
  id: string
  name: string
  folderPath: string
  projectGroupId: string
}
export type InventoryRepoRow = {
  id: string
  path: string
  displayName?: string
  projectGroupId?: string | null
}

export function projectGroupsWithMembers(
  groups: readonly InventoryGroupRow[],
  folders: readonly InventoryFolderRow[],
  repos: readonly InventoryRepoRow[]
): InventoryProjectGroup[] {
  const nameById = new Map(groups.map((group) => [group.id, group.name]))
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    parentPath: group.parentPath,
    members: [
      ...repos
        .filter((repo) => repo.projectGroupId === group.id)
        .map((repo) => repoMember(repo, group.name)),
      ...folders
        .filter((folder) => folder.projectGroupId === group.id)
        .map((folder) => folderMember(folder, nameById.get(folder.projectGroupId) ?? group.name))
    ]
  }))
}

export function folderInventoryRow(
  folder: InventoryFolderRow,
  groupName: string | undefined
): InventoryFolderRow & {
  projectGroupName?: string
  selector: string
} {
  return {
    ...folder,
    selector: folderWorktreeSelector(folder.id),
    ...(groupName ? { projectGroupName: groupName } : {})
  }
}

export function repoInventoryRow(
  repo: InventoryRepoRow,
  groupName: string | undefined
): {
  id: string
  name: string
  path: string
  selector: string
  projectGroupId?: string
  projectGroupName?: string
} {
  return {
    id: repo.id,
    name: repo.displayName || repo.id,
    path: repo.path,
    selector: repoWorktreeSelector(repo.id, repo.path),
    ...(repo.projectGroupId ? { projectGroupId: repo.projectGroupId } : {}),
    ...(groupName ? { projectGroupName: groupName } : {})
  }
}

function repoMember(repo: InventoryRepoRow, groupName: string): InventoryGroupMember {
  return {
    kind: 'repo',
    id: repo.id,
    name: repo.displayName || repo.id,
    path: repo.path,
    selector: repoWorktreeSelector(repo.id, repo.path),
    projectGroupId: repo.projectGroupId ?? '',
    projectGroupName: groupName
  }
}

function folderMember(folder: InventoryFolderRow, groupName: string): InventoryGroupMember {
  return {
    kind: 'folder',
    id: folder.id,
    name: folder.name,
    path: folder.folderPath,
    selector: folderWorktreeSelector(folder.id),
    projectGroupId: folder.projectGroupId,
    projectGroupName: groupName
  }
}
