import { useEffect } from 'react'

/**
 * Locks the page into "dragging" mode: grabbing cursor, no text selection.
 * Why: the pointer travels a few px over the header label before a drag promotes, which starts a
 * native text selection that otherwise stays highlighted after the drop. Clicks, double-click
 * rename and inputs are untouched because this only runs while a promoted drag is active.
 * Returns the release function that restores the previous styles.
 */
export function lockPageForHeaderDrag(doc: Document = document): () => void {
  const body = doc.body
  const { cursor: prevCursor, userSelect: prevUserSelect } = body.style
  body.style.cursor = 'grabbing'
  body.style.userSelect = 'none'
  doc.getSelection()?.removeAllRanges()
  const blockSelection = (event: Event): void => event.preventDefault()
  doc.addEventListener('selectstart', blockSelection, true)
  return () => {
    doc.removeEventListener('selectstart', blockSelection, true)
    // Drop any selection that slipped in during the drag (e.g. before promotion).
    doc.getSelection()?.removeAllRanges()
    body.style.cursor = prevCursor
    body.style.userSelect = prevUserSelect
  }
}

/** Applies lockPageForHeaderDrag while a header drag is active. */
export function useGrabbingBodyCursor(active: boolean): void {
  useEffect(() => (active ? lockPageForHeaderDrag() : undefined), [active])
}
