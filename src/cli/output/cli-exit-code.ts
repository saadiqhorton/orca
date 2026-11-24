import { cliErrorCode } from './cli-error'

const PLUGIN_EXIT_CODES: Readonly<Record<string, number>> = {
  plugin_invalid: 2,
  approval_required: 3,
  approval_stale: 3
}

const ORCHESTRATION_COMMAND_FAMILIES = new Set(['orchestration', 'terminal', 'agent', 'host'])

const ORCHESTRATION_EXIT_CODES: Readonly<Record<string, number>> = {
  host_mismatch: 2,
  unknown_host: 3,
  session_not_found: 3,
  host_unreachable: 4,
  host_offline: 4,
  needs_sign_in: 4,
  agent_blocked_on_prompt: 5,
  incompatible_runtime: 6
}

/** `orca plugin` exit codes are a stable contract so scripts can tell "invalid" and "ask a human" apart from failure. */
export function cliErrorExitCode(error: unknown, commandPath: readonly string[]): number {
  const code = cliErrorCode(error)
  if (!code) {
    return 1
  }
  if (commandPath[0] === 'plugin') {
    return PLUGIN_EXIT_CODES[code] ?? 1
  }
  if (ORCHESTRATION_COMMAND_FAMILIES.has(commandPath[0] ?? '')) {
    return ORCHESTRATION_EXIT_CODES[code] ?? 1
  }
  return 1
}
