// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import { getProjectHeaderDragBucketKey } from './project-header-drop'
import type { RenderRow } from '../listing/render-row'
import {
  commitProjectHeaderMembershipDrop,
  PROJECT_GROUP_DROP_TARGET_ATTRIBUTE,
  getProjectGroupSectionEndIndexByGroupId,
  resolveProjectHeaderMembershipTarget,
  setProjectGroupDropTargetHighlight
} from './project-header-membership'
import { commitProjectHeaderDragDrop } from './project-header-drag-commit'
import type { ProjectHeaderDragSession } from './project-header-drag-contract'

const ROW_HEIGHT = 28

function rect(top: number, height: number, left = 0, width = 240): DOMRect {
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

/**
 * A sidebar of virtual rows. Group headers carry the render-row index where their section ends;
 * `rows` are the other rendered rows (by index) so a section end can be measured.
 */
function sidebar(
  groups: { id: string; index: number; start: number; endIndex?: number }[],
  rows: { index: number; start: number }[] = []
): HTMLElement {
  const container = document.createElement('div')
  container.getBoundingClientRect = () => rect(0, 600)
  const addRow = (index: number, start: number): HTMLElement => {
    const row = document.createElement('div')
    row.setAttribute('data-worktree-virtual-row', '')
    row.setAttribute('data-index', String(index))
    row.setAttribute('data-worktree-virtual-row-start', String(start))
    row.getBoundingClientRect = () => rect(start, ROW_HEIGHT)
    container.append(row)
    return row
  }
  for (const entry of groups) {
    const row = addRow(entry.index, entry.start)
    const header = document.createElement('div')
    header.setAttribute('data-project-group-membership-id', entry.id)
    if (entry.endIndex !== undefined) {
      header.setAttribute('data-project-group-membership-section-end-index', String(entry.endIndex))
    }
    header.getBoundingClientRect = () => rect(entry.start, ROW_HEIGHT)
    row.append(header)
  }
  for (const entry of rows) {
    addRow(entry.index, entry.start)
  }
  document.body.append(container)
  return container
}

const repo = (overrides: Partial<Repo> = {}): Repo => ({
  id: 'saadiqhorton',
  path: '/p',
  displayName: 'saadiqhorton',
  badgeColor: '',
  addedAt: 0,
  ...overrides
})

function session(overrides: Partial<ProjectHeaderDragSession> = {}): ProjectHeaderDragSession {
  return {
    repo: repo(),
    bucketKey: 'ungrouped',
    sidebarRepoHeaderIds: ['saadiqhorton'],
    pointerId: 1,
    headerRects: [],
    handleEl: document.createElement('div'),
    startX: 0,
    startY: 0,
    latestPointerX: 10,
    latestPointerY: 10,
    promoted: true,
    membershipEnabled: true,
    reorderEnabled: false,
    ...overrides
  }
}

describe('resolveProjectHeaderMembershipTarget', () => {
  it('finds the group under the pointer, header or section body', () => {
    const container = sidebar(
      [{ id: 'dockhand', index: 2, start: 100, endIndex: 5 }],
      [{ index: 5, start: 250 }]
    )
    const at = (y: number) =>
      resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: y, container })
    expect(at(110)).toEqual({ kind: 'group', groupId: 'dockhand' })
    expect(at(240)).toEqual({ kind: 'group', groupId: 'dockhand' })
    expect(at(60)).toEqual({ kind: 'root' })
    expect(at(300)).toEqual({ kind: 'root' })
  })

  it('prefers the innermost nested group', () => {
    const container = sidebar(
      [
        { id: 'infra', index: 0, start: 0, endIndex: 9 },
        { id: 'dockhand', index: 3, start: 100, endIndex: 6 }
      ],
      [
        { index: 6, start: 200 },
        { index: 9, start: 400 }
      ]
    )
    expect(
      resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: 150, container })
    ).toEqual({ kind: 'group', groupId: 'dockhand' })
    expect(
      resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: 300, container })
    ).toEqual({ kind: 'group', groupId: 'infra' })
  })

  it('has no membership intent once the pointer leaves the sidebar', () => {
    const container = sidebar(
      [{ id: 'dockhand', index: 2, start: 100, endIndex: 5 }],
      [{ index: 5, start: 250 }]
    )
    expect(
      resolveProjectHeaderMembershipTarget({ pointerX: 500, pointerY: 110, container })
    ).toBeNull()
    expect(
      resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: 900, container })
    ).toBeNull()
  })

  it('leaves the top edge of a header for insert-before when reordering', () => {
    const container = sidebar(
      [{ id: 'dockhand', index: 2, start: 100, endIndex: 5 }],
      [{ index: 5, start: 250 }]
    )
    expect(
      resolveProjectHeaderMembershipTarget({
        pointerX: 20,
        pointerY: 102,
        container,
        headerTopEdgePx: 6
      })
    ).toEqual({ kind: 'root' })
  })

  it('treats a header with no measured section (collapsed/repeated) as header-only', () => {
    const container = sidebar([{ id: 'dockhand', index: 2, start: 100 }])
    const at = (y: number) =>
      resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: y, container })
    expect(at(120)).toEqual({ kind: 'group', groupId: 'dockhand' })
    expect(at(140)).toEqual({ kind: 'root' })
  })
})

