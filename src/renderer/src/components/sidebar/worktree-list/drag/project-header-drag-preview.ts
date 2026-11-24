import { REPO_HEADER_ACTION_SELECTOR } from './project-header-drag-contract'
import {
  PROJECT_GROUP_DROP_TARGET_ATTRIBUTE,
  PROJECT_GROUP_MEMBERSHIP_ID_ATTRIBUTE,
  PROJECT_GROUP_MEMBERSHIP_SECTION_END_INDEX_ATTRIBUTE
} from './project-header-membership'
import {
  PROJECT_HEADER_DRAG_PREVIEW_ATTRIBUTE,
  PROJECT_HEADER_DRAG_PREVIEW_CLASS,
  PROJECT_HEADER_DRAG_SOURCE_ATTRIBUTE
} from './project-header-drag-preview-dom'

export {
  isProjectHeaderDragPreviewNode,
  PROJECT_HEADER_DRAG_PREVIEW_ATTRIBUTE,
  PROJECT_HEADER_DRAG_PREVIEW_CLASS,
  PROJECT_HEADER_DRAG_SOURCE_ATTRIBUTE
} from './project-header-drag-preview-dom'

/**
 * Identity attrs SectionHeader.tsx copies onto the header. cloneNode keeps them;
 * membership queries `[data-project-group-membership-id]`, group reorder queries
 * `[data-project-group-header-id]`, project reorder `[data-repo-header-id]`,
 * root order `[data-root-project-header-key]`. A header-only clone would win
 * innermost (smallest span) if those attrs survived.
 */
const PREVIEW_STRIP_ATTRIBUTES = [
  PROJECT_GROUP_MEMBERSHIP_ID_ATTRIBUTE,
  PROJECT_GROUP_MEMBERSHIP_SECTION_END_INDEX_ATTRIBUTE,
  PROJECT_GROUP_DROP_TARGET_ATTRIBUTE,
  'data-project-group-header-id',
  'data-project-group-header-index',
  'data-project-group-header-bucket',
  'data-project-group-header-section-end',
  'data-project-group-header-drag-handle',
  'data-repo-header-id',
  'data-repo-header-index',
  'data-repo-header-bucket',
  'data-repo-header-section-end',
  'data-repo-header-drag-handle',
  'data-root-project-header-key',
  'data-root-project-header-host',
  'data-root-project-header-section-end',
  PROJECT_HEADER_DRAG_SOURCE_ATTRIBUTE
] as const

/** Motion's typical `dragElastic` — past a bound, the preview moves a fraction of the pointer. */
export const PROJECT_HEADER_DRAG_RUBBER_BAND = 0.2
/** Small floating clone, not an edge-attached sheet: Vaul's 200ms family. */
export const PROJECT_HEADER_DRAG_RELEASE_MS = 200
export const PROJECT_HEADER_DRAG_RELEASE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)'

export type ProjectHeaderDragPreviewBounds = {
  left: number
  right: number
  top: number
  bottom: number
}

export type ProjectHeaderDragPreviewLayout = {
  grabOffsetX: number
  grabOffsetY: number
  originX: number
  originY: number
  width: number
  height: number
  sidebar: ProjectHeaderDragPreviewBounds | null
}

type MountedPreview = ProjectHeaderDragPreviewLayout & {
  el: HTMLElement
  source: HTMLElement
}

let mounted: MountedPreview | null = null
let releaseTimer: ReturnType<typeof setTimeout> | null = null

export function rubberBandAxis(
  value: number,
  min: number,
  max: number,
  elastic = PROJECT_HEADER_DRAG_RUBBER_BAND
): number {
  if (max < min) {
    return value
  }
  if (value < min) {
    return min + (value - min) * elastic
  }
  if (value > max) {
    return max + (value - max) * elastic
  }
  return value
}

/** Track-phase position: 1:1 on Y, rubber-banded on X so the clone cannot fly into the editor. */
export function projectHeaderDragPreviewTranslate(
  pointerX: number,
  pointerY: number,
  layout: ProjectHeaderDragPreviewLayout
): { x: number; y: number } {
  const x = pointerX - layout.grabOffsetX
  const y = pointerY - layout.grabOffsetY
  if (!layout.sidebar) {
    return { x, y }
  }
  const slack = 8
  return {
    x: rubberBandAxis(x, layout.sidebar.left - slack, layout.sidebar.right - layout.width + slack),
    y
  }
}

export function layoutProjectHeaderDragPreview(
  source: HTMLElement,
  pointerX: number,
  pointerY: number,
  sidebar: ProjectHeaderDragPreviewBounds | null
): ProjectHeaderDragPreviewLayout {
  const rect = source.getBoundingClientRect()
  return {
    grabOffsetX: pointerX - rect.left,
    grabOffsetY: pointerY - rect.top,
    originX: rect.left,
    originY: rect.top,
    width: rect.width,
    height: rect.height,
    sidebar
  }
}

