// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../../../shared/repository/repo-types'
import { getProjectHeaderDragBucketKey } from './project-header-drop'
import type { RenderRow } from '../listing/render-row'
import {
  commitProjectHeaderMembershipDrop,
  PROJECT_GROUP_DROP_TARGET_ATTRIBUTE,
  getProjectGroupSectionEndIndexByGroupId,
  resolveProjectHeaderMembershipTarget,
  setProjectGroupDropTargetHighlight,
  trackProjectHeaderMembershipTarget
} from './project-header-membership'
import {
  discardProjectHeaderDragPreview,
  mountProjectHeaderDragPreview,
  PROJECT_HEADER_DRAG_PREVIEW_CLASS
} from './project-header-drag-preview'
import { commitProjectHeaderDragDrop } from './project-header-drag-commit'
import type { ProjectHeaderDragSession } from './project-header-drag-contract'
import { buildProjectGroupClusters } from '../../../../../../shared/project-group-clusters'
import type { ProjectGroup } from '../../../../../../shared/project/groups/project-group-types'

const ROW_HEIGHT = 28

afterEach(() => {
  discardProjectHeaderDragPreview()
})

function rect(top: number, height: number, left = 0, width = 240): DOMRect {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: happy-dom does not implement full DOMRect for layout drag tests.
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
  groups: { id: string; index: number; start: number; endIndex?: number; stickyTop?: number }[],
  rows: { index: number; start: number }[] = []
): HTMLElement {
  const container = document.createElement('div')
  container.getBoundingClientRect = () => rect(0, 600)
  const addRow = (index: number, start: number, stickyTop?: number): HTMLElement => {
    const row = document.createElement('div')
    row.setAttribute('data-worktree-virtual-row', '')
    row.setAttribute('data-index', String(index))
    row.setAttribute('data-worktree-virtual-row-start', String(start))
    row.getBoundingClientRect = () => rect(stickyTop ?? start, ROW_HEIGHT)
    container.append(row)
    return row
  }
  for (const entry of groups) {
    const row = addRow(entry.index, entry.start, entry.stickyTop)
    const header = document.createElement('div')
    header.setAttribute('data-project-group-membership-id', entry.id)
    if (entry.endIndex !== undefined) {
      header.setAttribute('data-project-group-membership-section-end-index', String(entry.endIndex))
    }
    header.getBoundingClientRect = () => rect(entry.stickyTop ?? entry.start, ROW_HEIGHT)
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

  it('treats the top edge of a nested child as the parent, not root, when reordering', () => {
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
      resolveProjectHeaderMembershipTarget({
        pointerX: 20,
        pointerY: 102,
        container,
        headerTopEdgePx: 6
      })
    ).toEqual({ kind: 'group', groupId: 'infra' })
  })

  it('joins a collapsed parent on its header only; the hidden child is not a target', () => {
    const container = sidebar([{ id: 'infra', index: 0, start: 0 }])
    const at = (y: number) =>
      resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: y, container })
    expect(at(10)).toEqual({ kind: 'group', groupId: 'infra' })
    expect(at(40)).toEqual({ kind: 'root' })
  })

  it('lets a last collapsed or empty child drop out to the parent, and the parent top-edge out to root', () => {
    const container = sidebar(
      [
        { id: 'infra', index: 0, start: 0, endIndex: 9 },
        { id: 'dockhand', index: 3, start: 100 }
      ],
      [{ index: 6, start: 200 }]
    )
    const at = (y: number, headerTopEdgePx?: number) =>
      resolveProjectHeaderMembershipTarget({
        pointerX: 20,
        pointerY: y,
        container,
        headerTopEdgePx
      })
    expect(at(110)).toEqual({ kind: 'group', groupId: 'dockhand' })
    expect(at(150)).toEqual({ kind: 'group', groupId: 'infra' })
    expect(at(2, 6)).toEqual({ kind: 'root' })
  })

  it('joins a pinned parent header while content-Y is inside a nested child', () => {
    const container = sidebar(
      [
        { id: 'infra', index: 0, start: 0, endIndex: 9, stickyTop: 0 },
        { id: 'dockhand', index: 3, start: 100, endIndex: 6 }
      ],
      [
        { index: 6, start: 200 },
        { index: 9, start: 400 }
      ]
    )
    container.scrollTop = 150
    expect(resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: 10, container })).toEqual(
      { kind: 'group', groupId: 'infra' }
    )
    // Viewport 30 is below the pinned parent (0–28); content Y 180 is still inside the child.
    expect(resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: 30, container })).toEqual(
      { kind: 'group', groupId: 'dockhand' }
    )
  })

  it('ignores a floating parent-header clone so it cannot beat the child as innermost', () => {
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
    const parent = container.querySelector<HTMLElement>(
      '[data-project-group-membership-id="infra"]'
    )
    if (!parent) {
      throw new Error('missing parent header')
    }
    const clone = mountProjectHeaderDragPreview({
      source: parent,
      pointerX: 20,
      pointerY: 150,
      sidebar: null
    })
    container.append(clone)
    expect(clone.hasAttribute('data-project-group-membership-id')).toBe(false)
    expect(clone.classList.contains(PROJECT_HEADER_DRAG_PREVIEW_CLASS)).toBe(true)
    expect(clone.style.pointerEvents).toBe('none')
    expect(
      resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: 150, container })
    ).toEqual({ kind: 'group', groupId: 'dockhand' })
  })

  it('skips a preview node even if strip missed the membership id', () => {
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
    const clone = document.createElement('div')
    clone.className = PROJECT_HEADER_DRAG_PREVIEW_CLASS
    clone.setAttribute('data-project-group-membership-id', 'infra')
    clone.setAttribute('data-project-group-membership-section-end-index', '3')
    clone.getBoundingClientRect = () => rect(140, ROW_HEIGHT)
    container.append(clone)
    expect(
      resolveProjectHeaderMembershipTarget({ pointerX: 20, pointerY: 150, container })
    ).toEqual({ kind: 'group', groupId: 'dockhand' })
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
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: fixture rows omit fields the production RenderRow union normally carries.
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

  it('highlights only the innermost nested group, never its parent', () => {
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
    const marked = () =>
      [...container.querySelectorAll(`[${PROJECT_GROUP_DROP_TARGET_ATTRIBUTE}]`)].map((el) =>
        el.getAttribute('data-project-group-membership-id')
      )
    const drag = session({
      repo: repo(),
      latestPointerX: 20,
      latestPointerY: 150,
      membershipEnabled: true,
      reorderEnabled: false
    })
    expect(trackProjectHeaderMembershipTarget(drag, container, (id) => id)).toBe(true)
    expect(drag.membershipTarget).toEqual({ kind: 'group', groupId: 'dockhand' })
    expect(marked()).toEqual(['dockhand'])

    drag.latestPointerY = 300
    expect(trackProjectHeaderMembershipTarget(drag, container, (id) => id)).toBe(true)
    expect(drag.membershipTarget).toEqual({ kind: 'group', groupId: 'infra' })
    expect(marked()).toEqual(['infra'])
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

  it('moves a project from a child group into its parent', () => {
    const onCommit = vi.fn()
    const nested = repo({ projectGroupId: 'dockhand' })
    expect(
      commitProjectHeaderMembershipDrop({
        session: session({
          repo: nested,
          membershipTarget: { kind: 'group', groupId: 'infra' }
        }),
        liveRepos: [nested],
        canonicalGroupIdOf: (id) => id,
        onCommitProjectGroupOrder: onCommit
      })
    ).toBe(true)
    expect(onCommit).toHaveBeenCalledWith(nested, 'infra')
  })

  it('moves a project from a child group out to root', () => {
    const onCommit = vi.fn()
    const nested = repo({ projectGroupId: 'dockhand' })
    expect(
      commitProjectHeaderMembershipDrop({
        session: session({ repo: nested, membershipTarget: { kind: 'root' } }),
        liveRepos: [nested],
        canonicalGroupIdOf: (id) => id,
        onCommitProjectGroupOrder: onCommit
      })
    ).toBe(true)
    expect(onCommit).toHaveBeenCalledWith(nested, null)
  })

  it('does not treat a nested child as a twin of a same-named root group on another host', () => {
    const onCommit = vi.fn()
    const nested = repo({ projectGroupId: 'child-local' })
    const group = (
      id: string,
      name: string,
      parentGroupId: string | null,
      executionHostId: string,
      createdAt: number
    ): ProjectGroup => ({
      id,
      name,
      parentPath: null,
      parentGroupId,
      createdFrom: 'manual',
      tabOrder: 0,
      isCollapsed: false,
      color: null,
      createdAt,
      updatedAt: createdAt,
      executionHostId
    })
    const { canonicalById } = buildProjectGroupClusters([
      group('infra-local', 'infra', null, 'runtime:a', 1),
      group('child-local', 'dockhand group', 'infra-local', 'runtime:a', 1),
      group('dock-remote', 'dockhand group', null, 'runtime:b', 9)
    ])
    const canonicalGroupIdOf = (id: string) => canonicalById.get(id)?.id ?? id
    expect(canonicalGroupIdOf('child-local')).not.toBe(canonicalGroupIdOf('dock-remote'))
    expect(
      commitProjectHeaderMembershipDrop({
        session: session({
          repo: nested,
          membershipTarget: { kind: 'group', groupId: 'dock-remote' }
        }),
        liveRepos: [nested],
        canonicalGroupIdOf,
        onCommitProjectGroupOrder: onCommit
      })
    ).toBe(true)
    expect(onCommit).toHaveBeenCalledWith(nested, 'dock-remote')
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
