import { measureSidebarHeaderDragRect } from './sidebar-header-drag-geometry'
import type { ProjectGroupCanonicalIdOf } from './project-header-drop'
import type { ProjectHeaderDragSession } from './project-header-drag-contract'
import { isProjectHeaderDragPreviewNode } from './project-header-drag-preview-dom'
import type { Repo } from '../../../../../../shared/repo-types'
import type { RenderRow } from '../listing/render-row'
import { isSameRepoRow } from '@/store/repos/repo-host-identity'

// Drag a project header onto a group to join it (works across machines via twin groups),
// or out of every group to leave it. Works in every project sort mode.

export const PROJECT_GROUP_MEMBERSHIP_ID_ATTRIBUTE = 'data-project-group-membership-id'
// Render-row index of the first row after the group's section (rows.length when it runs to the end).
export const PROJECT_GROUP_MEMBERSHIP_SECTION_END_INDEX_ATTRIBUTE =
  'data-project-group-membership-section-end-index'
export const PROJECT_GROUP_DROP_TARGET_ATTRIBUTE = 'data-project-group-drop-target'

/**
 * Where a dragged project header would land, membership-wise.
 * - `{ kind: 'group' }`: the pointer is over a group's header or its section (innermost wins).
 * - `{ kind: 'root' }`: inside the sidebar but outside every group (drag out of a group).
 * - `null`: the pointer left the sidebar; no membership intent.
 */
export type ProjectHeaderMembershipTarget = { kind: 'group'; groupId: string } | { kind: 'root' }

export function resolveProjectHeaderMembershipTarget(args: {
  pointerX: number
  pointerY: number
  container: HTMLElement
  /** Top strip of each group header left for "insert before" when reordering is possible. */
  headerTopEdgePx?: number
}): ProjectHeaderMembershipTarget | null {
  const containerRect = args.container.getBoundingClientRect()
  if (
    args.pointerX < containerRect.left ||
    args.pointerX > containerRect.right ||
    args.pointerY < containerRect.top ||
    args.pointerY > containerRect.bottom
  ) {
    return null
  }
  const y = args.pointerY - containerRect.top + args.container.scrollTop
  let best: { groupId: string; span: number; top: number } | null = null
  for (const element of args.container.querySelectorAll<HTMLElement>(
    `[${PROJECT_GROUP_MEMBERSHIP_ID_ATTRIBUTE}]`
  )) {
    const groupId = element.getAttribute(PROJECT_GROUP_MEMBERSHIP_ID_ATTRIBUTE)
    if (!groupId || isProjectHeaderDragPreviewNode(element)) {
      continue
    }
    const headerRect = element.getBoundingClientRect()
    const headerEdge = Math.min(
      args.headerTopEdgePx ?? 0,
      Math.max(0, (headerRect.bottom - headerRect.top) / 4)
    )
    // Viewport hit: a pinned parent header stays a target while content-Y is inside a child.
    const overHeader =
      args.pointerX >= headerRect.left &&
      args.pointerX <= headerRect.right &&
      args.pointerY >= headerRect.top + headerEdge &&
      args.pointerY <= headerRect.bottom
    const measured = measureSidebarHeaderDragRect(
      element,
      args.container,
      containerRect,
      PROJECT_GROUP_MEMBERSHIP_SECTION_END_INDEX_ATTRIBUTE
    )
    const bottom = Math.max(measured.bottom, measureSectionBottom(element, args.container))
    const edge = Math.min(args.headerTopEdgePx ?? 0, (measured.bottom - measured.top) / 4)
    const inSection = y >= measured.top + edge && y <= bottom
    if (!overHeader && !inSection) {
      continue
    }
    const span = overHeader ? headerRect.height : bottom - measured.top
    // Innermost (smallest) section wins so nested groups are reachable; ties go to the lower header.
    if (!best || span < best.span || (span === best.span && measured.top > best.top)) {
      best = { groupId, span, top: measured.top }
    }
  }
  return best ? { kind: 'group', groupId: best.groupId } : { kind: 'root' }
}

/** Marks the hovered group header(s) directly in the DOM: no React render per pointer move. */
export function setProjectGroupDropTargetHighlight(
  container: HTMLElement | null,
  groupId: string | null
): void {
  if (!container) {
    return
  }
  for (const element of container.querySelectorAll<HTMLElement>(
    `[${PROJECT_GROUP_DROP_TARGET_ATTRIBUTE}]`
  )) {
    if (
      isProjectHeaderDragPreviewNode(element) ||
      element.getAttribute(PROJECT_GROUP_MEMBERSHIP_ID_ATTRIBUTE) !== groupId
    ) {
      element.removeAttribute(PROJECT_GROUP_DROP_TARGET_ATTRIBUTE)
    }
  }
  if (!groupId) {
    return
  }
  for (const element of container.querySelectorAll<HTMLElement>(
    `[${PROJECT_GROUP_MEMBERSHIP_ID_ATTRIBUTE}]`
  )) {
    if (
      !isProjectHeaderDragPreviewNode(element) &&
      element.getAttribute(PROJECT_GROUP_MEMBERSHIP_ID_ATTRIBUTE) === groupId
    ) {
      element.setAttribute(PROJECT_GROUP_DROP_TARGET_ATTRIBUTE, '')
    }
  }
}

