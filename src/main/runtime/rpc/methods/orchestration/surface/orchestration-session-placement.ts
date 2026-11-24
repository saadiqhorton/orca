import { homedir } from 'node:os'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import {
  describeGroupMemberCandidates,
  parseGroupWorktreeSelector,
  parseSameGroupWorktreeSelector,
  resolveUniqueGroupMember,
  type InventoryProjectGroup
} from '../../../../../../shared/orchestration/orchestration-group-selector'
import {
  projectGroupsWithMembers,
  type InventoryGroupRow,
  type InventoryRepoRow
} from './orchestration-inventory-membership'
import {
  ensureOrchestrationScratchWorkspace,
  type OrchestrationScratchRuntime
} from './ensure-orchestration-scratch'

export type OrchestrationSessionPlacementRuntime = OrchestrationScratchRuntime & {
  listVisibleRepos?: () => InventoryRepoRow[]
}

export type OrchestrationSessionPlacementHint = {
  namedGroup?: string
  callerGroup?: string
  worktree?: string
}

export type OrchestrationSessionPlacement = {
  worktree: string
  source: 'named' | 'same-group' | 'scratch'
  group?: { id: string; name: string }
}

/**
 * (a) named group/workspace, (b) same-named visible group as the caller, (c) scratch.
 * Tabs stay in a desktop-visible group (R09).
 */
export async function resolveOrchestrationSessionPlacement(
  runtime: OrchestrationSessionPlacementRuntime,
  home = homedir(),
  hint: OrchestrationSessionPlacementHint = {}
): Promise<OrchestrationSessionPlacement> {
  const named =
    hint.namedGroup ?? (hint.worktree ? parseGroupWorktreeSelector(hint.worktree) : undefined)
  const callerGroup =
    hint.callerGroup ?? (hint.worktree ? parseSameGroupWorktreeSelector(hint.worktree) : undefined)
  const groups = listPlacementGroups(runtime)
  if (named) {
    return placeNamedGroup(groups, named, 'named')
  }
  if (callerGroup) {
    const same = tryPlaceNamedGroup(groups, callerGroup, 'same-group')
    if (same) {
      return same
    }
  }
  const scratch = await ensureOrchestrationScratchWorkspace(runtime, {}, home)
  return {
    worktree: scratch.worktree,
    source: 'scratch',
    group: { id: scratch.projectGroupId, name: scratch.groupName }
  }
}

export async function resolveTerminalCreateWorktree(
  runtime: OrchestrationSessionPlacementRuntime,
  params: { worktree?: string; placement?: 'orchestration-session' }
): Promise<string | undefined> {
  if (
    params.worktree &&
    (parseGroupWorktreeSelector(params.worktree) || parseSameGroupWorktreeSelector(params.worktree))
  ) {
    return (
      await resolveOrchestrationSessionPlacement(runtime, undefined, {
        worktree: params.worktree
      })
    ).worktree
  }
  if (params.worktree) {
    return params.worktree
  }
  if (params.placement === 'orchestration-session') {
    return (await resolveOrchestrationSessionPlacement(runtime)).worktree
  }
  return undefined
}

function listPlacementGroups(
  runtime: OrchestrationSessionPlacementRuntime
): InventoryProjectGroup[] {
  const groups: InventoryGroupRow[] = runtime.listVisibleProjectGroups().map((group) => ({
    ...group,
    parentPath: null
  }))
  return projectGroupsWithMembers(
    groups,
    runtime.listVisibleFolderWorkspaces(),
    runtime.listVisibleRepos?.() ?? []
  )
}

function placeNamedGroup(
  groups: readonly InventoryProjectGroup[],
  name: string,
  source: 'named' | 'same-group'
): OrchestrationSessionPlacement {
  const placed = tryPlaceNamedGroup(groups, name, source)
  if (placed) {
    return placed
  }
  const resolved = resolveUniqueGroupMember(groups, name)
  throw new OrchestrationError(
    resolved.status === 'ambiguous' ? 'selector_ambiguous' : 'selector_not_found',
    describeGroupMemberCandidates(name, resolved.members)
  )
}

function tryPlaceNamedGroup(
  groups: readonly InventoryProjectGroup[],
  name: string,
  source: 'named' | 'same-group'
): OrchestrationSessionPlacement | undefined {
  const resolved = resolveUniqueGroupMember(groups, name)
  if (resolved.status !== 'unique') {
    if (source === 'same-group' && resolved.status === 'missing') {
      return undefined
    }
    if (source === 'same-group' && resolved.status === 'ambiguous') {
      throw new OrchestrationError(
        'selector_ambiguous',
        describeGroupMemberCandidates(name, resolved.members)
      )
    }
    return undefined
  }
  const member = resolved.member
  return {
    worktree: member.selector,
    source,
    group: { id: member.projectGroupId, name: member.projectGroupName }
  }
}
