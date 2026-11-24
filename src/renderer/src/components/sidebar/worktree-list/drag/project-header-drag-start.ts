import {
  getRootProjectHeaderDragKeys,
  measureRootProjectHeaderDragRects
} from './root-project-header-drop'
import type { PointerEvent } from 'react'

import {
  getProjectHeaderDragBucketKey,
  measureProjectHeaderDragRects,
  type ProjectGroupCanonicalIdOf,
  type ProjectHeaderDragBucketKey
} from './project-header-drop'
import {
  isProjectHeaderDragHandleTarget,
  isRepoHeaderActionTarget,
  type ProjectHeaderDragSession
} from './project-header-drag-contract'
import type { Repo } from '../../../../../../shared/repository/repo-types'

export function createProjectHeaderDragSession(args: {
  event: PointerEvent<HTMLElement>
  repo: Repo
  sidebarRepoHeaderIdsByBucket: ReadonlyMap<ProjectHeaderDragBucketKey, readonly string[]>
  rootProjectHeaderKeys?: readonly string[]
  canonicalGroupIdOf?: ProjectGroupCanonicalIdOf
  allowMembershipDrag?: boolean
  allowReorder?: boolean
  getScrollContainer: () => HTMLElement | null
}): ProjectHeaderDragSession | null {
  if (args.event.button !== 0) {
    return null
  }
  if (!isProjectHeaderDragHandleTarget(args.event.target, args.event.currentTarget)) {
    return null
  }
  if (isRepoHeaderActionTarget(args.event.target, args.event.currentTarget)) {
    return null
  }
  const bucketKey = getProjectHeaderDragBucketKey(args.repo, args.canonicalGroupIdOf)
  const reorderEnabled = args.allowReorder ?? true
  const membershipEnabled = args.allowMembershipDrag ?? false
  const rootProjectHeaderHostId = args.rootProjectHeaderKeys?.some((key) => key.startsWith('host:'))
    ? args.event.currentTarget.dataset.rootProjectHeaderHost
    : undefined
  // Why: outside manual order there is no reorder, so never fall through to a root-order save.
  const rootProjectHeaderKeys = reorderEnabled
    ? getRootProjectHeaderDragKeys(
        args.rootProjectHeaderKeys,
        `repo:${args.repo.id}`,
        rootProjectHeaderHostId
      )
    : undefined
  const sidebarRepoHeaderIds =
    rootProjectHeaderKeys ?? args.sidebarRepoHeaderIdsByBucket.get(bucketKey) ?? []
  const canReorder = reorderEnabled && sidebarRepoHeaderIds.length > 1
  // A lone project with no group to join cannot move; preserve the collapse click instead.
  if (!canReorder && !membershipEnabled) {
    return null
  }
  const container = args.getScrollContainer()
  if (!container) {
    return null
  }
  const handleEl = args.event.currentTarget
  // Delay pointer capture until promotion so ordinary clicks can still toggle collapse.
  return {
    repo: args.repo,
    bucketKey,
    sidebarRepoHeaderIds,
    pointerId: args.event.pointerId,
    rootProjectHeaderKeys,
    rootProjectHeaderHostId,
    headerRects: rootProjectHeaderKeys
      ? measureRootProjectHeaderDragRects(
          container,
          rootProjectHeaderKeys,
          rootProjectHeaderHostId
        ).map((rect) => ({
          ...rect,
          repoId: rect.key
        }))
      : measureProjectHeaderDragRects(container, bucketKey),
    handleEl,
    startX: args.event.clientX,
    startY: args.event.clientY,
    latestPointerX: args.event.clientX,
    latestPointerY: args.event.clientY,
    promoted: false,
    membershipEnabled,
    reorderEnabled: canReorder
  }
}

export function refreshProjectHeaderDragSessionRects(
  session: ProjectHeaderDragSession,
  container: HTMLElement
) {
  const rects = session.rootProjectHeaderKeys
    ? measureRootProjectHeaderDragRects(
        container,
        session.rootProjectHeaderKeys,
        session.rootProjectHeaderHostId
      ).map((rect) => ({ ...rect, repoId: rect.key }))
    : measureProjectHeaderDragRects(container, session.bucketKey)
  session.headerRects = rects
  return rects
}

export function projectHeaderDragSessionForRepoHeader(args: {
  event: PointerEvent<HTMLElement>
  repo: Repo
  rootProjectHeaderKeys?: readonly string[]
  sidebarRepoHeaderIdsByBucket: ReadonlyMap<ProjectHeaderDragBucketKey, readonly string[]>
  membership: {
    canonicalGroupIdOf?: ProjectGroupCanonicalIdOf
    allowMembershipDrag?: boolean
    allowReorder?: boolean
  }
  getScrollContainer: () => HTMLElement | null
}): ProjectHeaderDragSession | null {
  return createProjectHeaderDragSession({
    event: args.event,
    repo: args.repo,
    rootProjectHeaderKeys: args.rootProjectHeaderKeys,
    sidebarRepoHeaderIdsByBucket: args.sidebarRepoHeaderIdsByBucket,
    canonicalGroupIdOf: args.membership.canonicalGroupIdOf,
    allowMembershipDrag: args.membership.allowMembershipDrag,
    allowReorder: args.membership.allowReorder,
    getScrollContainer: args.getScrollContainer
  })
}
