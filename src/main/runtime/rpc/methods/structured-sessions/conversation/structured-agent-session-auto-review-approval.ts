import type { AgentSessionAutoReviewApprovalResult } from '../../../../../../shared/agent-session/agent-session-auto-review-approval'
import { AutoReviewApprovalParams } from '../../../../../../shared/rpc-contract/structured-agent-session/structured-agent-session-auto-review-params'
import { isAgentRpcCaller } from '../../../callers/rpc-caller-identity'
import { defineMethod } from '../../../core'
import { requireInstalledStructuredHost } from '../creation/structured-agent-session-gate'

export const STRUCTURED_AGENT_SESSION_AUTO_REVIEW_METHODS = [
  defineMethod({
    name: 'agentSession.approveAutoReviewDenial',
    permission: 'workspace',
    params: AutoReviewApprovalParams,
    // Only a person may approve: an agent's or plugin's call would let the agent authorize itself.
    handler: async ({ sessionId, itemId }, ctx): Promise<AgentSessionAutoReviewApprovalResult> => {
      if (isAgentRpcCaller(ctx.caller) || ctx.plugin || !ctx.caller) {
        return { status: 'refused' }
      }
      const host = await requireInstalledStructuredHost(ctx, sessionId)
      return host.approveAutoReviewDenial(sessionId, itemId)
    }
  })
]
