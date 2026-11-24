// agent.launch shares desktop/mobile policy; absent --surface uses the host's Chat | CLI choice for the agent.

import { randomUUID } from 'node:crypto'
import type {
  AgentLaunchPrompt,
  AgentLaunchResult
} from '../../shared/agent-launch/contracts/agent-launch-intent'
import {
  AGENT_LAUNCH_SURFACES,
  type AgentLaunchSurface
} from '../../shared/agent-launch/contracts/agent-launch-surface'
import { checkAgentLaunchModelPreferences } from '../../shared/agent-launch/choices/agent-launch-model-preferences'
import {
  AGENT_LAUNCH_RUNTIME_CAPABILITY,
  AGENT_LAUNCH_PROMPT_CARRY_RUNTIME_CAPABILITY,
  AGENT_LAUNCH_LOCAL_PRESENTATION_RUNTIME_CAPABILITY,
  AGENT_LAUNCH_REPLAY_REQUIRED_RUNTIME_CAPABILITY,
  AGENT_LAUNCH_SURFACE_RUNTIME_CAPABILITY
} from '../../shared/agent-launch/contracts/agent-launch-runtime-capability'
import { createStructuredAgentSessionOperationId } from '../../shared/agent-session/lifecycle/structured-agent-session-mutation'
import { parseAgentSessionOperationTimestamp } from '../../shared/agent-session/agent-session-host-authority'
import type { RuntimeStatus } from '../../shared/runtime-session-contracts'
import type { TuiAgent } from '../../shared/agent-launch/catalog/tui-agent'
import { isTuiAgent } from '../../shared/agent-launch/catalog/tui-agent-config'
import {
  getOptionalStringFlag,
  getRequiredStringFlag,
  getRequiredStringFlagAllowingEmpty,
  rejectValuelessFlag
} from '../arguments/flags'
import { RuntimeClientError } from '../runtime/types'
import type { RuntimeClient } from '../runtime/client'
import type { RuntimeRpcSuccess } from '../../shared/runtime-rpc-envelope'
import { withCliAgentLaunchRecovery } from './agent-launch-recovery'
import { checkCodexModelAgainstVersion } from '../../shared/orchestration/codex-model-version-gate'
import { emitCliWarning } from '../output/cli-warning'

type Flags = Map<string, string | boolean>

/** The host strips agent fields from the worktree.create payload. */
export type CliAgentLaunchTarget =
  | { kind: 'existing'; worktree: string }
  | { kind: 'orchestration-session' }
  | { kind: 'create-worktree'; create: Record<string, unknown> }

export type CliAgentLaunch = {
  agent: TuiAgent
  prompt?: AgentLaunchPrompt
  sessionOptions?: Record<string, string>
  operationId?: string
  surface?: AgentLaunchSurface
  warning?: string
}

function readSurfaceFlag(flags: Flags): AgentLaunchSurface | undefined {
  if (!flags.has('surface')) {
    return undefined
  }
  const surface = getRequiredStringFlag(flags, 'surface')
  const known = AGENT_LAUNCH_SURFACES.find((candidate) => candidate === surface)
  if (!known) {
    throw new RuntimeClientError('invalid_argument', '--surface must be one of: chat, terminal')
  }
  return known
}

export function parseCliAgent(value: string): TuiAgent {
  if (!isTuiAgent(value)) {
    throw new RuntimeClientError('invalid_argument', `Unknown TUI agent "${value}"`)
  }
  return value
}

export function readCliAgentLaunch(
  flags: Flags,
  agent: TuiAgent,
  target: { createsWorktree: boolean; json?: boolean }
): CliAgentLaunch {
  const checked = checkAgentLaunchModelPreferences({
    agent,
    model: getOptionalStringFlag(flags, 'model'),
    effort: getOptionalStringFlag(flags, 'effort'),
    createsWorktree: target.createsWorktree,
    // The execution host verifies an OpenCode model itself before it starts one.
    openCodeModelLaunchSupported: true
  })
  if ('refusal' in checked) {
    throw new RuntimeClientError(checked.refusal.code, checked.refusal.message)
  }
  let warning: string | undefined
  if (agent === 'codex' && checked.preferences?.model) {
    const gate = checkCodexModelAgainstVersion(checked.preferences.model, null)
    if (gate.status === 'refused') {
      throw new RuntimeClientError('invalid_argument', gate.message)
    }
    if (gate.status === 'unknown') {
      warning = emitCliWarning(gate.message, target.json === true)
    }
  }
  const prompt = flags.get('prompt')
  rejectValuelessFlag(prompt, 'prompt')
  const operationId = flags.has('retry-launch')
    ? getRequiredStringFlagAllowingEmpty(flags, 'retry-launch')
    : undefined
  if (operationId !== undefined && parseAgentSessionOperationTimestamp(operationId) === null) {
    throw new RuntimeClientError('invalid_argument', 'Malformed --retry-launch operation ID')
  }
  const surface = readSurfaceFlag(flags)
  return {
    agent,
    ...(surface ? { surface } : {}),
    ...(operationId ? { operationId } : {}),
    ...(typeof prompt === 'string' && prompt.trim()
      ? { prompt: { text: prompt, delivery: 'submit' as const } }
      : {}),
    ...(checked.preferences ? { sessionOptions: { ...checked.preferences } } : {}),
    ...(warning ? { warning } : {})
  }
}