/**
 * Where a group's section ends, in the same virtual-row coordinates as the header top.
 * Why: the estimated row-model ends drift from real row heights (workspace rows are taller than
 * estimated), which made a root project right below a group count as inside it.
 * An end row that is not rendered lies past the viewport, so the section runs off-screen.
 */
function measureSectionBottom(element: HTMLElement, container: HTMLElement): number {
  const endIndex = element.getAttribute(PROJECT_GROUP_MEMBERSHIP_SECTION_END_INDEX_ATTRIBUTE)
  if (endIndex === null) {
    return Number.NEGATIVE_INFINITY
  }
  const endRow = container.querySelector<HTMLElement>(
    `[data-worktree-virtual-row][data-index="${endIndex}"]`
  )
  const start = endRow?.getAttribute('data-worktree-virtual-row-start')
  if (!endRow || start == null || !Number.isFinite(Number(start))) {
    return Number.POSITIVE_INFINITY
  }
  return Number(start)
}

/** First render-row index after each group's section (header rows at the group's depth or above end it). */
export function getProjectGroupSectionEndIndexByGroupId(
  rows: readonly RenderRow[]
): Map<string, number> {
  const endIndexByGroupId = new Map<string, number>()
  const pending: { groupId: string; depth: number }[] = []
  for (const [index, row] of rows.entries()) {
    if (row.type !== 'header' && row.type !== 'host-header') {
      continue
    }
    const depth =
      row.type === 'host-header' || (!row.repo && !row.projectGroup)
        ? Number.NEGATIVE_INFINITY
        : (row.projectGroupDepth ?? 0)
    for (let last = pending.at(-1); last && last.depth >= depth; last = pending.at(-1)) {
      pending.pop()
      endIndexByGroupId.set(last.groupId, index)
    }
    if (row.type === 'header' && !row.repo && !row.repeated && row.projectGroup?.id) {
      endIndexByGroupId.set(row.projectGroup.id, rows.length)
      pending.push({ groupId: row.projectGroup.id, depth: row.projectGroupDepth ?? 0 })
    }
  }
  return endIndexByGroupId
}

/** Hook class so CSS can paint an instant drop-target wash (no transition: it is linked to the pointer). */
export const PROJECT_GROUP_DROP_TARGET_CLASS_NAME = 'project-group-membership-drop-host'

/** DOM attributes a group header exposes so a dragged project header can find it. */
export function getProjectGroupMembershipDropAttributes(
  groupId: string | undefined,
  sectionEndIndex: number | undefined
): Record<string, string | number | undefined> {
  return {
    [PROJECT_GROUP_MEMBERSHIP_ID_ATTRIBUTE]: groupId,
    [PROJECT_GROUP_MEMBERSHIP_SECTION_END_INDEX_ATTRIBUTE]: groupId ? sectionEndIndex : undefined
  }
}

/**
 * Records the hovered membership target on the session and highlights it.
 * Returns true when dropping now would change the project's group.
 */
export function trackProjectHeaderMembershipTarget(
  session: ProjectHeaderDragSession,
  container: HTMLElement,
  canonicalGroupIdOf: ProjectGroupCanonicalIdOf
): boolean {
  if (!session.membershipEnabled) {
    return false
  }
  const target = resolveProjectHeaderMembershipTarget({
    pointerX: session.latestPointerX,
    pointerY: session.latestPointerY,
    container,
    headerTopEdgePx: session.reorderEnabled ? 6 : 0
  })
  session.membershipTarget = target
  const currentGroupId = session.repo.projectGroupId ?? null
  const changesGroup =
    target?.kind === 'group'
      ? currentGroupId === null ||
        canonicalGroupIdOf(currentGroupId) !== canonicalGroupIdOf(target.groupId)
      : target?.kind === 'root' && currentGroupId !== null
  setProjectGroupDropTargetHighlight(
    container,
    changesGroup && target?.kind === 'group' ? target.groupId : null
  )
  return changesGroup
}

/**
 * Membership first: a drop over another group joins it, and a drop outside every group leaves
 * the current one. Only when membership is unchanged does the drop fall back to reordering.
 * Returns true when it handled the drop as a membership change.
 */
export function commitProjectHeaderMembershipDrop(args: {
  session: ProjectHeaderDragSession
  liveRepos: readonly Repo[]
  canonicalGroupIdOf: ProjectGroupCanonicalIdOf
  onCommitProjectGroupOrder: (project: Repo, projectGroupId: string | null, order?: number) => void
}): boolean {
  const target = args.session.membershipTarget
  if (!args.session.membershipEnabled || !target) {
    return false
  }
  const draggedRepo = args.liveRepos.find((repo) => isSameRepoRow(repo, args.session.repo))
  if (!draggedRepo) {
    return false
  }
  const currentGroupId = draggedRepo.projectGroupId ?? null
  const currentCanonical = currentGroupId ? args.canonicalGroupIdOf(currentGroupId) : null
  if (target.kind === 'group') {
    if (currentCanonical === args.canonicalGroupIdOf(target.groupId)) {
      return false
    }
    args.onCommitProjectGroupOrder(draggedRepo, target.groupId)
    return true
  }
  if (currentGroupId === null) {
    return false
  }
  args.onCommitProjectGroupOrder(draggedRepo, null)
  return true
}
