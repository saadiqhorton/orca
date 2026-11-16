import {
  getRootProjectHeaderKey,
  getRootProjectHeaderOccurrenceKey
} from '../drag/root-project-header-drop'
import type { GroupHeaderRow } from '../../../../../../shared/sidebar-list/row-types'
import type { SectionHeaderRowContext } from './section-header-row-context'

/** Decides whether a project or group header can start a drag (reorder or group membership). */
export function getSectionHeaderDragEligibility({
  headerDrag,
  row,
  usesRootProjectDrag,
  projectIdForHeader,
  repoHeaderBucketKey,
  projectGroupDragIdForHeader,
  projectGroupHeaderBucketKey
}: {
  headerDrag: SectionHeaderRowContext['headerDrag']
  row: GroupHeaderRow
  usesRootProjectDrag: boolean
  projectIdForHeader: string | undefined
  repoHeaderBucketKey: string | undefined
  projectGroupDragIdForHeader: string | undefined
  projectGroupHeaderBucketKey: string | undefined
}): {
  rootProjectHeaderKey: string | undefined
  isDraggableRepoHeader: boolean
  isDraggableProjectGroupHeader: boolean
} {
  const rootProjectHeaderKey = usesRootProjectDrag ? getRootProjectHeaderKey(row) : undefined
  const rootProjectHeaderCount = rootProjectHeaderKey
    ? (headerDrag.rootProjectHeaderCountByOccurrenceKey.get(
        getRootProjectHeaderOccurrenceKey(rootProjectHeaderKey, row.hostId)
      ) ??
      headerDrag.rootProjectHeaderCountByOccurrenceKey.get(
        getRootProjectHeaderOccurrenceKey(rootProjectHeaderKey)
      ))
    : undefined
  const isDraggableRepoHeader = Boolean(
    headerDrag.canReorderRepoHeaders &&
    projectIdForHeader &&
    repoHeaderBucketKey &&
    // Any project can be dragged into or out of a group; otherwise it needs a sibling to pass.
    (headerDrag.allowProjectGroupMembershipDrag ||
      (headerDrag.allowRepoHeaderReorder &&
        (rootProjectHeaderCount !== undefined
          ? rootProjectHeaderCount > 1
          : (headerDrag.sidebarRepoHeaderIdsByBucket.get(repoHeaderBucketKey)?.length ?? 0) > 1)))
  )
  const isDraggableProjectGroupHeader = Boolean(
    headerDrag.canReorderProjectGroupHeaders &&
    projectGroupDragIdForHeader &&
    projectGroupHeaderBucketKey &&
    (rootProjectHeaderCount !== undefined
      ? rootProjectHeaderCount > 1
      : (headerDrag.sidebarProjectGroupHeaderIdsByBucket.get(projectGroupHeaderBucketKey)?.length ??
          0) > 1)
  )
  return { rootProjectHeaderKey, isDraggableRepoHeader, isDraggableProjectGroupHeader }
}
