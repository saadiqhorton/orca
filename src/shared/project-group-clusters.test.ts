import { describe, expect, it } from 'vitest'
import { buildProjectGroupClusters } from './project-group-clusters'
import type { ProjectGroup } from './project-group-types'

function group(
  id: string,
  name: string,
  parentGroupId: string | null,
  executionHostId: string,
  createdAt = 1
): ProjectGroup {
  return {
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
  }
}

describe('buildProjectGroupClusters', () => {
  it('merges same-named root groups from different hosts into one canonical header', () => {
    const { canonicalGroups, canonicalById, memberIdsByCanonicalId } = buildProjectGroupClusters([
      group('dock-a', 'dockhand group', null, 'runtime:a', 1),
      group('dock-b', 'Dockhand Group ', null, 'runtime:b', 9)
    ])
    expect(canonicalGroups).toHaveLength(1)
    expect(canonicalGroups[0]?.id).toBe('dock-a')
    expect(canonicalById.get('dock-a')?.id).toBe(canonicalById.get('dock-b')?.id)
    expect(memberIdsByCanonicalId.get('dock-a')).toEqual(['dock-a', 'dock-b'])
  })

  it('twins nested groups by name path even when parent ids differ', () => {
    const { canonicalById } = buildProjectGroupClusters([
      group('infra-a', 'infra', null, 'runtime:a', 1),
      group('child-a', 'dockhand group', 'infra-a', 'runtime:a', 1),
      group('infra-b', 'infra', null, 'runtime:b', 9),
      group('child-b', 'dockhand group', 'infra-b', 'runtime:b', 9)
    ])
    expect(canonicalById.get('child-a')?.id).toBe(canonicalById.get('child-b')?.id)
    expect(canonicalById.get('child-a')?.id).not.toBe(canonicalById.get('infra-b')?.id)
  })

  it('does not twin a nested group with a same-named root group on another host', () => {
    const { canonicalById } = buildProjectGroupClusters([
      group('infra-a', 'infra', null, 'runtime:a'),
      group('child-a', 'dockhand group', 'infra-a', 'runtime:a'),
      group('dock-b', 'dockhand group', null, 'runtime:b')
    ])
    expect(canonicalById.get('child-a')?.id).not.toBe(canonicalById.get('dock-b')?.id)
  })
})
