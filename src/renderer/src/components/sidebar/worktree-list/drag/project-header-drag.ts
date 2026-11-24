import {
  requestVirtualizedScrollAnchorRecord,
  supersedeVirtualizedScrollAnchorRestore
} from '@/lib/list-interaction/virtualized-scrolling/requestVirtualizedScrollAnchorRecord'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { setProjectGroupDropTargetHighlight } from './project-header-membership'
import {
  computeProjectHeaderSessionDrop,
  useGrabbingBodyCursor
} from './project-header-drag-session-drop'
import { commitProjectHeaderDragDrop } from './project-header-drag-commit'
import {
  INITIAL_REPO_DRAG_STATE,
  PROJECT_HEADER_DRAG_THRESHOLD_PX,
  type ProjectHeaderDragSession,
  type RepoDragState,
  type RepoHeaderDragController,
  type UseRepoHeaderDragArgs
} from './project-header-drag-contract'
import {
  projectHeaderDragSessionForRepoHeader,
  refreshProjectHeaderDragSessionRects
} from './project-header-drag-start'
import { getWorktreeSidebarDragAutoscroll } from './worktree-sidebar-drag-autoscroll'
import { hasPointerBeenReleased } from './header-drag-pointer-release'
import { swallowNextClickOnDragHandle } from './header-drag-click-swallow'
import type { Repo } from '../../../../../../shared/repository/repo-types'

