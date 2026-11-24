// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { PROJECT_HEADER_DRAG_PREVIEW_CLASS } from './project-header-drag-preview-dom'
import { measureProjectHeaderDragRects } from './project-header-drop'
import { measureProjectGroupHeaderDragRects } from './project-group-header-drop'
import { measureRootProjectHeaderDragRects } from './root-project-header-drop'

function rect(top: number, height = 28, left = 0, width = 240): DOMRect {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: happy-dom does not implement full DOMRect for drag preview measures.
  return {
    top,
    bottom: top + height,
    left,
    right: left + width,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect
}

function containerWithClone(attrs: Record<string, string>): HTMLElement {
  const container = document.createElement('div')
  container.getBoundingClientRect = () => rect(0, 600)
  const real = document.createElement('div')
  const clone = document.createElement('div')
  clone.className = PROJECT_HEADER_DRAG_PREVIEW_CLASS
  for (const [name, value] of Object.entries(attrs)) {
    real.setAttribute(name, value)
    clone.setAttribute(name, value)
  }
  real.getBoundingClientRect = () => rect(40)
  clone.getBoundingClientRect = () => rect(80)
  container.append(real, clone)
  return container
}

describe('measure* skips a floating clone even if it still has header ids', () => {
  it('does not count a cloned repo header as a reorder target', () => {
    const container = containerWithClone({
      'data-repo-header-id': 'saadiqhorton',
      'data-repo-header-bucket': 'ungrouped',
      'data-repo-header-index': '0'
    })
    expect(measureProjectHeaderDragRects(container).map((entry) => entry.repoId)).toEqual([
      'saadiqhorton'
    ])
  })

  it('does not count a cloned group header as a reorder target', () => {
    const container = containerWithClone({
      'data-project-group-header-id': 'infra',
      'data-project-group-header-bucket': 'root',
      'data-project-group-header-index': '0'
    })
    expect(measureProjectGroupHeaderDragRects(container).map((entry) => entry.groupId)).toEqual([
      'infra'
    ])
  })

  it('does not count a cloned root header as a reorder target', () => {
    const container = containerWithClone({
      'data-root-project-header-key': 'repo:saadiqhorton'
    })
    expect(
      measureRootProjectHeaderDragRects(container, ['repo:saadiqhorton']).map((entry) => entry.key)
    ).toEqual(['repo:saadiqhorton'])
  })
})
