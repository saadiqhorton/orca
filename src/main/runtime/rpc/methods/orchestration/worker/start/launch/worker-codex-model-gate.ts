import { OrchestrationError } from '../../../../../../orchestration/orchestration-error'
import { assertCodexModelSupported } from '../../../../agent-launch/agent-launch-codex-model-gate'
import type { TuiAgent } from '../../../../../../../../shared/agent-launch/catalog/tui-agent'

export async function assertWorkerCodexModelSupported(
  agent: TuiAgent | null | undefined,
  model: string | null | undefined
): Promise<void> {
  if (agent !== 'codex') {
    return
  }
  try {
    await assertCodexModelSupported({
      agent: 'codex',
      ...(typeof model === 'string' && model.trim() ? { sessionOptions: { model } } : {})
    })
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : 'invalid_argument'
    throw new OrchestrationError(
      code,
      error instanceof Error ? error.message : 'Codex model is not supported on this host.'
    )
  }
}
