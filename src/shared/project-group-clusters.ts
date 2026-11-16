import type { ProjectGroup } from './project-group-types'
import { getDistinctProjectGroups } from './project-groups'
import { normalizeTypedName } from './typed-name-normalization'
import { compareCodePoints } from './sidebar-list/sorting/text-order'
import { getRepoExecutionHostId } from './execution-host'

/**
 * Cross-host project groups.
 *
 * Why: each machine keeps its own group catalog and a project can only point at a group in its
 * own machine's catalog. To let one sidebar group hold projects from several machines, every
 * machine keeps a same-named "twin" group, and the sidebar draws all twins as one group.
 * Twins are matched by their name path (root group name → … → group name), so nested twins on
 * different machines line up even though their parent ids differ.
 */

type ClusterGroup = Pick<
  ProjectGroup,
  'id' | 'name' | 'parentGroupId' | 'createdAt' | 'tabOrder' | 'executionHostId'
> &
  Partial<Pick<ProjectGroup, 'connectionId'>>

const CLUSTER_PATH_SEPARATOR = '\u0000'
// Deep enough for any real tree; stops corrupt parent cycles from looping forever.
const MAX_GROUP_DEPTH = 64

export function getProjectGroupNamePath<T extends ClusterGroup>(
  group: T,
  groupsById: ReadonlyMap<string, T>
): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  let current: T | undefined = group
  while (current && !seen.has(current.id) && names.length < MAX_GROUP_DEPTH) {
    seen.add(current.id)
    names.unshift(normalizeTypedName(current.name))
    current = current.parentGroupId ? groupsById.get(current.parentGroupId) : undefined
  }
  return names
}

export function getProjectGroupClusterKey<T extends ClusterGroup>(
  group: T,
  groupsById: ReadonlyMap<string, T>
): string {
  return getProjectGroupNamePath(group, groupsById).join(CLUSTER_PATH_SEPARATOR)
}

/** The twin whose header, order and color represent the merged group: the oldest one. */
export function compareProjectGroupCanonicalPreference(
  left: ClusterGroup,
  right: ClusterGroup
): number {
  return (
    (left.createdAt ?? 0) - (right.createdAt ?? 0) ||
    left.tabOrder - right.tabOrder ||
    compareCodePoints(left.executionHostId ?? '', right.executionHostId ?? '') ||
    compareCodePoints(left.id, right.id)
  )
}

export type ProjectGroupClusters<T extends ClusterGroup> = {
  /** One representative (the oldest twin) per merged group. */
  canonicalGroups: T[]
  /** Any twin id (and the canonical id itself) → its canonical group. */
  canonicalById: Map<string, T>
  /** Canonical id → every twin id it stands for (canonical first). */
  memberIdsByCanonicalId: Map<string, string[]>
}

export function buildProjectGroupClusters<T extends ClusterGroup>(
  projectGroups: readonly T[]
): ProjectGroupClusters<T> {
  const distinct = getDistinctProjectGroups(projectGroups)
  const groupsById = new Map(distinct.map((group) => [group.id, group]))
  // Oldest first, so each machine's oldest same-named group joins the first merged group.
  const ordered = [...distinct].sort(compareProjectGroupCanonicalPreference)
  // Why per-machine slots: two same-named groups on ONE machine are distinct groups the user made;
  // only one group per machine may join a merged group.
  const slotsByKey = new Map<string, { hosts: Set<string>; members: T[] }[]>()
  for (const group of ordered) {
    const key = getProjectGroupClusterKey(group, groupsById)
    const hostKey = getRepoExecutionHostId(group)
    const slots = slotsByKey.get(key) ?? []
    let slot = slots.find((candidate) => !candidate.hosts.has(hostKey))
    if (!slot) {
      slot = { hosts: new Set(), members: [] }
      slots.push(slot)
    }
    slot.hosts.add(hostKey)
    slot.members.push(group)
    slotsByKey.set(key, slots)
  }
  const membersByKey = new Map<string, T[]>()
  for (const [key, slots] of slotsByKey) {
    slots.forEach((slot, index) =>
      membersByKey.set(`${key}${CLUSTER_PATH_SEPARATOR}#${index}`, slot.members)
    )
  }
  const canonicalGroups: T[] = []
  const canonicalById = new Map<string, T>()
  const memberIdsByCanonicalId = new Map<string, string[]>()
  for (const members of membersByKey.values()) {
    const canonical = members[0]!
    canonicalGroups.push(canonical)
    memberIdsByCanonicalId.set(
      canonical.id,
      members.map((group) => group.id)
    )
    for (const member of members) {
      canonicalById.set(member.id, canonical)
    }
  }
  return { canonicalGroups, canonicalById, memberIdsByCanonicalId }
}

/** True when both ids name the same merged sidebar group (or are the same id). */
export function areProjectGroupTwins<T extends ClusterGroup>(
  clusters: ProjectGroupClusters<T>,
  leftId: string | null | undefined,
  rightId: string | null | undefined
): boolean {
  if (!leftId || !rightId) {
    return (leftId ?? null) === (rightId ?? null)
  }
  if (leftId === rightId) {
    return true
  }
  const left = clusters.canonicalById.get(leftId)
  const right = clusters.canonicalById.get(rightId)
  return left !== undefined && left === right
}
