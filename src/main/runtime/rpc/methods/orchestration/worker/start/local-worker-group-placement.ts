import type { z } from 'zod'
import type { OrcaRuntimeService } from '../../../../../orca-runtime'
import type { WorkerStartParams } from '../../../../../../../shared/rpc-contract/orchestration/orchestration-worker-start-params'
import { resolveOrchestrationSessionPlacement } from '../../surface/orchestration-session-placement'
import {
  parseGroupWorktreeSelector,
  parseSameGroupWorktreeSelector
} from '../../../../../../../shared/orchestration/orchestration-group-selector'

/** Federated starts (`params.on`) leave group:/same-group: for the target host to resolve. */
export async function resolveLocalWorkerGroupPlacement(
  runtime: OrcaRuntimeService,
  params: z.infer<typeof WorkerStartParams>
): Promise<z.infer<typeof WorkerStartParams>> {
  const placement = params.worktree ?? 'current'
  if (
    params.on ||
    !(parseGroupWorktreeSelector(placement) || parseSameGroupWorktreeSelector(placement))
  ) {
    return params
  }
  const placed = await resolveOrchestrationSessionPlacement(runtime, undefined, {
    worktree: placement
  })
  return { ...params, worktree: placed.worktree }
}
