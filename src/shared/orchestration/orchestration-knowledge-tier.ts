import type { TuiAgent } from '../agent-launch/catalog/tui-agent'
import { isTuiAgent, TUI_AGENT_CONFIG } from '../agent-launch/catalog/tui-agent-config'
import type { HarnessChannel } from '../agent-launch/harness-launch-capability-types'
import { HARNESS_LAUNCH_CAPABILITIES } from '../agent-launch/harness-launch-capabilities'
import { compareAppVersions, isValidAppVersion } from '../app-lifecycle/identity/app-version'

export type OrchestrationTier = 1 | 2 | 3

function channelIsVerified(channel: HarnessChannel, version: string | undefined): boolean {
  if (channel.kind === 'env') {
    return true
  }
  if (channel.kind !== 'flag') {
    return false
  }
  if (!channel.minVersion) {
    return true
  }
  return (
    version !== undefined &&
    isValidAppVersion(version) &&
    compareAppVersions(version, channel.minVersion) >= 0
  )
}

export function orchestrationTierFor(agent: TuiAgent, version?: string): OrchestrationTier {
  const capabilities = HARNESS_LAUNCH_CAPABILITIES[agent]
  if (
    channelIsVerified(capabilities.channels.instructions, version) ||
    capabilities.readsManagedInstructionFiles
  ) {
    return 2
  }
  if (TUI_AGENT_CONFIG[agent].promptInjectionMode) {
    return 1
  }
  return 3
}

export function orchestrationTiersFor(
  agents: readonly string[]
): Partial<Record<TuiAgent, OrchestrationTier>> {
  const tiers: Partial<Record<TuiAgent, OrchestrationTier>> = {}
  for (const agent of agents) {
    if (isTuiAgent(agent)) {
      tiers[agent] = orchestrationTierFor(agent)
    }
  }
  return tiers
}

export type OrchestrationReadiness = 'ready' | 'prompts-only'

/** Ready when a detected agent takes orchestration instructions; prompts only when all it has is prompt delivery. */
export function orchestrationReadinessFor(
  agents: readonly string[] | undefined
): OrchestrationReadiness | null {
  const tiers = Object.values(orchestrationTiersFor(agents ?? []))
  if (tiers.includes(2)) {
    return 'ready'
  }
  return tiers.includes(1) ? 'prompts-only' : null
}

export function orchestrationTierTwoAgents(agents: readonly string[]): TuiAgent[] {
  return [...new Set(agents)]
    .filter(isTuiAgent)
    .filter((agent) => orchestrationTierFor(agent) === 2)
}
