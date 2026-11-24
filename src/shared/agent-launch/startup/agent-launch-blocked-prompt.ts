import type { AgentLaunchPromptDisposal } from '../contracts/agent-launch-intent'
import type { RuntimeTerminalWaitBlockedReason } from '../../terminal/runtime/runtime-terminal-contracts'

const STARTUP_SECURITY_DIALOG_REASONS = new Set<string>([
  'agent-hooks-review-prompt',
  'codex-hooks-review-prompt',
  'agent-trust-workspace',
  'codex-trust-workspace',
  'agent-startup-menu-prompt',
  'agent-sign-in-prompt'
])

const STARTUP_DIALOG_REASONS = new Set<string>([
  ...STARTUP_SECURITY_DIALOG_REASONS,
  'agent-update-prompt',
  'codex-update-prompt',
  'agent-cwd-prompt',
  'codex-cwd-prompt',
  'codex-model-migration-prompt'
])

const PROMPT_LABEL: Record<string, string> = {
  'agent-hooks-review-prompt': 'Hooks need review',
  'codex-hooks-review-prompt': 'Hooks need review',
  'agent-trust-workspace': 'Trust this workspace',
  'codex-trust-workspace': 'Trust this workspace',
  'agent-startup-menu-prompt': 'Startup menu',
  'agent-sign-in-prompt': 'Sign-in required',
  'agent-update-prompt': 'Update available',
  'codex-update-prompt': 'Update available',
  'agent-cwd-prompt': 'Choose working directory',
  'codex-cwd-prompt': 'Choose working directory',
  'codex-model-migration-prompt': 'Model migration'
}

export function isStartupDialogBlockedReason(
  reason: string | undefined
): reason is RuntimeTerminalWaitBlockedReason {
  return typeof reason === 'string' && STARTUP_DIALOG_REASONS.has(reason)
}

export function isStartupSecurityDialogReason(reason: string | undefined): reason is string {
  return typeof reason === 'string' && STARTUP_SECURITY_DIALOG_REASONS.has(reason)
}

export function startupDialogPromptLabel(reason: string): string {
  return PROMPT_LABEL[reason] ?? reason
}

export function blockedOnPromptNext(reason: string, host?: string): string {
  const where = host ? ` on ${host}` : ''
  const label = startupDialogPromptLabel(reason)
  return (
    `${label}${where}: open the tab in the desktop Orca window and choose an option yourself, ` +
    'then re-send the prompt with `orca terminal send --host <name> --terminal <handle> --text "..." --enter`. ' +
    'Never answer trust, hooks, or security prompts with keystrokes.'
  )
}

export function blockedOnPromptDisposal(
  reason: string,
  options: { promptText?: string; host?: string } = {}
): Extract<AgentLaunchPromptDisposal, { outcome: 'agent_blocked_on_prompt' }> {
  return {
    outcome: 'agent_blocked_on_prompt',
    blockedReason: reason,
    next: blockedOnPromptNext(reason, options.host),
    ...(options.promptText ? { promptText: options.promptText } : {})
  }
}

export function timedOutLaunchDisposal(
  detail: string
): Extract<AgentLaunchPromptDisposal, { outcome: 'timed_out' }> {
  return { outcome: 'timed_out', detail }
}

export function isAgentLaunchPromptDisposal(value: unknown): value is AgentLaunchPromptDisposal {
  if (typeof value !== 'object' || value === null || !('outcome' in value)) {
    return false
  }
  const outcome = value.outcome
  return (
    outcome === 'journaled' ||
    outcome === 'handed-to-terminal' ||
    outcome === 'not-delivered' ||
    outcome === 'unconfirmed' ||
    outcome === 'agent_blocked_on_prompt' ||
    outcome === 'timed_out'
  )
}
