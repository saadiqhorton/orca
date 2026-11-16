/** Clone that follows the pointer 1:1. Virtualized rows already use transform for layout. */
export const PROJECT_HEADER_DRAG_PREVIEW_CLASS = 'project-header-drag-preview'
export const PROJECT_HEADER_DRAG_PREVIEW_ATTRIBUTE = 'data-project-header-drag-preview'
export const PROJECT_HEADER_DRAG_SOURCE_ATTRIBUTE = 'data-project-header-drag-source'

export function isProjectHeaderDragPreviewNode(node: EventTarget | null): boolean {
  return (
    node instanceof Element &&
    (node.closest(`.${PROJECT_HEADER_DRAG_PREVIEW_CLASS}`) !== null ||
      node.closest(`[${PROJECT_HEADER_DRAG_PREVIEW_ATTRIBUTE}]`) !== null)
  )
}
