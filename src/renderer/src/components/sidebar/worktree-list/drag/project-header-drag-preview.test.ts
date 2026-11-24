// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  discardProjectHeaderDragPreview,
  finishHeaderDragPreview,
  layoutProjectHeaderDragPreview,
  mountProjectHeaderDragPreview,
  moveProjectHeaderDragPreview,
  PROJECT_HEADER_DRAG_PREVIEW_CLASS,
  PROJECT_HEADER_DRAG_RUBBER_BAND,
  PROJECT_HEADER_DRAG_SOURCE_ATTRIBUTE,
  projectHeaderDragPreviewTranslate,
  releaseProjectHeaderDragPreview,
  rubberBandAxis,
  startHeaderDragPreview
} from './project-header-drag-preview'
import {
  PROJECT_GROUP_DROP_TARGET_ATTRIBUTE,
  PROJECT_GROUP_MEMBERSHIP_ID_ATTRIBUTE,
  PROJECT_GROUP_MEMBERSHIP_SECTION_END_INDEX_ATTRIBUTE
} from './project-header-membership'

function rect(left: number, top: number, width: number, height: number): DOMRect {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: happy-dom does not implement full DOMRect for drag preview tests.
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect
}

function header(label: string): HTMLElement {
  const el = document.createElement('div')
  el.id = 'worktree-option-saadiqhorton'
  el.setAttribute(PROJECT_GROUP_MEMBERSHIP_ID_ATTRIBUTE, 'infra')
  el.setAttribute(PROJECT_GROUP_MEMBERSHIP_SECTION_END_INDEX_ATTRIBUTE, '9')
  el.setAttribute(PROJECT_GROUP_DROP_TARGET_ATTRIBUTE, '')
  el.setAttribute('data-project-group-header-id', 'infra')
  el.setAttribute('data-project-group-header-index', '0')
  el.setAttribute('data-project-group-header-bucket', 'root')
  el.setAttribute('data-project-group-header-section-end', '400')
  el.setAttribute('data-project-group-header-drag-handle', '')
  el.setAttribute('data-repo-header-id', 'saadiqhorton')
  el.setAttribute('data-repo-header-index', '1')
  el.setAttribute('data-repo-header-bucket', 'ungrouped')
  el.setAttribute('data-repo-header-section-end', '28')
  el.setAttribute('data-repo-header-drag-handle', '')
  el.setAttribute('data-root-project-header-key', 'repo:saadiqhorton')
  el.setAttribute('data-root-project-header-host', 'runtime:a')
  el.setAttribute('data-root-project-header-section-end', '28')
  el.getBoundingClientRect = () => rect(24, 180, 240, 28)
  const icon = document.createElement('div')
  icon.className = 'size-4 shrink-0'
  const title = document.createElement('div')
  title.className = 'min-w-0 truncate text-[13px] font-semibold leading-4'
  title.textContent = label
  const actions = document.createElement('div')
  actions.setAttribute('data-repo-header-actions', '')
  const button = document.createElement('button')
  button.textContent = 'Create workspace'
  actions.append(button)
  el.append(icon, title, actions)
  document.body.append(el)
  return el
}

afterEach(() => {
  discardProjectHeaderDragPreview()
  document.body.replaceChildren()
  document.documentElement.removeAttribute('data-reduce-effects')
})

describe('rubberBandAxis', () => {
  it('is 1:1 inside the bounds', () => {
    expect(rubberBandAxis(40, 0, 100)).toBe(40)
  })

  it('moves a fraction of the overflow past a bound', () => {
    expect(rubberBandAxis(-20, 0, 100)).toBe(-20 * PROJECT_HEADER_DRAG_RUBBER_BAND)
    expect(rubberBandAxis(150, 0, 100)).toBe(100 + 50 * PROJECT_HEADER_DRAG_RUBBER_BAND)
  })
})

describe('projectHeaderDragPreviewTranslate', () => {
  const layout = layoutProjectHeaderDragPreview(
    Object.assign(document.createElement('div'), {
      getBoundingClientRect: () => rect(24, 180, 240, 28)
    }),
    40,
    194,
    { left: 0, right: 280, top: 40, bottom: 800 }
  )

  it('tracks the pointer 1:1 on Y and inside the sidebar on X', () => {
    expect(projectHeaderDragPreviewTranslate(40, 194, layout)).toEqual({ x: 24, y: 180 })
    expect(projectHeaderDragPreviewTranslate(40, 260, layout)).toEqual({ x: 24, y: 246 })
  })

  it('rubber-bands X when the pointer leaves the sidebar', () => {
    const { x } = projectHeaderDragPreviewTranslate(400, 194, layout)
    expect(x).toBeGreaterThan(280 - 240)
    expect(x).toBeLessThan(400 - 16)
  })
})

