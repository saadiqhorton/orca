import type { ProjectGroup } from '../../../../shared/project/groups/project-group-types'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import { getRepoExecutionHostId } from '../../../../shared/execution-host/execution-host'
import { normalizeTypedName } from '../../../../shared/text/typed-name-normalization'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { buildProjectGroupClusters } from '../../../../shared/project-group-clusters'
import {
  getRuntimeTargetHostId,
  ipcOrRuntimeTargetForHostId
} from '../../runtime/rpc/targets/runtime-client-target'

/**
 * Why: a project can only join a group saved in its own machine's catalog. To put a project
 * into a group that lives on another machine, we join (or create) a same-named twin on the
 * project's machine; the sidebar draws twins as one group (shared/project-group-clusters).
 */

// Deep enough for any real tree; stops corrupt parent cycles from looping forever.
const MAX_GROUP_DEPTH = 64

export type TwinGroupRecord = Pick<
  ProjectGroup,
  'id' | 'name' | 'parentGroupId' | 'connectionId' | 'executionHostId' | 'createdAt' | 'tabOrder'
>

export function isGroupInCatalog(group: TwinGroupRecord, catalogHostId: ExecutionHostId): boolean {
  const groupCatalog = ipcOrRuntimeTargetForHostId(getRepoExecutionHostId(group))
  return groupCatalog !== null && getRuntimeTargetHostId(groupCatalog) === catalogHostId
}

/** The group and its ancestors, root first. Empty when the id is unknown. */
export function getProjectGroupChain<T extends TwinGroupRecord>(
  projectGroups: readonly T[],
  groupId: string
): T[] {
  const byId = new Map<string, T>()
  for (const group of projectGroups) {
    if (!byId.has(group.id)) {
      byId.set(group.id, group)
    }
  }
  const chain: T[] = []
  const seen = new Set<string>()
  let current = byId.get(groupId)
  while (current && !seen.has(current.id) && chain.length < MAX_GROUP_DEPTH) {
    seen.add(current.id)
    chain.unshift(current)
    current = current.parentGroupId ? byId.get(current.parentGroupId) : undefined
  }
  return chain
}

/** A same-named group under the same (twin) parent in one catalog; oldest wins on duplicates. */
export function findTwinInCatalog<T extends TwinGroupRecord>(
  projectGroups: readonly T[],
  args: { name: string; parentGroupId: string | null; catalogHostId: ExecutionHostId }
): T | undefined {
  const nameKey = normalizeTypedName(args.name)
  if (!nameKey) {
    return undefined
  }
  let best: T | undefined
  for (const group of projectGroups) {
    if (
      normalizeTypedName(group.name) !== nameKey ||
      (group.parentGroupId ?? null) !== args.parentGroupId ||
      !isGroupInCatalog(group, args.catalogHostId)
    ) {
      continue
    }
    if (
      !best ||
      (group.createdAt ?? 0) < (best.createdAt ?? 0) ||
      ((group.createdAt ?? 0) === (best.createdAt ?? 0) && group.id < best.id)
    ) {
      best = group
    }
  }
  return best
}

export type EnsureTwinResult =
  | { status: 'same-catalog'; groupId: string }
  | { status: 'twin'; groupId: string; created: boolean }
  | { status: 'unknown-group' }
  | { status: 'failed' }

/**
 * Resolve the group id a project on `catalog` should store to join `groupId`.
 * Creates any missing twins (parents first) on the project's machine.
 */
export async function ensureProjectGroupTwinInCatalog(args: {
  getProjectGroups: () => readonly TwinGroupRecord[]
  groupId: string
  catalog: RuntimeClientTarget
  hostId: ExecutionHostId
  createGroup: (
    name: string,
    hostId: ExecutionHostId,
    parentGroupId: string | null
  ) => Promise<TwinGroupRecord | null>
}): Promise<EnsureTwinResult> {
  const catalogHostId = getRuntimeTargetHostId(args.catalog)
  const groups = args.getProjectGroups()
  const copies = groups.filter((group) => group.id === args.groupId)
  if (copies.length === 0) {
    return { status: 'unknown-group' }
  }
  if (copies.some((group) => isGroupInCatalog(group, catalogHostId))) {
    return { status: 'same-catalog', groupId: args.groupId }
  }
  const chain = getProjectGroupChain(groups, args.groupId)
  if (chain.length === 0) {
    return { status: 'unknown-group' }
  }
  let parentTwinId: string | null = null
  let created = false
  for (const level of chain) {
    // Re-read each level: a create above refreshed the catalog.
    const current = args.getProjectGroups()
    // Prefer the twin the sidebar already draws under this header, then any same-named sibling.
    const { canonicalById, memberIdsByCanonicalId } = buildProjectGroupClusters(current)
    const canonical = canonicalById.get(level.id)
    const drawnTwinId = canonical
      ? memberIdsByCanonicalId
          .get(canonical.id)
          ?.find((memberId) =>
            current.some(
              (group) =>
                group.id === memberId &&
                (group.parentGroupId ?? null) === parentTwinId &&
                isGroupInCatalog(group, catalogHostId)
            )
          )
      : undefined
    const existing = drawnTwinId
      ? { id: drawnTwinId }
      : findTwinInCatalog(current, {
          name: level.name,
          parentGroupId: parentTwinId,
          catalogHostId
        })
    if (existing) {
      parentTwinId = existing.id
      continue
    }
    const twin = await args.createGroup(level.name, args.hostId, parentTwinId)
    if (!twin) {
      return { status: 'failed' }
    }
    created = true
    parentTwinId = twin.id
  }
  return parentTwinId ? { status: 'twin', groupId: parentTwinId, created } : { status: 'failed' }
}

/** Every group drawn under the same merged header as `groupId` (itself first), with its owner. */
export function getProjectGroupTwins<T extends TwinGroupRecord>(
  projectGroups: readonly T[],
  groupId: string
): { id: string; hostId: ExecutionHostId }[] {
  const { canonicalById, memberIdsByCanonicalId } = buildProjectGroupClusters(projectGroups)
  const canonical = canonicalById.get(groupId)
  const memberIds = canonical ? (memberIdsByCanonicalId.get(canonical.id) ?? [groupId]) : [groupId]
  const ordered = [groupId, ...memberIds.filter((memberId) => memberId !== groupId)]
  return ordered.flatMap((memberId) => {
    const group = projectGroups.find((entry) => entry.id === memberId)
    return group ? [{ id: memberId, hostId: getRepoExecutionHostId(group) }] : []
  })
}
