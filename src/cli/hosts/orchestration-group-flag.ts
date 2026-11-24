import { getOptionalStringFlag } from '../arguments/flags'
import { RuntimeClientError } from '../runtime/connection/types'
import {
  formatGroupWorktreeSelector,
  parseGroupWorktreeSelector
} from '../../shared/orchestration/orchestration-group-selector'

/** `--group` is `--worktree group:<name>`. Named group and --worktree cannot both be set. */
export function applyGroupWorktreeFlag(flags: Map<string, string | boolean>): string | undefined {
  const group = getOptionalStringFlag(flags, 'group')
  const worktree = getOptionalStringFlag(flags, 'worktree')
  const fromWorktree = worktree ? parseGroupWorktreeSelector(worktree) : undefined
  if (group && worktree && !fromWorktree) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use either --group or --worktree, not both. --group is --worktree group:"<name>".'
    )
  }
  const name = group ?? fromWorktree
  if (!name) {
    return undefined
  }
  flags.set('worktree', formatGroupWorktreeSelector(name))
  flags.delete('group')
  return name
}
