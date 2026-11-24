import {
  AGENT_LAUNCH_TAB_CLOSED_CODE,
  AgentLaunchTabClosedError
} from '../../../../../shared/agent-launch/contracts/agent-launch-tab-closed'
import {
  WorktreeCreateCollisionError,
  WORKTREE_CREATE_COLLISION_CODE
} from '../../../../../shared/new-workspace/worktree-create-collision'
import { agentTurnFailedBlockedReason } from '../../../../../shared/orchestration/agent-launch-first-turn'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import type { RpcContext } from '../../core'
import { readsAgentLaunchTabClosed, type AgentLaunchRefusal } from './agent-launch-replay'
import type { EarlyAgentLaunchTab } from './agent-launch-tab-publication'
import { agentLaunchFailureCode } from './agent-launch-failure-code'

export class AgentLaunchExecutionError extends Error {
  constructor(
    cause: unknown,
    /** Decided by the executing launch: a recorded code proves no effects; later readers cannot re-derive that proof. */
    readonly failureCode: string | null
  ) {
    super('agent_session_operation_unknown', { cause })
  }

  get failedWithoutEffects(): boolean {
    return this.failureCode !== null
  }
}

/** A replayed refusal, in the words it was refused with when its record kept them. */
export function agentLaunchRefusalError(refusal: AgentLaunchRefusal): Error {
  return Object.assign(new Error(refusal.said ?? refusal.code), { code: refusal.code })
}

export function settleQuietly(settlement: Promise<void>): Promise<void> {
  return settlement.catch((error: unknown) => {
    console.warn('[agent-launch] the launch settled, its operation row did not', error)
  })
}

/** Flip a settled success to failed so later status/replay match a late first-turn 400. */
export function failSettledAgentLaunchOnFirstTurn(
  fail: (code: string, cause?: unknown) => Promise<void>,
  reason: string
): void {
  void settleQuietly(
    fail(
      'agent_blocked_on_prompt',
      new OrchestrationError(
        'agent_blocked_on_prompt',
        `The agent failed on its first turn (${reason}). This launch is not success; the tab may still be open.`,
        { blockedReason: agentTurnFailedBlockedReason(reason) }
      )
    )
  )
}

/** Tell an early pane whether launch failed definitively or its start remains unconfirmed. */
export async function withEarlyTab<T>(
  early: EarlyAgentLaunchTab | null,
  run: () => Promise<T>
): Promise<T> {
  try {
    const result = await run()
    early?.finish()
    return result
  } catch (error) {
    early?.finish(
      error instanceof AgentLaunchExecutionError ? error.failureCode : agentLaunchFailureCode(error)
    )
    throw error
  }
}

/** Use the definite tab-closed answer only for callers that understand it; older callers retain uncertainty. */
export function agentLaunchTabClosedAnswer(context: RpcContext): Error {
  return readsAgentLaunchTabClosed(context)
    ? Object.assign(new Error(AGENT_LAUNCH_TAB_CLOSED_CODE), { code: AGENT_LAUNCH_TAB_CLOSED_CODE })
    : new Error('agent_session_operation_unknown')
}

export function rethrowRecordedAgentLaunchError(error: unknown, context: RpcContext): never {
  if (error instanceof AgentLaunchExecutionError) {
    if (error.cause instanceof WorktreeCreateCollisionError) {
      throw Object.assign(new Error(error.cause.message, { cause: error.cause }), {
        code: WORKTREE_CREATE_COLLISION_CODE
      })
    }
    if (error.cause instanceof AgentLaunchTabClosedError) {
      throw agentLaunchTabClosedAnswer(context)
    }
    if (error.failedWithoutEffects) {
      throw error.cause
    }
    throw new Error('agent_session_operation_unknown', { cause: error.cause })
  }
  throw error
}

export function rethrowOptionalIdentityLaunchError(error: unknown, context: RpcContext): never {
  if (error instanceof AgentLaunchExecutionError) {
    throw error.cause instanceof AgentLaunchTabClosedError
      ? agentLaunchTabClosedAnswer(context)
      : error.cause
  }
  throw error
}

/** Stop any spawned agent and record tab-closed for this launch and every retry; throws the caller-compatible answer. */
export async function settleLaunchWhoseTabWasClosed(
  context: RpcContext,
  early: EarlyAgentLaunchTab,
  admission: { fail: (code: string) => Promise<void> }
): Promise<never> {
  const handle = context.runtime.getTerminalHandleForPaneKey(early.paneKey)
  if (handle) {
    await context.runtime.closeTerminal(handle).catch(() => {})
  }
  await settleQuietly(admission.fail(AGENT_LAUNCH_TAB_CLOSED_CODE))
  throw new AgentLaunchExecutionError(new AgentLaunchTabClosedError(), AGENT_LAUNCH_TAB_CLOSED_CODE)
}
