import { OrchestrationError } from '../orchestration-error'
import { remoteWorktreeRequiredMessage } from '../../../../shared/orchestration/desktop-hub-placement-flag'
import {
  describeGroupMemberCandidates,
  parseGroupWorktreeSelector,
  parseSameGroupWorktreeSelector,
  resolveUniqueGroupMember,
  type InventoryProjectGroup
} from '../../../../shared/orchestration/orchestration-group-selector'
import type { FederatedWorkerStartRequest } from './federated-worker-start-request'

type ScratchReceipt = { worktree?: string; path?: string }

/** `--worktree current` on a desktop-connected host becomes ~/orca-orchestration there.
 * group:/same-group: must be resolved on that host, never rewritten to the caller's worktree. */
export async function resolveFederatedWorkerWorktree(
  runtime: FederatedWorkerStartRequest['runtime'],
  environmentId: string,
  params: FederatedWorkerStartRequest['params']
): Promise<string> {
  const worktree = params.worktree ?? 'current'
  if (worktree === 'new-top-level' || worktree === 'new-child') {
    return worktree
  }
  const named = parseGroupWorktreeSelector(worktree)
  const same = parseSameGroupWorktreeSelector(worktree)
  if (!named && !same && worktree !== 'current') {
    return worktree
  }
  if (named || same) {
    const placed = await resolveRemoteGroupWorktree(
      runtime,
      environmentId,
      named ?? same!,
      Boolean(named)
    )
    if (placed) {
      return placed
    }
  }
  return ensureRemoteScratchWorktree(runtime, environmentId, params)
}

async function resolveRemoteGroupWorktree(
  runtime: FederatedWorkerStartRequest['runtime'],
  environmentId: string,
  name: string,
  named: boolean
): Promise<string | null> {
  const inventory = (await runtime.callOrchestrationWorkerServer(
    environmentId,
    'orchestration.surface.inventory',
    {},
    30_000
  )) as { projects?: InventoryProjectGroup[] }
  const groups = Array.isArray(inventory.projects) ? inventory.projects : []
  const resolved = resolveUniqueGroupMember(groups, name)
  if (resolved.status === 'unique') {
    return resolved.member.selector
  }
  if (named || resolved.status === 'ambiguous') {
    throw new OrchestrationError(
      resolved.status === 'ambiguous' ? 'selector_ambiguous' : 'invalid_argument',
      describeGroupMemberCandidates(name, resolved.members)
    )
  }
  return null
}

async function ensureRemoteScratchWorktree(
  runtime: FederatedWorkerStartRequest['runtime'],
  environmentId: string,
  params: FederatedWorkerStartRequest['params']
): Promise<string> {
  try {
    const scratch = (await runtime.callOrchestrationWorkerServer(
      environmentId,
      'orchestration.surface.ensureScratch',
      {},
      30_000
    )) as ScratchReceipt
    const selector =
      typeof scratch.worktree === 'string' && scratch.worktree.length > 0
        ? scratch.worktree
        : typeof scratch.path === 'string' && scratch.path.length > 0
          ? `path:${scratch.path}`
          : null
    if (selector) {
      return selector
    }
  } catch {
    // Fall through to the explicit --worktree requirement when the host cannot create a scratch project.
  }
  throw new OrchestrationError(
    'invalid_argument',
    remoteWorktreeRequiredMessage(
      params,
      'No Orca project was found on that host, and a scratch project could not be created. Pass --worktree path:<existing Orca project folder> or create one with `orca worktree create --host <name> --name <name>`.'
    )
  )
}
