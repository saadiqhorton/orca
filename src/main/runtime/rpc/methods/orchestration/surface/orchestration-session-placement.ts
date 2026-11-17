import path from 'node:path'
import { homedir } from 'node:os'
import {
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../../../../../shared/execution-host'
import {
  orchestrationScratchPaths,
  orchestrationScratchWorktreeSelector
} from '../../../../../../shared/orchestration/orchestration-scratch-workspace'
import {
  ensureOrchestrationScratchWorkspace,
  type OrchestrationScratchRuntime
} from './ensure-orchestration-scratch'

type PlacementWorktree = {
  id: string
  hostId?: ExecutionHostId
  lastActivityAt?: number
  isArchived?: boolean
}

type PlacementFolderWorkspace = {
  id: string
  name: string
  folderPath: string
  projectGroupId: string
  executionHostId?: ExecutionHostId | null
  lastActivityAt: number
  isArchived: boolean
}

export type OrchestrationSessionPlacementRuntime = Omit<
  OrchestrationScratchRuntime,
  'listVisibleFolderWorkspaces'
> & {
  listVisibleFolderWorkspaces: () => PlacementFolderWorkspace[]
  listManagedWorktrees: (
    repoSelector?: string,
    limit?: number,
    sourceDefaultsSupported?: boolean
  ) => Promise<{ worktrees: PlacementWorktree[] }>
}

export type OrchestrationSessionPlacement = {
  worktree: string
  source: 'recent-worktree' | 'recent-folder' | 'scratch'
}

type Candidate = {
  worktree: string
  lastActivityAt: number
  source: 'recent-worktree' | 'recent-folder'
}

/** Places a session on the host that runs it: its most recently active non-scratch workspace, else scratch. */
export async function resolveOrchestrationSessionPlacement(
  runtime: OrchestrationSessionPlacementRuntime,
  home = homedir()
): Promise<OrchestrationSessionPlacement> {
  const scratchRoot = orchestrationScratchPaths(home).root
  const { worktrees } = await runtime.listManagedWorktrees(undefined, undefined, true)
  const candidates: Candidate[] = [
    ...worktrees
      .filter((worktree) => !worktree.isArchived && isLocalHost(worktree.hostId))
      .map((worktree) => ({
        worktree: `id:${worktree.id}`,
        lastActivityAt: worktree.lastActivityAt ?? 0,
        source: 'recent-worktree' as const
      })),
    ...runtime
      .listVisibleFolderWorkspaces()
      .filter(
        (folder) =>
          !folder.isArchived &&
          isLocalHost(folder.executionHostId ?? undefined) &&
          !isInsideDirectory(folder.folderPath, scratchRoot)
      )
      .map((folder) => ({
        worktree: orchestrationScratchWorktreeSelector(folder.id),
        lastActivityAt: folder.lastActivityAt,
        source: 'recent-folder' as const
      }))
  ]
  // Ties keep the first listed workspace, so an all-untouched host still places deterministically.
  const best = candidates.reduce<Candidate | undefined>(
    (current, candidate) =>
      !current || candidate.lastActivityAt > current.lastActivityAt ? candidate : current,
    undefined
  )
  if (best) {
    return { worktree: best.worktree, source: best.source }
  }
  const scratch = await ensureOrchestrationScratchWorkspace(runtime, {}, home)
  return { worktree: scratch.worktree, source: 'scratch' }
}

function isLocalHost(hostId: ExecutionHostId | null | undefined): boolean {
  return !hostId || hostId === LOCAL_EXECUTION_HOST_ID
}

function isInsideDirectory(candidate: string, directory: string): boolean {
  const relative = path.relative(directory, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