function prefersReducedMotion(): boolean {
  return (
    document.documentElement.hasAttribute('data-reduce-effects') ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

function writeTransform(el: HTMLElement, x: number, y: number): void {
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`
}

function stripAttributes(element: HTMLElement): void {
  for (const name of PREVIEW_STRIP_ATTRIBUTES) {
    element.removeAttribute(name)
  }
}

function stripPreviewClone(clone: HTMLElement): void {
  clone.removeAttribute('id')
  clone.removeAttribute('tabindex')
  clone.setAttribute('aria-hidden', 'true')
  clone.setAttribute('role', 'presentation')
  clone.setAttribute(PROJECT_HEADER_DRAG_PREVIEW_ATTRIBUTE, '')
  stripAttributes(clone)
  for (const node of clone.querySelectorAll('[id]')) {
    node.removeAttribute('id')
  }
  for (const node of clone.querySelectorAll<HTMLElement>('*')) {
    stripAttributes(node)
  }
  for (const node of clone.querySelectorAll(REPO_HEADER_ACTION_SELECTOR)) {
    node.remove()
  }
}

function clearReleaseTimer(): void {
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer)
    releaseTimer = null
  }
}

export function discardProjectHeaderDragPreview(): void {
  clearReleaseTimer()
  const session = mounted
  mounted = null
  if (!session) {
    return
  }
  session.source.removeAttribute(PROJECT_HEADER_DRAG_SOURCE_ATTRIBUTE)
  session.el.remove()
}

export function mountProjectHeaderDragPreview(args: {
  source: HTMLElement
  pointerX: number
  pointerY: number
  sidebar: ProjectHeaderDragPreviewBounds | null
}): HTMLElement {
  discardProjectHeaderDragPreview()
  const layout = layoutProjectHeaderDragPreview(
    args.source,
    args.pointerX,
    args.pointerY,
    args.sidebar
  )
  const clone = args.source.cloneNode(true) as HTMLElement
  clone.classList.add(PROJECT_HEADER_DRAG_PREVIEW_CLASS)
  stripPreviewClone(clone)
  clone.style.position = 'fixed'
  clone.style.left = '0'
  clone.style.top = '0'
  clone.style.width = `${layout.width}px`
  clone.style.height = `${layout.height}px`
  clone.style.margin = '0'
  clone.style.pointerEvents = 'none'
  clone.style.zIndex = '80'
  clone.style.transition = 'none'
  clone.style.willChange = 'transform'
  const { x, y } = projectHeaderDragPreviewTranslate(args.pointerX, args.pointerY, layout)
  writeTransform(clone, x, y)
  document.body.append(clone)
  args.source.setAttribute(PROJECT_HEADER_DRAG_SOURCE_ATTRIBUTE, '')
  mounted = { ...layout, el: clone, source: args.source }
  return clone
}

export function moveProjectHeaderDragPreview(pointerX: number, pointerY: number): void {
  if (!mounted) {
    return
  }
  mounted.el.style.transition = 'none'
  const { x, y } = projectHeaderDragPreviewTranslate(pointerX, pointerY, mounted)
  writeTransform(mounted.el, x, y)
}

export function releaseProjectHeaderDragPreview(args: { commit: boolean }): void {
  const session = mounted
  if (!session) {
    return
  }
  session.source.removeAttribute(PROJECT_HEADER_DRAG_SOURCE_ATTRIBUTE)
  const settle = (): void => {
    if (mounted?.el !== session.el) {
      return
    }
    discardProjectHeaderDragPreview()
  }
  if (prefersReducedMotion()) {
    settle()
    return
  }
  const { el } = session
  el.style.willChange = 'transform, opacity'
  el.style.transition = args.commit
    ? `opacity ${PROJECT_HEADER_DRAG_RELEASE_MS}ms ${PROJECT_HEADER_DRAG_RELEASE_EASING}`
    : `transform ${PROJECT_HEADER_DRAG_RELEASE_MS}ms ${PROJECT_HEADER_DRAG_RELEASE_EASING}`
  if (args.commit) {
    el.style.opacity = '0'
  } else {
    writeTransform(el, session.originX, session.originY)
  }
  const onEnd = (event: TransitionEvent): void => {
    if (event.target !== el) {
      return
    }
    el.removeEventListener('transitionend', onEnd)
    settle()
  }
  el.addEventListener('transitionend', onEnd)
  clearReleaseTimer()
  releaseTimer = setTimeout(settle, PROJECT_HEADER_DRAG_RELEASE_MS + 80)
}

export function startHeaderDragPreview(
  source: HTMLElement,
  pointer: { clientX: number; clientY: number; pointerId: number },
  container: HTMLElement | null
): void {
  if (source.isConnected) {
    try {
      source.setPointerCapture(pointer.pointerId)
    } catch {
      // Capture can fail if the handle unmounted between pointerdown and promote.
    }
  }
  window.getSelection()?.removeAllRanges()
  mountProjectHeaderDragPreview({
    source,
    pointerX: pointer.clientX,
    pointerY: pointer.clientY,
    sidebar: container?.getBoundingClientRect() ?? null
  })
}

export function finishHeaderDragPreview(promoted: boolean, commit: boolean): void {
  if (promoted) {
    releaseProjectHeaderDragPreview({ commit })
    return
  }
  discardProjectHeaderDragPreview()
}

export function teardownHeaderDragHandle(
  handleEl: HTMLElement,
  pointerId: number,
  promoted: boolean,
  commit: boolean,
  onPromoted?: () => void
): void {
  try {
    handleEl.releasePointerCapture(pointerId)
  } catch {
    // Pointer cancellation or unmount may already have released capture.
  }
  if (promoted) {
    onPromoted?.()
  }
  finishHeaderDragPreview(promoted, commit)
}
