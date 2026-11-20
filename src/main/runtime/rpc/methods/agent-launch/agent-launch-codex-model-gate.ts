import { homedir } from 'node:os'
import {
  checkAgentCliVersion,
  type AgentCliVersionCheck
} from '../../../../agent-launch/preflight/agent-cli-version-probe'
import { checkCodexModelAgainstVersion } from '../../../../../shared/orchestration/codex-model-version-gate'
import type { AgentLaunchIntent } from '../../../../../shared/agent-launch/contracts/agent-launch-intent'

type VersionProbe = () => Promise<AgentCliVersionCheck>

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
  const version = await (readVersion
    ? readVersion()
    : checkAgentCliVersion({ program: 'codex', cwd: homedir() }, []))
  const gate = checkCodexModelAgainstVersion(
    model,
    version.status === 'ready' || version.status === 'tooOld' ? version.version : null
  )
  if (gate.status === 'tooOld' || gate.status === 'unknown') {
    throw Object.assign(new Error(gate.message), { code: 'invalid_argument' })
  }
}
