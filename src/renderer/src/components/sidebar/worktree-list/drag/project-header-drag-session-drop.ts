import { useEffect } from 'react'
import { computeProjectHeaderDropPreview } from './project-header-drop'
import type { ProjectGroupCanonicalIdOf } from './project-header-drop'
import type { ProjectHeaderDragSession } from './project-header-drag-contract'
import { trackProjectHeaderMembershipTarget } from './project-header-membership'

export function computeProjectHeaderSessionDrop(args: {
  session: ProjectHeaderDragSession
  container: HTMLElement
  pointerY: number
  canonicalGroupIdOf: ProjectGroupCanonicalIdOf
}): { dropIndex: number; dropIndicatorY: number } | null {
  // A group change wins over reordering, so hide the insertion line while one is armed.
  const armed = trackProjectHeaderMembershipTarget(
    args.session,
    args.container,
    args.canonicalGroupIdOf
  )
  if (armed || !args.session.reorderEnabled) {
    return null
  }
  return computeProjectHeaderDropPreview({
    pointerY: args.pointerY,
    containerTop: args.container.getBoundingClientRect().top,
    scrollTop: args.container.scrollTop,
    rects: args.session.headerRects,
    sidebarRepoHeaderIds: args.session.sidebarRepoHeaderIds,
    contentBottom: args.container.scrollHeight
  })
}

export function useGrabbingBodyCursor(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return
    }
    const body = document.body
    const { cursor: prevCursor, userSelect: prevUserSelect } = body.style
    body.style.cursor = 'grabbing'
    body.style.userSelect = 'none'
    return () => {
      body.style.cursor = prevCursor
      body.style.userSelect = prevUserSelect
    }
  }, [active])
}
