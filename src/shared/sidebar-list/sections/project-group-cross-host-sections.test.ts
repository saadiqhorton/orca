import { describe, expect, it } from 'vitest'
import { LOCAL_EXECUTION_HOST_ID } from '../../execution-host/execution-host'
import type { ProjectGroup } from '../../project/groups/project-group-types'
import type { Repo } from '../../repository/repo-types'
import { NO_WORKSPACE_ROW_FILTERS } from '../../workspace-view/workspace-row-filters'
import { ALL_GROUP_KEY } from './group-keys'
import type { HostSectionRow } from '../hosts/host-section-rows'
import { normalizePairedServerRow } from '../feed-facts/paired-server-rows'
import type { SidebarFeedDomains } from '../feed/sidebar-feed-domains'
import { buildSidebarFeedRows, type SidebarFeedView } from '../feed/sidebar-feed-rows'
import { getProjectGroupOccurrencePaths } from './project-group-sections'

function repo(id: string, overrides: Partial<Repo> = {}): Repo {
  return { id, path: `/${id}`, displayName: id, badgeColor: '', addedAt: 0, ...overrides }
}

function group(id: string, overrides: Partial<ProjectGroup> = {}): ProjectGroup {
  return {
    id,
    name: id,
    parentPath: null,
    parentGroupId: null,
    createdFrom: 'manual',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function view(overrides: Partial<SidebarFeedView> = {}): SidebarFeedView {
  return {
    groupBy: 'repo',
    sortBy: 'recent',
    projectOrderBy: 'manual',
    collapsedGroups: new Set(),
    filters: NO_WORKSPACE_ROW_FILTERS,
    workspaceHostScope: 'all',
    visibleWorkspaceHostIds: null,
    workspaceStatuses: [],
    pinnedDisplayPolicy: 'single-location',
    defaultHostId: LOCAL_EXECUTION_HOST_ID,
    hostLabelOverrides: new Map(),
    localHostLabel: 'This computer',
    ...overrides
  }
}

const HOSTS = ['runtime:a', 'runtime:b', 'runtime:c'] as const

function feed(worktrees: { hostId: (typeof HOSTS)[number]; repoId: string }[]): SidebarFeedDomains {
  const rows = worktrees.flatMap(
    ({ hostId, repoId }) =>
      normalizePairedServerRow(hostId, {
        worktreeId: `${repoId}::/${repoId}/main`,
        repoId,
        worktreeInstanceId: `${hostId}-${repoId}`
      }) ?? []
  )
  return {
    workspaces: new Map(),
    activity: new Map(),
    review: new Map(),
    creations: new Map(),
    pairedServerHosts: new Map(HOSTS.map((hostId) => [hostId, { freshness: 'live', host: null }])),
    pairedServerRows: new Map(rows.map((row) => [row.key, row])),
    repoIcons: new Map(),
    desktop: null,
    projectCatalog: null,
    retention: null
  }
}

/** Headers as `# label@depth`, items as `host|repo@depth`. */
function outline(rows: readonly HostSectionRow[]): string[] {
  return rows.flatMap((row) => {
    if (row.type === 'item') {
      return [`${row.worktree.hostId ?? ''}|${row.repo?.id ?? ''}@${String(row.depth)}`]
    }
    if (row.type === 'header' && row.key !== ALL_GROUP_KEY) {
      return [`# ${row.label ?? row.key}@${String(row.projectGroupDepth ?? 0)}`]
    }
    return row.type === 'host-header' ? [`## ${row.label}`] : []
  })
}

function build(repos: Repo[], projectGroups: ProjectGroup[], settings = view()) {
  const worktrees = repos.map((entry) => ({
    hostId: entry.executionHostId as (typeof HOSTS)[number],
    repoId: entry.id
  }))
  return buildSidebarFeedRows(
    feed(worktrees),
    { repos, projectGroups, projectGrouping: { projects: [], projectHostSetups: [] } },
    settings
  )
}

describe('same-named project groups on different machines', () => {
  const dockhandA = group('dock-a', {
    name: 'dockhand group',
    executionHostId: 'runtime:a',
    createdAt: 1
  })
  const dockhandB = group('dock-b', {
    name: 'Dockhand Group ',
    executionHostId: 'runtime:b',
    createdAt: 5
  })

  it('draws one group header holding projects from both machines', () => {
    const repos = [
      repo('dockhand', { executionHostId: 'runtime:a', projectGroupId: 'dock-a' }),
      repo('saadiqhorton', { executionHostId: 'runtime:b', projectGroupId: 'dock-b' })
    ]
    const headers = outline(build(repos, [dockhandA, dockhandB]).sectionRows).filter((line) =>
      line.startsWith('#')
    )
    // The oldest twin names the merged header.
    expect(headers.filter((line) => line.startsWith('# dockhand group'))).toEqual([
      '# dockhand group@0'
    ])
    expect(headers).toContain('# dockhand@1')
    expect(headers).toContain('# saadiqhorton@1')
    expect(headers.some((line) => line.startsWith('# Dockhand Group'))).toBe(false)
  })

  it('keeps an empty twin from drawing a second header', () => {
    const repos = [repo('dockhand', { executionHostId: 'runtime:a', projectGroupId: 'dock-a' })]
    const headers = outline(build(repos, [dockhandA, dockhandB]).sectionRows).filter((line) =>
      line.startsWith('# ')
    )
    expect(headers.filter((line) => /dockhand group/i.test(line))).toHaveLength(1)
  })

  it('merges nested twins by their name path, not their host-local parent ids', () => {
    const parentA = group('infra-a', { name: 'infra', executionHostId: 'runtime:a' })
    const parentB = group('infra-b', { name: 'infra', executionHostId: 'runtime:b', createdAt: 9 })
    const childA = group('child-a', {
      name: 'dockhand group',
      parentGroupId: 'infra-a',
      executionHostId: 'runtime:a'
    })
    const childB = group('child-b', {
      name: 'dockhand group',
      parentGroupId: 'infra-b',
      executionHostId: 'runtime:b',
      createdAt: 9
    })
    const repos = [
      repo('dockhand', { executionHostId: 'runtime:a', projectGroupId: 'child-a' }),
      repo('saadiqhorton', { executionHostId: 'runtime:b', projectGroupId: 'child-b' })
    ]
    const headers = outline(build(repos, [parentA, parentB, childA, childB]).sectionRows).filter(
      (line) => line.startsWith('# ')
    )
    expect(headers).toEqual([
      '# infra@0',
      '# dockhand group@1',
      expect.stringMatching(/^# (dockhand|saadiqhorton)@2$/),
      expect.stringMatching(/^# (dockhand|saadiqhorton)@2$/)
    ])
  })

  it('does not merge different names or same names under different parents', () => {
    const other = group('other-b', { name: 'dockhand', executionHostId: 'runtime:b' })
    const repos = [
      repo('dockhand', { executionHostId: 'runtime:a', projectGroupId: 'dock-a' }),
      repo('saadiqhorton', { executionHostId: 'runtime:b', projectGroupId: 'other-b' })
    ]
    const headers = outline(build(repos, [dockhandA, other]).sectionRows).filter(
      (line) => line.startsWith('# ') && line.endsWith('@0')
    )
    expect(headers).toEqual(expect.arrayContaining(['# dockhand group@0', '# dockhand@0']))
  })

  it('does not merge a nested group with a same-named root group on another host', () => {
    const parentA = group('infra-a', { name: 'infra', executionHostId: 'runtime:a' })
    const nestedA = group('child-a', {
      name: 'dockhand group',
      parentGroupId: 'infra-a',
      executionHostId: 'runtime:a'
    })
    const rootB = group('dock-b', { name: 'dockhand group', executionHostId: 'runtime:b' })
    const repos = [
      repo('dockhand', { executionHostId: 'runtime:a', projectGroupId: 'child-a' }),
      repo('saadiqhorton', { executionHostId: 'runtime:b', projectGroupId: 'dock-b' })
    ]
    const headers = outline(build(repos, [parentA, nestedA, rootB]).sectionRows).filter((line) =>
      line.startsWith('# ')
    )
    expect(headers.filter((line) => line.startsWith('# dockhand group'))).toEqual([
      '# dockhand group@0',
      '# dockhand group@1'
    ])
    expect(headers).toContain('# infra@0')
    expect(headers).toContain('# saadiqhorton@1')
  })

  it('collapses every twin under the merged header key', () => {
    const repos = [
      repo('dockhand', { executionHostId: 'runtime:a', projectGroupId: 'dock-a' }),
      repo('saadiqhorton', { executionHostId: 'runtime:b', projectGroupId: 'dock-b' })
    ]
    const paths = getProjectGroupOccurrencePaths([dockhandA, dockhandB])
    expect(paths.get('dock-b')?.key).toBe(paths.get('dock-a')?.key)
    const collapsed = build(
      repos,
      [dockhandA, dockhandB],
      view({ collapsedGroups: new Set([paths.get('dock-a')!.key]) })
    )
    expect(outline(collapsed.sectionRows).filter((line) => line.startsWith('# '))).toEqual([
      '# dockhand group@0'
    ])
  })
})

// break-ui pass: realistic worst cases for merged groups.
describe('merged project groups under worst-case data', () => {
  const headersOf = (repos: Repo[], groups: ProjectGroup[], settings = view()) =>
    outline(build(repos, groups, settings).sectionRows).filter((line) => line.startsWith('# '))

  it('merges long, accented, emoji, quoted and differently-cased names', () => {
    const longName = 'Aleksandra Wiśniewska-Kowalczyk’s infrastructure & homelab 🚢 (prod)'
    const repos = [
      repo('a', { executionHostId: 'runtime:a', projectGroupId: 'g-a' }),
      repo('b', { executionHostId: 'runtime:b', projectGroupId: 'g-b' })
    ]
    const headers = headersOf(repos, [
      group('g-a', { name: longName, executionHostId: 'runtime:a' }),
      group('g-b', {
        name: `  "${longName.toUpperCase()}"  `,
        executionHostId: 'runtime:b',
        createdAt: 2
      })
    ])
    expect(headers.filter((line) => line.endsWith('@0'))).toEqual([`# ${longName}@0`])
  })

  it('keeps two same-named groups on ONE machine apart', () => {
    const repos = [
      repo('a', { executionHostId: 'runtime:a', projectGroupId: 'g-1' }),
      repo('b', { executionHostId: 'runtime:a', projectGroupId: 'g-2' })
    ]
    const headers = headersOf(repos, [
      group('g-1', { name: 'Untitled group', executionHostId: 'runtime:a' }),
      group('g-2', { name: 'Untitled group', executionHostId: 'runtime:a', createdAt: 2 })
    ])
    expect(headers.filter((line) => line === '# Untitled group@0')).toHaveLength(2)
  })

  it('merges a group spread over many machines into one header with every project', () => {
    const hosts = ['runtime:a', 'runtime:b', 'runtime:c'] as const
    const groups = hosts.map((hostId, index) =>
      group(`g-${index}`, { name: 'dockhand group', executionHostId: hostId, createdAt: index })
    )
    const repos = hosts.map((hostId, index) =>
      repo(`p${index}`, { executionHostId: hostId, projectGroupId: `g-${index}` })
    )
    const built = build(repos, groups)
    const groupHeader = built.sectionRows.find(
      (row) => row.type === 'header' && row.projectGroup && !row.repo
    )
    expect(groupHeader && 'count' in groupHeader ? groupHeader.count : null).toBe(3)
    expect(headersOf(repos, groups)).toEqual([
      '# dockhand group@0',
      expect.stringMatching(/@1$/),
      expect.stringMatching(/@1$/),
      expect.stringMatching(/@1$/)
    ])
  })

  it('shows an all-empty merged group once with a zero count', () => {
    const groups = [
      group('g-a', { name: 'Empty', executionHostId: 'runtime:a' }),
      group('g-b', { name: 'empty', executionHostId: 'runtime:b', createdAt: 2 })
    ]
    const built = build([repo('x', { executionHostId: 'runtime:a' })], groups)
    const empties = built.sectionRows.filter(
      (row) => row.type === 'header' && row.projectGroup && !row.repo
    )
    expect(empties).toHaveLength(1)
    expect(empties[0] && 'count' in empties[0] ? empties[0].count : null).toBe(0)
  })

  it('survives a corrupt parent cycle without hanging', () => {
    const groups = [
      group('loop-a', { name: 'a', parentGroupId: 'loop-b', executionHostId: 'runtime:a' }),
      group('loop-b', { name: 'b', parentGroupId: 'loop-a', executionHostId: 'runtime:a' })
    ]
    const repos = [repo('x', { executionHostId: 'runtime:a', projectGroupId: 'loop-a' })]
    expect(() => build(repos, groups)).not.toThrow()
    expect(() => getProjectGroupOccurrencePaths(groups)).not.toThrow()
  })

  it('lines up deep nested twins level by level', () => {
    const names = ['work', 'clients', 'acme', 'infra', 'dockhand group']
    const chain = (hostId: (typeof HOSTS)[number], suffix: string, createdAt: number) =>
      names.map((name, depth) =>
        group(`${suffix}-${depth}`, {
          name,
          parentGroupId: depth === 0 ? null : `${suffix}-${depth - 1}`,
          executionHostId: hostId,
          createdAt
        })
      )
    const groups = [...chain('runtime:a', 'a', 1), ...chain('runtime:b', 'b', 2)]
    const repos = [
      repo('dockhand', { executionHostId: 'runtime:a', projectGroupId: 'a-4' }),
      repo('saadiqhorton', { executionHostId: 'runtime:b', projectGroupId: 'b-4' })
    ]
    const headers = headersOf(repos, groups)
    expect(headers.slice(0, 5)).toEqual(names.map((name, depth) => `# ${name}@${depth}`))
    expect(headers.slice(5).sort()).toEqual(['# dockhand@5', '# saadiqhorton@5'])
  })
})
