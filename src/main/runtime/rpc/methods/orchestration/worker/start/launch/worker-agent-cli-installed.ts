import type { OrcaRuntimeService } from '../../../../../../orca-runtime'
import { OrchestrationError } from '../../../../../../orchestration/orchestration-error'
import { detectAgentsOnHost } from '../../../../../../../preflight/workspace-agent-detection'
import { agentCommandOverrideDetectionOptions } from '../../../../../../../preflight/installed-agent-detection'
import type { TuiAgent } from '../../../../../../../../shared/agent-launch/catalog/tui-agent'

/** Refuse a start when this host has other agent CLIs installed but not the requested one. */
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
  if (installed.length > 0 && !installed.includes(agent)) {
    throw new OrchestrationError(
      'agent_unconfigured',
      `Agent CLI "${agent}" is not installed on this host. Available agents: ${installed.join(', ')}.`
    )
  }
}
