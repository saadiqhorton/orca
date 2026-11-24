import { useEffect } from 'react'
import { discardProjectHeaderDragPreview } from './project-header-drag-preview'
import { useGrabbingBodyCursor } from './use-grabbing-body-cursor'

/** Grabbing cursor while armed; leftover clones discarded on unmount. */
export function useHeaderDragPreviewSession(sessionArmed: boolean): void {
  useGrabbingBodyCursor(sessionArmed)
  useEffect(() => () => discardProjectHeaderDragPreview(), [])
}
