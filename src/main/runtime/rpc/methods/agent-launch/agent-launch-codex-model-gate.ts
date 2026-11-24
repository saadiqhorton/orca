import { homedir } from 'node:os'
import {
  checkAgentCliVersion,
  type AgentCliVersionCheck
} from '../../../../agent-launch/preflight/agent-cli-version-probe'
import {
  checkCodexModelAgainstVersion,
  codexModelNeedsVersionProbe
} from '../../../../../shared/orchestration/codex-model-version-gate'
import type { AgentLaunchIntent } from '../../../../../shared/agent-launch/contracts/agent-launch-intent'

type VersionProbe = () => Promise<AgentCliVersionCheck>

export async function assertRequestedCodexModelSupported(requested: {
  agent: AgentLaunchIntent['agent']
  sessionOptions?: AgentLaunchIntent['sessionOptions'] | Record<string, string>
  chatOptions?: Record<string, string>
}): Promise<void> {
  await assertCodexModelSupported({
    agent: requested.agent,
    sessionOptions: requested.sessionOptions ?? requested.chatOptions
  })
}

export async function assertCodexModelSupported(
  intent: Pick<AgentLaunchIntent, 'agent' | 'sessionOptions'>,
  readVersion?: VersionProbe
): Promise<void> {
  if (intent.agent !== 'codex') {
    return
  }
  const model = intent.sessionOptions?.model
  if (typeof model !== 'string' || !model.trim()) {
    return
  }
  const preview = checkCodexModelAgainstVersion(model, null)
  if (preview.status === 'refused') {
    throw Object.assign(new Error(preview.message), { code: 'invalid_argument' })
  }
  if (!codexModelNeedsVersionProbe(model)) {
    if (preview.status === 'unknown') {
      console.warn(preview.message)
    }
    return
  }
  const version = await (readVersion
    ? readVersion()
    : checkAgentCliVersion({ program: 'codex', cwd: homedir() }, []))
  const gate = checkCodexModelAgainstVersion(
    model,
    version.status === 'ready' || version.status === 'tooOld' ? version.version : null
  )
  if (gate.status === 'tooOld' || gate.status === 'refused') {
    throw Object.assign(new Error(gate.message), { code: 'invalid_argument' })
  }
  if (gate.status === 'unknown') {
    console.warn(gate.message)
  }
}
