import { isDesktopHubSelector } from './desktop-hub-contract'

/** After hub routing rewrites `--host` to `on`, errors must still name the flag the caller used. */
export function remotePlacementFlag(params: { host?: string; on?: string }): '--host' | '--on' {
  if (params.host || (params.on !== undefined && isDesktopHubSelector(params.on))) {
    return '--host'
  }
  return '--on'
}

export function remoteWorktreeRequiredMessage(
  params: { host?: string; on?: string },
  extra = ''
): string {
  const flag = remotePlacementFlag(params)
  const worktree =
    flag === '--host'
      ? `${flag} requires --worktree path:<existing Orca project folder on that host>, new-child, or new-top-level.`
      : `${flag} requires an exact remote worktree selector, new-child or new-top-level.`
  return extra ? `${worktree} ${extra}` : worktree
}
