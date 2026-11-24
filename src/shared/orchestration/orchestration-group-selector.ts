import { stripWrappingQuotes } from '../text/typed-name-normalization'
import { composeWorktreeId } from '../worktree/id'
import { ORCHESTRATION_SCRATCH_GROUP_NAME } from './orchestration-scratch-workspace'

export const GROUP_WORKTREE_PREFIX = 'group:'
/** CLI-internal: caller’s group, with scratch fallback when the target has none. */
export const SAME_GROUP_WORKTREE_PREFIX = 'same-group:'

export type InventoryGroupMember = {
  kind: 'repo' | 'folder'
  id: string
  name: string
  path: string
  selector: string
  projectGroupId: string
  projectGroupName: string
}

export type InventoryProjectGroup = {
  id: string
  name: string
  parentPath: string | null
  members: InventoryGroupMember[]
}

export function repoWorktreeSelector(repoId: string, repoPath: string): string {
  return `id:${composeWorktreeId(repoId, repoPath)}`
}

export function folderWorktreeSelector(folderId: string): string {
  return `folder:${folderId}`
}

export function parseGroupWorktreeSelector(selector: string): string | undefined {
  if (!selector.startsWith(GROUP_WORKTREE_PREFIX)) {
    return undefined
  }
  const name = stripWrappingQuotes(selector.slice(GROUP_WORKTREE_PREFIX.length).trim()).trim()
  return name.length > 0 ? name : undefined
}

export function formatGroupWorktreeSelector(name: string): string {
  return `${GROUP_WORKTREE_PREFIX}${name}`
}

export function parseSameGroupWorktreeSelector(selector: string): string | undefined {
  if (!selector.startsWith(SAME_GROUP_WORKTREE_PREFIX)) {
    return undefined
  }
  const name = stripWrappingQuotes(selector.slice(SAME_GROUP_WORKTREE_PREFIX.length).trim()).trim()
  return name.length > 0 ? name : undefined
}

export function formatSameGroupWorktreeSelector(name: string): string {
  return `${SAME_GROUP_WORKTREE_PREFIX}${name}`
}

export function isOrchestrationScratchGroupName(name: string): boolean {
  return name === ORCHESTRATION_SCRATCH_GROUP_NAME
}

export function membersOfNamedGroup(
  groups: readonly InventoryProjectGroup[],
  name: string
): InventoryGroupMember[] {
  const wanted = name.trim().toLowerCase()
  return groups
    .filter((group) => group.name.trim().toLowerCase() === wanted)
    .flatMap((group) => group.members)
}

export function resolveUniqueGroupMember(
  groups: readonly InventoryProjectGroup[],
  name: string
):
  | { status: 'unique'; member: InventoryGroupMember; members: [InventoryGroupMember] }
  | { status: 'missing'; members: [] }
  | { status: 'ambiguous'; members: InventoryGroupMember[] } {
  const members = membersOfNamedGroup(groups, name)
  if (members.length === 1) {
    return { status: 'unique', member: members[0]!, members: [members[0]!] }
  }
  if (members.length === 0) {
    return { status: 'missing', members: [] }
  }
  return { status: 'ambiguous', members }
}

export function describeGroupMemberCandidates(
  name: string,
  members: readonly InventoryGroupMember[]
): string {
  if (members.length === 0) {
    return `No workspace in project group "${name}" on this host.`
  }
  const listed = members
    .map((member) => `${member.kind} ${member.name} (${member.selector})`)
    .join(', ')
  return (
    `Project group "${name}" has ${members.length} workspaces on this host; pass one selector as --worktree. ` +
    `Candidates: ${listed}.`
  )
}
