import path from 'node:path'

/** Sidebar group that holds agent-created scratch folders. Never the user's home. */
export const ORCHESTRATION_SCRATCH_GROUP_NAME = 'Orca orchestration'
export const ORCHESTRATION_SCRATCH_ROOT_DIR = 'orca-orchestration'
export const ORCHESTRATION_SCRATCH_DEFAULT_NAME = 'scratch'

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/

export function sanitizeOrchestrationScratchName(name: string | undefined): string {
  const trimmed = name?.trim() ?? ''
  if (!trimmed) {
    return ORCHESTRATION_SCRATCH_DEFAULT_NAME
  }
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error(
      `Invalid scratch workspace name "${name}". Use letters, digits, ".", "_", or "-".`
    )
  }
  if (!NAME_RE.test(trimmed)) {
    throw new Error(
      `Invalid scratch workspace name "${name}". Use letters, digits, ".", "_", or "-".`
    )
  }
  return trimmed
}

export function orchestrationScratchPaths(
  homedir: string,
  name?: string
): {
  root: string
  workspacePath: string
  groupName: string
  workspaceName: string
} {
  const workspaceName = sanitizeOrchestrationScratchName(name)
  const root = path.join(homedir, ORCHESTRATION_SCRATCH_ROOT_DIR)
  return {
    root,
    workspacePath:
      workspaceName === ORCHESTRATION_SCRATCH_DEFAULT_NAME ? root : path.join(root, workspaceName),
    groupName: ORCHESTRATION_SCRATCH_GROUP_NAME,
    workspaceName
  }
}

/** Worker-start accepts `folder:<id>` for these workspaces; `path:` also matches once folders are in the matcher. */
export function orchestrationScratchWorktreeSelector(folderWorkspaceId: string): string {
  return `folder:${folderWorkspaceId}`
}
