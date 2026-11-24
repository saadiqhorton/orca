import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import {
  installOrcaHostInstructions,
  settingsWriteGlobalSlice,
  type GlobalInstructionSettingsSource
} from '../../../../orchestration/desktop-hub/orca-host-instruction-install'
import {
  orchestrationScratchPaths,
  orchestrationScratchWorktreeSelector
} from '../../../../../../shared/orchestration/orchestration-scratch-workspace'

type ScratchGroup = { id: string; name: string }
type ScratchFolder = { id: string; name: string; folderPath: string; projectGroupId: string }

export type OrchestrationScratchRuntime = GlobalInstructionSettingsSource & {
  listVisibleProjectGroups: () => ScratchGroup[]
  listVisibleFolderWorkspaces: () => ScratchFolder[]
  /** Full store, including rows desktop listings hide; reuse ~/orca-orchestration by path. */
  listProjectGroups?: () => ScratchGroup[]
  listFolderWorkspaces?: () => ScratchFolder[]
  createProjectGroup: (input: {
    name: string
    parentPath?: string | null
    createdFrom?: 'manual'
  }) => Promise<ScratchGroup>
  createFolderWorkspace: (input: {
    projectGroupId: string
    name?: string
    folderPath?: string | null
    skipPrimaryTerminal?: boolean
  }) => Promise<{ folderWorkspace: ScratchFolder }>
}

export type OrchestrationScratchResult = {
  path: string
  worktree: string
  projectGroupId: string
  folderWorkspaceId: string
  created: boolean
  groupName: string
  workspaceName: string
}

export async function ensureOrchestrationScratchWorkspace(
  runtime: OrchestrationScratchRuntime,
  params: { name?: string } | void,
  home = homedir()
): Promise<OrchestrationScratchResult> {
  let paths
  try {
    paths = orchestrationScratchPaths(home, params?.name)
  } catch (error) {
    throw new OrchestrationError(
      'invalid_argument',
      error instanceof Error ? error.message : String(error)
    )
  }
  await mkdir(paths.workspacePath, { recursive: true })
  try {
    await installOrcaHostInstructions({
      extraDirs: [paths.workspacePath],
      home,
      settings: settingsWriteGlobalSlice(runtime)
    })
  } catch {
    // Instruction files are best-effort; the scratch folder must still be created.
  }
  const groups = listedGroups(runtime)
  let group = groups.find((candidate) => candidate.name === paths.groupName)
  if (!group) {
    group = await runtime.createProjectGroup({
      name: paths.groupName,
      parentPath: home,
      createdFrom: 'manual'
    })
  }
  const existing = listedFolders(runtime).find(
    (folder) => folder.folderPath === paths.workspacePath
  )
  if (existing) {
    return {
      path: existing.folderPath,
      worktree: orchestrationScratchWorktreeSelector(existing.id),
      projectGroupId: existing.projectGroupId,
      folderWorkspaceId: existing.id,
      created: false,
      groupName: paths.groupName,
      workspaceName: existing.name
    }
  }
  const { folderWorkspace } = await runtime.createFolderWorkspace({
    projectGroupId: group.id,
    name: paths.workspaceName,
    folderPath: paths.workspacePath,
    skipPrimaryTerminal: true
  })
  return {
    path: folderWorkspace.folderPath,
    worktree: orchestrationScratchWorktreeSelector(folderWorkspace.id),
    projectGroupId: folderWorkspace.projectGroupId,
    folderWorkspaceId: folderWorkspace.id,
    created: true,
    groupName: paths.groupName,
    workspaceName: folderWorkspace.name
  }
}

function listedGroups(runtime: OrchestrationScratchRuntime): ScratchGroup[] {
  return uniqueById([
    ...(runtime.listProjectGroups?.() ?? []),
    ...runtime.listVisibleProjectGroups()
  ])
}

function listedFolders(runtime: OrchestrationScratchRuntime): ScratchFolder[] {
  return uniqueById([
    ...(runtime.listFolderWorkspaces?.() ?? []),
    ...runtime.listVisibleFolderWorkspaces()
  ])
}

function uniqueById<T extends { id: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const row of rows) {
    if (seen.has(row.id)) {
      continue
    }
    seen.add(row.id)
    unique.push(row)
  }
  return unique
}
