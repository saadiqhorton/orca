// The person approves one action the agent's automatic review denied, as Codex's own UI offers.

import { readCodexAutoReviewDenialFrame } from '../../../../shared/agent-session/codex-auto-review-denial'
import { AGENT_JOURNAL_THREAD_SCOPE } from '../../../../shared/agent-session/journal/agent-session-journal-types'
import { agentJournalItemKey } from '../../../../shared/agent-session/journal/agent-session-journal-item-key'
import {
  AUTO_REVIEW_APPROVAL_PRESENTATION,
  type AgentSessionAutoReviewApprovalResult
} from '../../../../shared/agent-session/agent-session-auto-review-approval'
import type {
  StructuredAgentSessionHostDeps,
  StructuredAgentSessionHostSession
} from '../host/structured-agent-session-host-types'

export async function approveStructuredAutoReviewDenial(
  host: {
    deps: Pick<StructuredAgentSessionHostDeps, 'store' | 'agents'>
    conversation: (sessionId: string) => Promise<StructuredAgentSessionHostSession>
  },
  sessionId: string,
  itemId: string
): Promise<AgentSessionAutoReviewApprovalResult> {
  const saved = host.deps.store.getRecord(sessionId)
  const approve = saved && host.deps.agents.registration(saved.provider)?.adapter.approveAutoReviewDenial
  if (!saved || !approve) {
    return { status: 'unsupported' }
  }
  const { journal } = await host.conversation(sessionId)
  const body = await journal.reads.itemBody(itemId)
  const denial = body?.kind === 'status' ? readCodexAutoReviewDenialFrame(body.providerFrame) : null
  if (!denial?.event) {
    return { status: 'unsupported' }
  }
  const identity = { provider: 'orca' as const, clientMessageId: `auto-review-approval:${itemId}` }
  // One approval per denial, as Codex's own list forgets a denial once it is approved.
  if (await journal.reads.hasRecordedItem(agentJournalItemKey(identity))) {
    return { status: 'approved' }
  }
  if (!(await approve({ sessionId, threadId: denial.threadId, event: denial.event }))) {
    return { status: 'unavailable' }
  }
  await journal.appendItem(
    identity,
    {
      kind: 'status',
      text: `You approved one retry of: ${denial.summary}`,
      presentation: AUTO_REVIEW_APPROVAL_PRESENTATION
    },
    {
      fence: host.deps.store.getConversation(sessionId)?.currentFence ?? 0,
      turnScope: AGENT_JOURNAL_THREAD_SCOPE
    }
  )
  return { status: 'approved' }
}