describe('membership section ends', () => {
  it('ends at the real start of the next row, not an estimate (root project right below a group)', () => {
    // Workspace rows render taller than estimated; the measured row start is what counts.
    const container = sidebar(
      [{ id: 'dockhand', index: 0, start: 0, endIndex: 5 }],
      [{ index: 5, start: 232 }]
    )
    expect(
      resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: 240, container })
    ).toEqual({ kind: 'root' })
    expect(
      resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: 200, container })
    ).toEqual({ kind: 'group', groupId: 'dockhand' })
  })

  it('runs past the viewport when the end row is not rendered', () => {
    const container = sidebar([{ id: 'dockhand', index: 0, start: 0, endIndex: 40 }])
    expect(
      resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: 590, container })
    ).toEqual({ kind: 'group', groupId: 'dockhand' })
  })

  it('treats a repeated host-section copy (no section end) as a header-only target', () => {
    const container = sidebar([{ id: 'dockhand', index: 0, start: 0 }], [{ index: 1, start: 28 }])
    expect(resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: 10, container })).toEqual(
      { kind: 'group', groupId: 'dockhand' }
    )
    expect(resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: 60, container })).toEqual(
      { kind: 'root' }
    )
  })

  it('computes section end indexes from the render rows (nested groups end at shallower headers)', () => {
    const header = (extra: Record<string, unknown>) => ({
      type: 'header',
      key: String(Math.random()),
      ...extra
    })
    const rows = [
      header({ projectGroup: { id: 'infra' }, projectGroupDepth: 0 }),
      header({ projectGroup: { id: 'dockhand' }, projectGroupDepth: 1 }),
      header({ repo: { id: 'a' }, projectGroupDepth: 2 }),
      { type: 'item', key: 'w' },
      header({ repo: { id: 'b' }, projectGroupDepth: 1 }),
      header({ repo: { id: 'root' }, projectGroupDepth: 0 })
    ] as unknown as RenderRow[]
    const ends = getProjectGroupSectionEndIndexByGroupId(rows)
    expect(ends.get('dockhand')).toBe(4)
    expect(ends.get('infra')).toBe(5)
  })
})

describe('setProjectGroupDropTargetHighlight', () => {
  it('marks only the hovered group header and clears it afterwards', () => {
    const container = sidebar([
      { id: 'a', index: 0, start: 0 },
      { id: 'b', index: 1, start: 40 }
    ])
    setProjectGroupDropTargetHighlight(container, 'b')
    const marked = () =>
      [...container.querySelectorAll(`[${PROJECT_GROUP_DROP_TARGET_ATTRIBUTE}]`)].map((el) =>
        el.getAttribute('data-project-group-membership-id')
      )
    expect(marked()).toEqual(['b'])
    setProjectGroupDropTargetHighlight(container, 'a')
    expect(marked()).toEqual(['a'])
    setProjectGroupDropTargetHighlight(container, null)
    expect(marked()).toEqual([])
  })
})

