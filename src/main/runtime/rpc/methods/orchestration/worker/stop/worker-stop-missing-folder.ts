export function isFolderWorkspaceNotFound(error: string): boolean {
  return error.includes('folder_workspace_not_found')
}

/** Capability already revoked and the PTY/tab is gone: stop is done, not unknown. */
export function shouldSettleMissingWorkerStop(args: {
  error: string
  capabilityRevoked: boolean
  terminalGone: boolean
}): boolean {
  if (args.capabilityRevoked && args.terminalGone) {
    return true
  }
  return isFolderWorkspaceNotFound(args.error) && args.terminalGone
}
