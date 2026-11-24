import type { HostInventoryRow } from './host-format'

type InventoryFolder = NonNullable<HostInventoryRow['inventory']>['folderWorkspaces'][number] & {
  projectGroupName?: string
}
type InventoryRepo = NonNullable<NonNullable<HostInventoryRow['inventory']>['repos']>[number] & {
  projectGroupId?: string
  projectGroupName?: string
}

export function listedHostInventoryForGroup<T extends { result: { hosts: HostInventoryRow[] } }>(
  listed: T,
  group: string | undefined
): T {
  if (!group) {
    return listed
  }
  return {
    ...listed,
    result: { ...listed.result, hosts: filterHostInventoryByGroup(listed.result.hosts, group) }
  }
}

export function filterHostInventoryByGroup(
  hosts: HostInventoryRow[],
  groupName: string
): HostInventoryRow[] {
  const wanted = groupName.trim().toLowerCase()
  return hosts.map((host) => {
    const inventory = host.inventory
    if (!inventory) {
      return host
    }
    const projects = inventory.projects.filter(
      (group) => group.name.trim().toLowerCase() === wanted
    )
    const ids = new Set(projects.map((group) => group.id))
    return {
      ...host,
      inventory: {
        ...inventory,
        projects,
        folderWorkspaces: inventory.folderWorkspaces.filter(
          (folder: InventoryFolder) =>
            ids.has(folder.projectGroupId) || folder.projectGroupName?.toLowerCase() === wanted
        ),
        repos: (inventory.repos ?? []).filter(
          (repo: InventoryRepo) =>
            (repo.projectGroupId && ids.has(repo.projectGroupId)) ||
            repo.projectGroupName?.toLowerCase() === wanted
        )
      }
    }
  })
}
