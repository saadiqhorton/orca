import type {
  AgentLaunchParams,
  AgentLaunchRequestParams
} from '../../../../../shared/rpc-contract/agent-launch/agent-launch-params'
import type { RpcContext } from '../../core'
import { resolveOrchestrationSessionPlacement } from '../orchestration/surface/orchestration-session-placement'
import { assertAgentLaunchTargetAuthorized } from './agent-launch-target-authorization'

/** Resolves an orchestration-session target to the host's own workspace before admission, then authorizes it. */
export async function placeAuthorizedAgentLaunch<
  T extends { target: AgentLaunchRequestParams['target'] }
>(
  requested: T,
  context: RpcContext
): Promise<Omit<T, 'target'> & { target: AgentLaunchParams['target'] }> {
  const target = requested.target
  if (target.kind !== 'orchestration-session') {
    assertAgentLaunchTargetAuthorized(target, context)
    return { ...requested, target }
  }
  const placed = await resolveOrchestrationSessionPlacement(context.runtime)
  const resolved = { kind: 'existing' as const, worktree: placed.worktree }
  assertAgentLaunchTargetAuthorized(resolved, context)
  return { ...requested, target: resolved }
}
