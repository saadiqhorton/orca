import type { TuiAgent } from '../agent-launch/catalog/tui-agent'
import { isTuiAgent, TUI_AGENT_CONFIG } from '../agent-launch/catalog/tui-agent-config'

export type OrchestrationReadiness = 'ready' | 'prompts-only'

/** Ready when a detected agent takes worker instructions; prompts-only when it only accepts prompt injection. */
export function orchestrationReadinessFor(
  agents: readonly string[] | undefined
): OrchestrationReadiness | null {
  const tui = [...new Set(agents ?? [])].filter(isTuiAgent)
  if (tui.some((agent) => TUI_AGENT_CONFIG[agent].workerStartReadsComposerMarker)) {
    return 'ready'
  }
  return tui.some((agent) => TUI_AGENT_CONFIG[agent].promptInjectionMode) ? 'prompts-only' : null
}

export function orchestrationTierTwoAgents(agents: readonly string[]): TuiAgent[] {
  return [...new Set(agents)]
    .filter(isTuiAgent)
    .filter((agent) => TUI_AGENT_CONFIG[agent].workerStartReadsComposerMarker)
}