describe('commitProjectHeaderMembershipDrop', () => {
  const twins = new Map([
    ['dock-local', 'dock-remote'],
    ['dock-remote', 'dock-remote']
  ])
  const canonicalGroupIdOf = (id: string) => twins.get(id) ?? id

  it('joins the hovered group, in any sort mode', () => {
    const onCommit = vi.fn()
    const handled = commitProjectHeaderMembershipDrop({
      session: session({ membershipTarget: { kind: 'group', groupId: 'dock-remote' } }),
      liveRepos: [repo()],
      canonicalGroupIdOf,
      onCommitProjectGroupOrder: onCommit
    })
    expect(handled).toBe(true)
    expect(onCommit).toHaveBeenCalledWith(repo(), 'dock-remote')
  })

  it('does nothing when the project already sits in a twin of that group', () => {
    const onCommit = vi.fn()
    const handled = commitProjectHeaderMembershipDrop({
      session: session({ membershipTarget: { kind: 'group', groupId: 'dock-remote' } }),
      liveRepos: [repo({ projectGroupId: 'dock-local' })],
      canonicalGroupIdOf,
      onCommitProjectGroupOrder: onCommit
    })
    expect(handled).toBe(false)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('leaves the group when dropped outside every group', () => {
    const onCommit = vi.fn()
    commitProjectHeaderMembershipDrop({
      session: session({ membershipTarget: { kind: 'root' } }),
      liveRepos: [repo({ projectGroupId: 'dock-local' })],
      canonicalGroupIdOf,
      onCommitProjectGroupOrder: onCommit
    })
    expect(onCommit).toHaveBeenCalledWith(repo({ projectGroupId: 'dock-local' }), null)
  })

  it('ignores drops outside the sidebar', () => {
    const onCommit = vi.fn()
    expect(
      commitProjectHeaderMembershipDrop({
        session: session({ membershipTarget: null }),
        liveRepos: [repo({ projectGroupId: 'dock-local' })],
        canonicalGroupIdOf,
        onCommitProjectGroupOrder: onCommit
      })
    ).toBe(false)
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('commitProjectHeaderDragDrop with membership', () => {
  it('does not reorder when sorting is not manual and membership is unchanged', () => {
    const onCommitProjectGroupOrder = vi.fn()
    const onCommitRepoOrder = vi.fn()
    const onCommitRootProjectOrder = vi.fn()
    commitProjectHeaderDragDrop({
      session: session({
        membershipTarget: { kind: 'root' },
        rootProjectHeaderKeys: ['repo:saadiqhorton', 'group:dock']
      }),
      sidebarDropIndex: 2,
      orderedRepoIds: ['saadiqhorton'],
      repoById: new Map(),
      liveRepos: [repo()],
      usesProjectGroupOrdering: true,
      canonicalGroupIdOf: (id) => id,
      onCommitRepoOrder,
      onCommitProjectGroupOrder,
      onCommitRootProjectOrder
    })
    expect(onCommitProjectGroupOrder).not.toHaveBeenCalled()
    expect(onCommitRepoOrder).not.toHaveBeenCalled()
    expect(onCommitRootProjectOrder).not.toHaveBeenCalled()
  })

  it('a group drop wins over the root reorder slot in manual order', () => {
    const onCommitProjectGroupOrder = vi.fn()
    const onCommitRootProjectOrder = vi.fn()
    commitProjectHeaderDragDrop({
      session: session({
        reorderEnabled: true,
        membershipTarget: { kind: 'group', groupId: 'dock' },
        rootProjectHeaderKeys: ['repo:saadiqhorton', 'group:dock']
      }),
      sidebarDropIndex: null,
      orderedRepoIds: ['saadiqhorton'],
      repoById: new Map(),
      liveRepos: [repo()],
      usesProjectGroupOrdering: true,
      canonicalGroupIdOf: (id) => id,
      onCommitRepoOrder: vi.fn(),
      onCommitProjectGroupOrder,
      onCommitRootProjectOrder
    })
    expect(onCommitProjectGroupOrder).toHaveBeenCalledWith(repo(), 'dock')
    expect(onCommitRootProjectOrder).not.toHaveBeenCalled()
  })

  it('still reorders at root in manual order when no group changes', () => {
    const onCommitRootProjectOrder = vi.fn()
    commitProjectHeaderDragDrop({
      session: session({
        reorderEnabled: true,
        membershipTarget: { kind: 'root' },
        rootProjectHeaderKeys: ['repo:saadiqhorton', 'group:dock']
      }),
      sidebarDropIndex: 2,
      orderedRepoIds: ['saadiqhorton'],
      repoById: new Map(),
      liveRepos: [repo()],
      usesProjectGroupOrdering: true,
      canonicalGroupIdOf: (id) => id,
      onCommitRepoOrder: vi.fn(),
      onCommitProjectGroupOrder: vi.fn(),
      onCommitRootProjectOrder
    })
    expect(onCommitRootProjectOrder).toHaveBeenCalledWith(
      ['repo:saadiqhorton', 'group:dock'],
      'repo:saadiqhorton',
      2
    )
  })
})

describe('getProjectHeaderDragBucketKey', () => {
  it('puts projects in twin groups into one reorder bucket', () => {
    const canonical = (id: string) => (id === 'dock-local' ? 'dock-remote' : id)
    expect(getProjectHeaderDragBucketKey({ projectGroupId: 'dock-local' }, canonical)).toBe(
      getProjectHeaderDragBucketKey({ projectGroupId: 'dock-remote' }, canonical)
    )
    expect(getProjectHeaderDragBucketKey({ projectGroupId: null }, canonical)).toBe('ungrouped')
  })
})