describe('mountProjectHeaderDragPreview', () => {
  it('strips every SectionHeader identity attr so a clone cannot steal drop targeting', () => {
    const source = header('saadiqhorton')
    const preview = mountProjectHeaderDragPreview({
      source,
      pointerX: 40,
      pointerY: 194,
      sidebar: null
    })
    expect(preview.getAttribute('id')).toBeNull()
    expect(preview.hasAttribute(PROJECT_GROUP_MEMBERSHIP_ID_ATTRIBUTE)).toBe(false)
    expect(preview.hasAttribute(PROJECT_GROUP_MEMBERSHIP_SECTION_END_INDEX_ATTRIBUTE)).toBe(false)
    expect(preview.hasAttribute(PROJECT_GROUP_DROP_TARGET_ATTRIBUTE)).toBe(false)
    expect(preview.hasAttribute('data-project-group-header-id')).toBe(false)
    expect(preview.hasAttribute('data-project-group-header-index')).toBe(false)
    expect(preview.hasAttribute('data-project-group-header-bucket')).toBe(false)
    expect(preview.hasAttribute('data-project-group-header-section-end')).toBe(false)
    expect(preview.hasAttribute('data-project-group-header-drag-handle')).toBe(false)
    expect(preview.hasAttribute('data-repo-header-id')).toBe(false)
    expect(preview.hasAttribute('data-repo-header-index')).toBe(false)
    expect(preview.hasAttribute('data-repo-header-bucket')).toBe(false)
    expect(preview.hasAttribute('data-repo-header-section-end')).toBe(false)
    expect(preview.hasAttribute('data-repo-header-drag-handle')).toBe(false)
    expect(preview.hasAttribute('data-root-project-header-key')).toBe(false)
    expect(preview.hasAttribute('data-root-project-header-host')).toBe(false)
    expect(preview.hasAttribute('data-root-project-header-section-end')).toBe(false)
    expect(source.hasAttribute(PROJECT_HEADER_DRAG_SOURCE_ATTRIBUTE)).toBe(true)
  })

  it('follows the grab point, dims the source, and strips actions so long names cannot shove buttons', () => {
    const source = header('Q3 Board Deck — FINAL (revised) v12 [approved by legal].pdf')
    const preview = mountProjectHeaderDragPreview({
      source,
      pointerX: 40,
      pointerY: 194,
      sidebar: { left: 0, right: 280, top: 40, bottom: 800 }
    })
    expect(preview.classList.contains(PROJECT_HEADER_DRAG_PREVIEW_CLASS)).toBe(true)
    expect(preview.style.transform).toBe('translate3d(24px, 180px, 0)')
    expect(preview.style.transition).toBe('none')
    expect(preview.querySelector('[data-repo-header-actions]')).toBeNull()
    expect(preview.querySelector('button')).toBeNull()
    expect(preview.textContent).toContain('Q3 Board Deck')
    expect(source.getAttribute(PROJECT_HEADER_DRAG_SOURCE_ATTRIBUTE)).toBe('')
    moveProjectHeaderDragPreview(40, 300)
    expect(preview.style.transform).toBe('translate3d(24px, 286px, 0)')
  })

  it('keeps CJK and emoji labels intact on the clone', () => {
    const source = header('🦊 王秀英')
    const preview = mountProjectHeaderDragPreview({
      source,
      pointerX: 40,
      pointerY: 194,
      sidebar: null
    })
    expect(preview.textContent).toBe('🦊 王秀英')
  })

  it('drops the clone immediately under reduced motion', () => {
    document.documentElement.setAttribute('data-reduce-effects', '')
    const source = header('saadiqhorton')
    mountProjectHeaderDragPreview({
      source,
      pointerX: 40,
      pointerY: 194,
      sidebar: null
    })
    releaseProjectHeaderDragPreview({ commit: true })
    expect(document.querySelector(`.${PROJECT_HEADER_DRAG_PREVIEW_CLASS}`)).toBeNull()
    expect(source.hasAttribute(PROJECT_HEADER_DRAG_SOURCE_ATTRIBUTE)).toBe(false)
  })

  it('snaps back with a CSS transition, never a keyframe', () => {
    vi.useFakeTimers()
    const source = header('saadiqhorton')
    const preview = mountProjectHeaderDragPreview({
      source,
      pointerX: 40,
      pointerY: 194,
      sidebar: null
    })
    moveProjectHeaderDragPreview(40, 300)
    releaseProjectHeaderDragPreview({ commit: false })
    expect(preview.style.transition).toContain('transform')
    expect(preview.style.transition).not.toContain('animation')
    expect(preview.style.transform).toBe('translate3d(24px, 180px, 0)')
    preview.dispatchEvent(new Event('transitionend'))
    expect(document.querySelector(`.${PROJECT_HEADER_DRAG_PREVIEW_CLASS}`)).toBeNull()
    vi.useRealTimers()
  })
})

describe('startHeaderDragPreview / finishHeaderDragPreview', () => {
  it('promotes a clone and discards it when the gesture never committed', () => {
    const source = header('saadiqhorton')
    startHeaderDragPreview(source, { clientX: 40, clientY: 194, pointerId: 1 }, null)
    expect(document.querySelector(`.${PROJECT_HEADER_DRAG_PREVIEW_CLASS}`)).not.toBeNull()
    finishHeaderDragPreview(false, false)
    expect(document.querySelector(`.${PROJECT_HEADER_DRAG_PREVIEW_CLASS}`)).toBeNull()
    expect(source.hasAttribute(PROJECT_HEADER_DRAG_SOURCE_ATTRIBUTE)).toBe(false)
  })

  it('releases with a transition when the drag was promoted', () => {
    vi.useFakeTimers()
    const source = header('saadiqhorton')
    startHeaderDragPreview(source, { clientX: 40, clientY: 194, pointerId: 1 }, null)
    const preview = document.querySelector<HTMLElement>(`.${PROJECT_HEADER_DRAG_PREVIEW_CLASS}`)
    if (!preview) {
      throw new Error('missing preview')
    }
    finishHeaderDragPreview(true, false)
    expect(preview.style.transition).toContain('transform')
    preview.dispatchEvent(new Event('transitionend'))
    expect(document.querySelector(`.${PROJECT_HEADER_DRAG_PREVIEW_CLASS}`)).toBeNull()
    vi.useRealTimers()
  })
})
