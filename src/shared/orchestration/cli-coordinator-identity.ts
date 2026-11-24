import type { OrchestrationPartyIdentity } from './mailbox/orchestration-party-identity'

/** External CLI coordinator: worker-start `--as-coordinator` without an Orca terminal. */
export const CLI_COORDINATOR_HANDLE = 'cli:coordinator'
export const CLI_COORDINATOR_PANE_KEY = 'cli:coordinator'

export function isCliCoordinatorHandle(value: string | undefined): boolean {
  return value === CLI_COORDINATOR_HANDLE
}

export function cliCoordinatorParty(): OrchestrationPartyIdentity {
  return {
    address: CLI_COORDINATOR_HANDLE,
    terminalHandle: CLI_COORDINATOR_HANDLE,
    paneKey: CLI_COORDINATOR_PANE_KEY,
    orcaSessionId: null
  }
}
