import type { AgentLaunchResult } from '../../../../../shared/agent-launch/contracts/agent-launch-intent'
import type {
  AgentLaunchParams,
  AgentLaunchRequestParams
} from '../../../../../shared/rpc-contract/agent-launch/agent-launch-params'
import type { RpcContext } from '../../core'
import {
  parseGroupWorktreeSelector,
  parseSameGroupWorktreeSelector
} from '../../../../../shared/orchestration/orchestration-group-selector'
import {
  resolveOrchestrationSessionPlacement,
  type OrchestrationSessionPlacement
} from '../orchestration/surface/orchestration-session-placement'
import { assertAgentLaunchTargetAuthorized } from './agent-launch-target-authorization'

export type PlacedAgentLaunch<T> = Omit<T, 'target'> & {
  target: AgentLaunchParams['target']
  sessionPlacement?: OrchestrationSessionPlacement
}

export function withSessionPlacement(
  result: AgentLaunchResult,
  sessionPlacement: OrchestrationSessionPlacement | undefined
): AgentLaunchResult {
  return sessionPlacement
    ? {
        ...result,
        sessionPlacement: {
          source: sessionPlacement.source,
          ...(sessionPlacement.group ? { group: sessionPlacement.group } : {})
        }
      }
    : result
}

/** Resolves group:/same-group:/orchestration-session targets to a visible workspace before admission. */
export async function placeAuthorizedAgentLaunch<
  T extends { target: AgentLaunchRequestParams['target'] }
>(requested: T, context: RpcContext): Promise<PlacedAgentLaunch<T>> {
  const target = requested.target
  if (target.kind === 'existing') {
    if (
      parseGroupWorktreeSelector(target.worktree) ||
      parseSameGroupWorktreeSelector(target.worktree)
    ) {
      const placed = await resolveOrchestrationSessionPlacement(context.runtime, undefined, {
        worktree: target.worktree
      })
      const resolved = { kind: 'existing' as const, worktree: placed.worktree }
      assertAgentLaunchTargetAuthorized(resolved, context)
      return { ...requested, target: resolved, sessionPlacement: placed }
    }
    assertAgentLaunchTargetAuthorized(target, context)
    return { ...requested, target }
  }
  if (target.kind !== 'orchestration-session') {
    assertAgentLaunchTargetAuthorized(target, context)
    return { ...requested, target }
  }
  const placed = await resolveOrchestrationSessionPlacement(context.runtime)
  const resolved = { kind: 'existing' as const, worktree: placed.worktree }
  assertAgentLaunchTargetAuthorized(resolved, context)
  return { ...requested, target: resolved, sessionPlacement: placed }
}
