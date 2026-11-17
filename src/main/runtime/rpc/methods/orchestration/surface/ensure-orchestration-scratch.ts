import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import { rememberedOrcaHostNames } from '../../../../orchestration/desktop-hub/orca-host-name-cache'
import {
  installOrcaHostInstructions,
  settingsWriteGlobalSlice
} from '../../../../orchestration/desktop-hub/orca-host-instruction-install'
import {
  orchestrationScratchPaths,
  orchestrationScratchWorktreeSelector
} from '../../../../../../shared/orchestration/orchestration-scratch-workspace'

type ScratchGroup = { id: string; name: string }
type ScratchFolder = { id: string; name: string; folderPath: string; projectGroupId: string }

export type OrchestrationScratchRuntime = {
  listVisibleProjectGroups: () => ScratchGroup[]
  listVisibleFolderWorkspaces: () => ScratchFolder[]
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
      hosts: rememberedOrcaHostNames(),
      extraDirs: [paths.workspacePath],
      home,
      settings: settingsWriteGlobalSlice(runtime)
    })
  } catch {
    // Instruction files are best-effort; the scratch folder must still be created.
  }
  const groups = runtime.listVisibleProjectGroups()
  let group = groups.find((candidate) => candidate.name === paths.groupName)
  if (!group) {
    group = await runtime.createProjectGroup({
      name: paths.groupName,
      parentPath: home,
      createdFrom: 'manual'
    })
  }
  const folders = runtime.listVisibleFolderWorkspaces()
  const existing = folders.find((folder) => folder.folderPath === paths.workspacePath)
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