export function hasLaunchModelFlags(flags: Flags): boolean {
  return flags.has('model') || flags.has('effort')
}

// An older host strips `surface` and follows its own setting, so an explicit pick never reaches it.
export const SURFACE_UNSUPPORTED_MESSAGE =
  'This Orca host cannot start an agent as a chat or a terminal on request. Update Orca on the execution host, or omit --surface.'

export async function getAgentLaunchCapabilities(
  client: RuntimeClient
): Promise<readonly string[] | null> {
  const status = await client.call<RuntimeStatus>('status.get')
  const capabilities = status.result.capabilities ?? []
  return capabilities.includes(AGENT_LAUNCH_RUNTIME_CAPABILITY) ? capabilities : null
}

export async function callAgentLaunch(
  client: RuntimeClient,
  launch: CliAgentLaunch,
  request: { target: CliAgentLaunchTarget; presentation?: 'focused' | 'background' },
  capabilities: readonly string[],
  rawArgs?: readonly string[]
): Promise<RuntimeRpcSuccess<AgentLaunchResult & { operationId?: string }>> {
  const replaySupported = capabilities.includes(AGENT_LAUNCH_REPLAY_REQUIRED_RUNTIME_CAPABILITY)
  if (launch.operationId && !replaySupported) {
    throw new RuntimeClientError(
      'agent_session_operation_unknown',
      'This host cannot replay the earlier launch. Return to the original execution host; do not retry without --retry-launch.'
    )
  }
  if (launch.prompt && !capabilities.includes(AGENT_LAUNCH_PROMPT_CARRY_RUNTIME_CAPABILITY)) {
    throw new RuntimeClientError(
      'incompatible_runtime',
      'This Orca host cannot safely carry launch prompts. Update Orca on the execution host.'
    )
  }
  if (launch.surface && !capabilities.includes(AGENT_LAUNCH_SURFACE_RUNTIME_CAPABILITY)) {
    throw new RuntimeClientError('incompatible_runtime', SURFACE_UNSUPPORTED_MESSAGE)
  }
  if (!capabilities.includes(AGENT_LAUNCH_LOCAL_PRESENTATION_RUNTIME_CAPABILITY)) {
    throw new RuntimeClientError(
      'incompatible_runtime',
      'This Orca host cannot honor CLI launch focus or background behavior. Update Orca on the execution host.'
    )
  }
  const operationId = replaySupported
    ? (launch.operationId ?? createStructuredAgentSessionOperationId(randomUUID))
    : undefined
  const params = {
    ...request,
    ...launch,
    ...(operationId ? { operationId } : {}),
    launchSource: 'cli'
  }
  const result = await withCliAgentLaunchRecovery(
    client.call<AgentLaunchResult>(operationId ? 'agent.launchReplay' : 'agent.launch', params),
    { operationId, replayed: launch.operationId !== undefined, rawArgs, params }
  )
  return { ...result, result: { ...result.result, ...(operationId ? { operationId } : {}) } }
}

export function formatAgentLaunch(result: AgentLaunchResult & { operationId?: string }): string {
  const { outcome, receipt, prompt } = result
  return [
    `agent: ${outcome.kind === 'structured' ? 'chat session' : 'terminal'}`,
    `handle: ${outcome.handle}`,
    ...(outcome.kind === 'structured' ? [`sessionId: ${outcome.sessionId}`] : []),
    `worktreeId: ${result.worktreeId}`,
    ...(result.sessionPlacement
      ? [
          `placement.source: ${result.sessionPlacement.source}`,
          ...(result.sessionPlacement.group
            ? [`placement.group: ${result.sessionPlacement.group.name}`]
            : [])
        ]
      : []),
    ...(result.operationId ? [`operationId: ${result.operationId}`] : []),
    `why: ${receipt.detail}`,
    ...(prompt ? [`prompt: ${prompt.outcome}`] : []),
    ...(prompt?.outcome === 'agent_blocked_on_prompt'
      ? [
          `blockedReason: ${prompt.blockedReason}`,
          ...(prompt.promptText ? [`promptText: ${prompt.promptText}`] : []),
          `next: ${prompt.next}`
        ]
      : []),
    ...(prompt?.outcome === 'timed_out' ? [`detail: ${prompt.detail}`] : []),
    ...(result.warning ? [`warning: ${result.warning}`] : [])
  ].join('\n')
}

/** A tab may exist; the prompt was not delivered. Never treat this as success. */
export function assertAgentLaunchPromptDelivered(
  result: AgentLaunchResult & { operationId?: string }
): void {
  const prompt = result.prompt
  if (prompt?.outcome === 'agent_blocked_on_prompt') {
    throw new RuntimeClientError('agent_blocked_on_prompt', prompt.next, {
      handle: result.outcome.handle,
      worktreeId: result.worktreeId,
      blockedReason: prompt.blockedReason,
      ...(prompt.promptText ? { promptText: prompt.promptText } : {}),
      next: prompt.next
    })
  }
  if (prompt?.outcome === 'timed_out') {
    throw new RuntimeClientError('timed_out', prompt.detail, {
      handle: result.outcome.handle,
      worktreeId: result.worktreeId,
      next: 'The tab may still be opening. Check with terminal show / terminal list --host <name>. If a trust or hooks dialog is on screen, open it in Orca and answer it yourself — never via keystrokes.'
    })
  }
}
