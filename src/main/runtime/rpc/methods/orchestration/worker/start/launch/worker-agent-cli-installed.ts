import type { OrcaRuntimeService } from '../../../../../../orca-runtime'
import { OrchestrationError } from '../../../../../../orchestration/orchestration-error'
import { detectAgentsOnHost } from '../../../../../../../preflight/workspace-agent-detection'
import { agentCommandOverrideDetectionOptions } from '../../../../../../../preflight/installed-agent-detection'
import type { TuiAgent } from '../../../../../../../../shared/agent-launch/catalog/tui-agent'

/** Refuse a start when this host has other agent CLIs installed but not the requested one. */
export function refuseUnlessAgentDetected(agent: string, installed: readonly string[]): void {
  if (installed.length === 0 || installed.includes(agent)) {
    return
  }
  throw new OrchestrationError(
    'agent_unconfigured',
    `Agent CLI "${agent}" is not installed on this host. Available agents: ${installed.join(', ')}.`
  )
}

export async function assertAgentCliInstalled(
  runtime: OrcaRuntimeService,
  agent: TuiAgent,
  worktreeId?: string | null
): Promise<void> {
  if (typeof runtime.resolveAgentDetectionHost !== 'function') {
    return
  }
  let installed: string[]
  try {
    const host = await runtime.resolveAgentDetectionHost(worktreeId, undefined)
    const overrides = runtime.requireStore?.().getSettings?.().agentCmdOverrides
    installed = await detectAgentsOnHost(
      host,
      agentCommandOverrideDetectionOptions(overrides ?? null)
    )
  } catch {
    return
  }
  refuseUnlessAgentDetected(agent, installed)
}

/** Ask the target host which CLIs it detected, before attach creates a terminal. */
export async function assertRemoteHostHasAgent(args: {
  runtime: Pick<OrcaRuntimeService, 'callOrchestrationWorkerServer'>
  environmentId: string
  agent?: string | null
  timeoutMs: number
  pairingFence?: Parameters<OrcaRuntimeService['callOrchestrationWorkerServer']>[5]
}): Promise<void> {
  if (!args.agent) {
    return
  }
  let installed: string[]
  try {
    const inventory: unknown = await args.runtime.callOrchestrationWorkerServer(
      args.environmentId,
      'orchestration.surface.inventory',
      {},
      args.timeoutMs,
      undefined,
      args.pairingFence
    )
    const agents =
      typeof inventory === 'object' && inventory !== null && 'agents' in inventory
        ? inventory.agents
        : undefined
    installed = Array.isArray(agents)
      ? agents.filter((name): name is string => typeof name === 'string')
      : []
  } catch (error) {
    if (error instanceof OrchestrationError && error.code === 'agent_unconfigured') {
      throw error
    }
    return
  }
  refuseUnlessAgentDetected(args.agent, installed)
}
