import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'

export function OrchestrationReadinessLabel({
  readiness,
  tierTwoAgents
}: {
  readiness: 'ready' | 'prompts-only'
  tierTwoAgents: readonly string[]
}): React.JSX.Element {
  const t = useTranslate()
  const label =
    readiness === 'ready'
      ? t(
          'auto.components.status.bar.RuntimeHostStatusRow.orchestration_ready',
          'Orchestration: ready'
        )
      : t(
          'auto.components.status.bar.RuntimeHostStatusRow.orchestration_prompts_only',
          'Orchestration: prompts only'
        )
  const detail =
    readiness === 'ready'
      ? t(
          'auto.components.status.bar.RuntimeHostStatusRow.orchestration_ready_agents',
          'Agents that take orchestration instructions: {{agents}}',
          { agents: tierTwoAgents.join(', ') }
        )
      : t(
          'auto.components.status.bar.RuntimeHostStatusRow.orchestration_prompts_only_detail',
          'Detected agents can receive prompts but not orchestration instructions.'
        )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="truncate">{label}</span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {detail}
      </TooltipContent>
    </Tooltip>
  )
}
