import type { RuntimeClient } from '../runtime/client'
import { formatSameGroupWorktreeSelector } from '../../shared/orchestration/orchestration-group-selector'
import { readCallerProjectGroupName } from './caller-project-group'

/** Remote commands without --worktree follow the caller’s group on the target, then scratch. */
export async function applyCallerSameGroupIfUnset(
  flags: Map<string, string | boolean>,
  client: RuntimeClient,
  cwd: string
): Promise<void> {
  if (flags.has('worktree')) {
    return
  }
  const callerGroup = await readCallerProjectGroupName(client, cwd).catch(() => undefined)
  if (callerGroup) {
    flags.set('worktree', formatSameGroupWorktreeSelector(callerGroup))
  }
}

export async function applyRemoteGroupPlacement(
  flags: Map<string, string | boolean>,
  client: RuntimeClient,
  cwd: string
): Promise<void> {
  if (flags.has('worktree') || !client.isRemote) {
    return
  }
  await applyCallerSameGroupIfUnset(flags, client, cwd)
  if (flags.has('worktree')) {
    return
  }
  const scratch = await client.call<{ worktree: string }>('orchestration.surface.ensureScratch', {})
  flags.set('worktree', scratch.result.worktree)
}
