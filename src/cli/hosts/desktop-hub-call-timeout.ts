const LONG_HUB_METHODS = new Set([
  'agent.launch',
  'agent.launchReplay',
  'orchestration.workerStart',
  'terminal.wait'
])

/** Wait long enough for a remote TUI to reach its composer; 15s was shorter than launch readiness. */
export const DESKTOP_HUB_LONG_CALL_TIMEOUT_MS = 90_000
export const DESKTOP_HUB_CLIENT_GRACE_MS = 10_000

export function desktopHubForwardTimeoutMs(
  method: string,
  requestedTimeoutMs: number | undefined
): number | undefined {
  const floor = LONG_HUB_METHODS.has(method) ? DESKTOP_HUB_LONG_CALL_TIMEOUT_MS : undefined
  if (
    requestedTimeoutMs !== undefined &&
    Number.isFinite(requestedTimeoutMs) &&
    requestedTimeoutMs > 0
  ) {
    return Math.max(requestedTimeoutMs, floor ?? requestedTimeoutMs)
  }
  return floor
}

export function desktopHubClientTimeoutMs(forwardTimeoutMs: number): number {
  return forwardTimeoutMs + DESKTOP_HUB_CLIENT_GRACE_MS
}

export function desktopHubCallTimeoutMessage(args: {
  host: string
  method: string
  timeoutMs: number
}): string {
  return (
    `Desktop hub call timed out after ${args.timeoutMs}ms forwarding ${args.method} to "${args.host}". ` +
    `The tab on "${args.host}" may still be opening. Check with \`orca terminal list --host ${args.host}\` or \`orca host inventory --json\`. ` +
    'If a trust, hooks, or security dialog is on screen, open the tab in the desktop Orca window and answer it yourself — never via keystrokes. Retry the same command with --host.'
  )
}
