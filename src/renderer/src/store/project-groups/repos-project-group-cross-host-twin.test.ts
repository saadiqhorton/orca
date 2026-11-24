/**
 * Cross-machine groups: a project joins a group saved on another machine by joining (or creating)
 * a same-named twin on its own machine. The sidebar then draws the twins as one group.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { ProjectGroup } from '../../../../shared/project/groups/project-group-types'
import type { Repo } from '../../../../shared/repository/repo-types'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from '../../runtime/rpc/testing/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCache } from '../../runtime/rpc/compatibility/runtime-compatibility-cache'
import { createTestStore } from '../testing/app-store-test-fixture'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const DOCKHAND: ExecutionHostId = 'runtime:env-dockhand'

function group(id: string, overrides: Partial<ProjectGroup> = {}): ProjectGroup {
  return {
    id,
    name: 'dockhand group',
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

const localProject: Repo = {
  id: 'saadiqhorton',
  path: 'F:/Projects/saadiqhorton',
  displayName: 'saadiqhorton',
  badgeColor: '#111',
  addedAt: 1,
  projectGroupId: null
}

const create = vi.fn()
const update = vi.fn()
const moveProject = vi.fn()
const runtimeCall = vi.fn<(request: RuntimeEnvironmentCallRequest) => Promise<unknown>>()

function rpcCalls(method: string): RuntimeEnvironmentCallRequest[] {
  return runtimeCall.mock.calls.map(([request]) => request).filter((r) => r.method === method)
}

beforeEach(() => {
  clearRuntimeCompatibilityCache()
  vi.mocked(toast.error).mockReset()
  create.mockReset()
  update.mockReset()
  moveProject.mockReset()
  runtimeCall.mockReset()
  let created = 0
  create.mockImplementation(async (args: { name: string; parentGroupId?: string | null }) =>
    group(`local-twin-${++created}`, {
      name: args.name,
      parentGroupId: args.parentGroupId ?? null,
      createdAt: 100 + created
    })
  )
  update.mockImplementation(async ({ groupId, updates }) => group(groupId, updates))
  moveProject.mockImplementation(async ({ groupId }: { groupId: string | null }) => ({
    ...localProject,
    projectGroupId: groupId
  }))
  vi.stubGlobal('window', {
    api: {
      projectGroups: { create, update, moveProject },
      runtimeEnvironments: {
        call: (request: RuntimeEnvironmentCallRequest) =>
          createCompatibleRuntimeStatusResponseIfNeeded(request) ?? runtimeCall(request)
      }
    }
  })
})

describe('dragging a project into a group saved on another machine', () => {
  it('creates a same-named twin on the project’s machine and joins it', async () => {
    const store = createTestStore()
    store.setState({
      repos: [localProject],
      projectGroups: [group('dock-remote', { executionHostId: DOCKHAND })]
    })

    await expect(store.getState().moveProjectToGroup(localProject, 'dock-remote')).resolves.toBe(
      true
    )

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]![0]).toMatchObject({ name: 'dockhand group' })
    expect(moveProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'saadiqhorton', groupId: 'local-twin-1' })
    )
    expect(store.getState().repos[0]!.projectGroupId).toBe('local-twin-1')
    expect(
      store
        .getState()
        .projectGroups.map((g) => g.id)
        .sort()
    ).toEqual(['dock-remote', 'local-twin-1'])
    expect(toast.error).not.toHaveBeenCalled()
    // Never asks the other machine to store a group id it does not know.
    expect(rpcCalls('projectGroup.moveProject')).toEqual([])
  })

  it('reuses an existing same-named twin instead of creating another', async () => {
    const store = createTestStore()
    store.setState({
      repos: [localProject],
      projectGroups: [
        group('dock-remote', { executionHostId: DOCKHAND }),
        group('dock-local', { name: '  Dockhand Group', createdAt: 50 })
      ]
    })

    await expect(store.getState().moveProjectToGroup(localProject, 'dock-remote')).resolves.toBe(
      true
    )

    expect(create).not.toHaveBeenCalled()
    expect(moveProject).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'dock-local' }))
  })

  it('creates nested twins parent-first so the name path lines up', async () => {
    const store = createTestStore()
    store.setState({
      repos: [localProject],
      projectGroups: [
        group('infra-remote', { name: 'infra', executionHostId: DOCKHAND }),
        group('dock-remote', { parentGroupId: 'infra-remote', executionHostId: DOCKHAND })
      ]
    })

    await expect(store.getState().moveProjectToGroup(localProject, 'dock-remote')).resolves.toBe(
      true
    )

    expect(create.mock.calls.map(([args]) => [args.name, args.parentGroupId ?? null])).toEqual([
      ['infra', null],
      ['dockhand group', 'local-twin-1']
    ])
    expect(moveProject).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'local-twin-2' }))
  })

  it('creates the twin on the remote machine when a remote project joins a local group', async () => {
    const remoteProject: Repo = {
      ...localProject,
      id: 'dockhand',
      executionHostId: DOCKHAND
    }
    runtimeCall.mockImplementation(async (request) => {
      if (request.method === 'projectGroup.create') {
        return {
          id: 'c',
          ok: true,
          result: { group: group('remote-twin', { name: 'dockhand group' }) },
          _meta: { runtimeId: 'dockhand' }
        }
      }
      if (request.method === 'projectGroup.update') {
        return {
          id: 'u',
          ok: true,
          result: { group: group('remote-twin', { name: 'dockhand group' }) },
          _meta: { runtimeId: 'dockhand' }
        }
      }
      return {
        id: 'm',
        ok: true,
        result: { repo: { ...remoteProject, projectGroupId: 'remote-twin' } },
        _meta: { runtimeId: 'dockhand' }
      }
    })
    const store = createTestStore()
    store.setState({ repos: [remoteProject], projectGroups: [group('dock-local')] })

    await expect(store.getState().moveProjectToGroup(remoteProject, 'dock-local')).resolves.toBe(
      true
    )

    expect(create).not.toHaveBeenCalled()
    expect(rpcCalls('projectGroup.create').map((r) => r.params)).toEqual([
      { name: 'dockhand group', createdFrom: 'manual' }
    ])
    expect(rpcCalls('projectGroup.moveProject').map((r) => r.params)).toEqual([
      expect.objectContaining({ repo: 'dockhand', groupId: 'remote-twin' })
    ])
  })

  it('reports failure (and moves nothing) when the twin cannot be created', async () => {
    create.mockResolvedValue(null)
    create.mockImplementation(async () => {
      throw new Error('offline')
    })
    const store = createTestStore()
    store.setState({
      repos: [localProject],
      projectGroups: [group('dock-remote', { executionHostId: DOCKHAND })]
    })

    await expect(store.getState().moveProjectToGroup(localProject, 'dock-remote')).resolves.toBe(
      false
    )
    expect(moveProject).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })
})

describe('getProjectGroupTwins (rename/delete of a merged group)', () => {
  it('lists the clicked group first, then its twins on other machines with their owners', async () => {
    const { getProjectGroupTwins } = await import('./project-group-twins')
    const groups = [
      group('dock-remote', { executionHostId: DOCKHAND }),
      group('dock-local', { name: 'Dockhand group', createdAt: 9 }),
      group('unrelated', { name: 'other' })
    ]
    expect(getProjectGroupTwins(groups, 'dock-remote')).toEqual([
      { id: 'dock-remote', hostId: DOCKHAND },
      { id: 'dock-local', hostId: 'local' }
    ])
    expect(getProjectGroupTwins(groups, 'unrelated')).toEqual([
      { id: 'unrelated', hostId: 'local' }
    ])
  })
})
