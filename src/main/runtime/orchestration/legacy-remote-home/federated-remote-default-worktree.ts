import { OrchestrationError } from '../orchestration-error'
import { remoteWorktreeRequiredMessage } from '../../../../shared/orchestration/desktop-hub-placement-flag'
import type { FederatedWorkerStartRequest } from './federated-worker-start-request'

/** `--worktree current` on a desktop-connected host becomes ~/orca-orchestration there. */
export async function resolveFederatedWorkerWorktree(
  runtime: FederatedWorkerStartRequest['runtime'],
  environmentId: string,
  params: FederatedWorkerStartRequest['params']
): Promise<string> {
  const worktree = params.worktree ?? 'current'
  if (worktree !== 'current') {
    return worktree
  }
  try {
    const scratch = (await runtime.callOrchestrationWorkerServer(
      environmentId,
      'orchestration.surface.ensureScratch',
      {},
      30_000
    )) as { worktree?: string; path?: string }
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
