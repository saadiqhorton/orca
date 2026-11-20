import { waitForWorkerAgentReady } from '../../terminal/wait/launched-agent-composer-readiness'
import { describeTerminalWaitBlockedReason } from '../../../../shared/terminal/runtime-policy/terminal-wait-blocked-reason-legacy-alias'
import { isStartupDialogBlockedReason } from '../../../../shared/agent-launch/startup/agent-launch-blocked-prompt'
import {
  throwIfWorkerFirstTurnFailed,
  throwIfWorkerStartBlockedOnPrompt
} from '../../rpc/methods/orchestration/worker/start/worker-start-blocked-prompt'
import { persistFederatedSetupWaitOutcome } from './federation-setup'
import { prepareFederatedAttachmentAuthority } from './federation-attachment-authority'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { OrchestrationDb } from '../db/orchestration-db'
import type { FederationEffect } from './federation-effects'
import type { WorkerSetupReceipt } from '../../rpc/methods/orchestration/worker/start/placement/worker-placement-topology'

export async function completeFederatedAgentReadiness(args: {
  runtime: OrcaRuntimeService
  db: OrchestrationDb
  dispatchId: string
  terminalHandle: string
  worktreeId: string
  setup: WorkerSetupReceipt
  effects: FederationEffect[]
  reusesTerminal: boolean
  readinessTimeoutMs: number
  agent: Parameters<typeof waitForWorkerAgentReady>[2]['agent']
  creation: Parameters<typeof waitForWorkerAgentReady>[2]['creation']
  onSetupWaitFailed: () => void
}): Promise<void> {
  const wait = await waitForWorkerAgentReady(args.runtime, args.terminalHandle, {
    agent: args.agent,
    reusesTerminal: args.reusesTerminal,
    creation: args.creation,
    timeoutMs: args.readinessTimeoutMs
  })
  persistFederatedSetupWaitOutcome({ ...args, wait })
  if (wait.satisfied) {
    await throwIfWorkerFirstTurnFailed(args.runtime, args.terminalHandle)
    return
  }
  if (args.setup.state === 'failed') {
    args.onSetupWaitFailed()
  }
  if (isStartupDialogBlockedReason(wait.blockedReason) && args.setup.state !== 'failed') {
    prepareFederatedAttachmentAuthority(args)
    args.db.markRemoteAttachmentBlockedOnPrompt(args.dispatchId, wait.blockedReason)
  }
  throwIfWorkerStartBlockedOnPrompt(wait.blockedReason, args.terminalHandle)
  throw new Error(
    wait.blockedReason
      ? `Agent startup blocked: ${describeTerminalWaitBlockedReason(wait.blockedReason)}`
      : `Agent did not become ready (${wait.status}).`
  )
}