export function useRepoHeaderDrag({
  orderedRepoIds,
  sidebarRepoHeaderIdsByBucket,
  repoById,
  getLiveRepos,
  usesProjectGroupOrdering,
  canonicalGroupIdOf,
  allowMembershipDrag,
  allowReorder,
  onCommitRepoOrder,
  onCommitProjectGroupOrder,
  rootProjectHeaderKeys,
  onCommitRootProjectOrder,
  getScrollContainer
}: UseRepoHeaderDragArgs): RepoHeaderDragController {
  const [state, setState] = useState<RepoDragState>(INITIAL_REPO_DRAG_STATE)
  const [sessionArmed, setSessionArmed] = useState(false)
  const latestDropIndexRef = useRef<number | null>(null)
  latestDropIndexRef.current = state.dropIndex
  const orderedIdsRef = useRef(orderedRepoIds)
  orderedIdsRef.current = orderedRepoIds
  const sidebarRepoHeaderIdsByBucketRef = useRef(sidebarRepoHeaderIdsByBucket)
  sidebarRepoHeaderIdsByBucketRef.current = sidebarRepoHeaderIdsByBucket
  const repoByIdRef = useRef(repoById)
  repoByIdRef.current = repoById
  const usesProjectGroupOrderingRef = useRef(usesProjectGroupOrdering)
  usesProjectGroupOrderingRef.current = usesProjectGroupOrdering
  const membershipOptionsRef = useRef({ canonicalGroupIdOf, allowMembershipDrag, allowReorder })
  const onCommitRepoOrderRef = useRef(onCommitRepoOrder)
  onCommitRepoOrderRef.current = onCommitRepoOrder
  const getLiveReposRef = useRef(getLiveRepos)
  const onCommitProjectGroupOrderRef = useRef(onCommitProjectGroupOrder)
  onCommitProjectGroupOrderRef.current = onCommitProjectGroupOrder
  const rootDragRef = useRef({ rootProjectHeaderKeys, onCommitRootProjectOrder })
  useLayoutEffect(() => {
    membershipOptionsRef.current = { canonicalGroupIdOf, allowMembershipDrag, allowReorder }
    rootDragRef.current = { rootProjectHeaderKeys, onCommitRootProjectOrder }
  }, [
    canonicalGroupIdOf,
    allowMembershipDrag,
    allowReorder,
    rootProjectHeaderKeys,
    onCommitRootProjectOrder
  ])
  const getContainerRef = useRef(getScrollContainer)
  getContainerRef.current = getScrollContainer
  const autoscrollLastFrameTimeRef = useRef<number | null>(null)
  const autoscrollFrameIdRef = useRef<number | null>(null)

  const dragSessionRef = useRef<ProjectHeaderDragSession | null>(null)
  const clickSwallowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshHeaderRects = useCallback(() => {
    const container = getContainerRef.current()
    const session = dragSessionRef.current
    if (!container || !session) {
      return []
    }
    return refreshProjectHeaderDragSessionRects(session, container)
  }, [])

  const computeDrop = useCallback(
    (pointerY: number): { dropIndex: number; dropIndicatorY: number } | null => {
      const session = dragSessionRef.current
      const container = getContainerRef.current()
      if (!session || !container) {
        return null
      }
      return computeProjectHeaderSessionDrop({
        session,
        container,
        pointerY,
        canonicalGroupIdOf: membershipOptionsRef.current.canonicalGroupIdOf
      })
    },
    []
  )

  const applyDrop = useCallback(
    (repoId: string, drop: { dropIndex: number; dropIndicatorY: number } | null) => {
      latestDropIndexRef.current = drop?.dropIndex ?? null
      const nextState: RepoDragState = drop
        ? { draggingRepoId: repoId, ...drop }
        : { draggingRepoId: repoId, dropIndex: null, dropIndicatorY: null }
      setState((prev) =>
        prev.draggingRepoId === nextState.draggingRepoId &&
        prev.dropIndex === nextState.dropIndex &&
        prev.dropIndicatorY === nextState.dropIndicatorY
          ? prev
          : nextState
      )
    },
    []
  )

  const cancelAutoscroll = useCallback(() => {
    if (autoscrollFrameIdRef.current !== null) {
      window.cancelAnimationFrame(autoscrollFrameIdRef.current)
      autoscrollFrameIdRef.current = null
    }
    autoscrollLastFrameTimeRef.current = null
  }, [])

  const endDrag = useCallback(
    (commit: boolean) => {
      cancelAutoscroll()
      const session = dragSessionRef.current
      if (!session) {
        setState(INITIAL_REPO_DRAG_STATE)
        setSessionArmed(false)
        return
      }
      try {
        session.handleEl.releasePointerCapture(session.pointerId)
      } catch {
        // Pointer cancellation or unmount may already have released capture.
      }
      if (session.promoted) {
        clickSwallowTimeoutRef.current = swallowNextClickOnDragHandle(session.handleEl)
      }
      setProjectGroupDropTargetHighlight(getContainerRef.current(), null)
      const sidebarDropIndex =
        commit && session.promoted && latestDropIndexRef.current !== null
          ? latestDropIndexRef.current
          : null
      dragSessionRef.current = null
      setState(INITIAL_REPO_DRAG_STATE)
      setSessionArmed(false)
      if (!commit || !session.promoted) {
        return
      }

      commitProjectHeaderDragDrop({
        session,
        sidebarDropIndex,
        onCommitRootProjectOrder: rootDragRef.current.onCommitRootProjectOrder,
        orderedRepoIds: orderedIdsRef.current,
        repoById: repoByIdRef.current,
        liveRepos: getLiveReposRef.current(),
        usesProjectGroupOrdering: usesProjectGroupOrderingRef.current,
        canonicalGroupIdOf: membershipOptionsRef.current.canonicalGroupIdOf,
        onCommitRepoOrder: onCommitRepoOrderRef.current,
        onCommitProjectGroupOrder: onCommitProjectGroupOrderRef.current
      })
    },
    [cancelAutoscroll]
  )

  const runAutoscrollFrame = useCallback(
    function runFrame(frameTime: number) {
      autoscrollFrameIdRef.current = null
      const session = dragSessionRef.current
      const container = getContainerRef.current()
      if (!session?.promoted || !container) {
        cancelAutoscroll()
        return
      }

      const previousFrameTime = autoscrollLastFrameTimeRef.current ?? frameTime
      autoscrollLastFrameTimeRef.current = frameTime
      const autoscroll = getWorktreeSidebarDragAutoscroll({
        point: { clientX: 0, clientY: session.latestPointerY },
        containerRect: container.getBoundingClientRect(),
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        elapsedMs: frameTime - previousFrameTime
      })
      if (autoscroll) {
        supersedeVirtualizedScrollAnchorRestore(container, autoscroll.scrollTop)
        container.scrollTop = autoscroll.scrollTop
        requestVirtualizedScrollAnchorRecord(container)
        refreshHeaderRects()
      }

      applyDrop(session.repo.id, computeDrop(session.latestPointerY))

      autoscrollFrameIdRef.current = window.requestAnimationFrame(runFrame)
    },
    [applyDrop, cancelAutoscroll, computeDrop, refreshHeaderRects]
  )

  const ensureAutoscroll = useCallback(() => {
    if (autoscrollFrameIdRef.current !== null) {
      return
    }
    autoscrollLastFrameTimeRef.current = null
    autoscrollFrameIdRef.current = window.requestAnimationFrame(runAutoscrollFrame)
  }, [runAutoscrollFrame])

  useEffect(() => {
    if (!sessionArmed) {
      return
    }
    const onPointerMove = (e: PointerEvent): void => {
      const session = dragSessionRef.current
      if (!session || e.pointerId !== session.pointerId) {
        return
      }
      if (hasPointerBeenReleased(e)) {
        endDrag(false)
        return
      }
      session.latestPointerX = e.clientX
      session.latestPointerY = e.clientY
      if (!session.promoted) {
        const dx = e.clientX - session.startX
        const dy = e.clientY - session.startY
        if (
          dx * dx + dy * dy <
          PROJECT_HEADER_DRAG_THRESHOLD_PX * PROJECT_HEADER_DRAG_THRESHOLD_PX
        ) {
          return
        }
        session.promoted = true
        // Virtualization may detach headers; global listeners keep dragging alive without capture.
        if (session.handleEl.isConnected) {
          try {
            session.handleEl.setPointerCapture(session.pointerId)
          } catch {}
        }
        refreshHeaderRects()
        setState({ draggingRepoId: session.repo.id, dropIndex: null, dropIndicatorY: null })
      }
      refreshHeaderRects()
      applyDrop(session.repo.id, computeDrop(e.clientY))
      ensureAutoscroll()
    }
    const onPointerEnd = (e: PointerEvent): void => {
      const session = dragSessionRef.current
      if (session && e.pointerId === session.pointerId) {
        endDrag(e.type === 'pointerup')
      }
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        endDrag(false)
      }
    }
    const onBlur = (): void => endDrag(false)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerEnd)
    window.addEventListener('pointercancel', onPointerEnd)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
      cancelAutoscroll()
      if (clickSwallowTimeoutRef.current !== null) {
        clearTimeout(clickSwallowTimeoutRef.current)
        clickSwallowTimeoutRef.current = null
      }
    }
  }, [
    applyDrop,
    cancelAutoscroll,
    computeDrop,
    endDrag,
    ensureAutoscroll,
    refreshHeaderRects,
    sessionArmed
  ])

  useGrabbingBodyCursor(state.draggingRepoId !== null)

  const onHandlePointerDown = useCallback((event: React.PointerEvent<HTMLElement>, repo: Repo) => {
    const session = projectHeaderDragSessionForRepoHeader({
      event,
      repo,
      rootProjectHeaderKeys: rootDragRef.current.rootProjectHeaderKeys,
      sidebarRepoHeaderIdsByBucket: sidebarRepoHeaderIdsByBucketRef.current,
      membership: membershipOptionsRef.current,
      getScrollContainer: getContainerRef.current
    })
    if (!session) {
      return
    }
    dragSessionRef.current = session
    setSessionArmed(true)
  }, [])
  return { state, onHandlePointerDown }
}
