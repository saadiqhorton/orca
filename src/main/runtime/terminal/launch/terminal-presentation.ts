import type { RuntimeTerminalPresentation } from '../../../../shared/runtime-terminal-contracts'

export function createTerminalRevealWarning(handle: string, error?: unknown): string {
  const reason =
    error instanceof Error && error.message.trim().length > 0
      ? ` Reason: ${error.message.trim()}.`
      : ''
  return [
    `Terminal ${handle} is running on this Orca host and its tab exists there, but Orca could not bring the tab to the front.${reason}`,
    `To bring it forward, run \`orca terminal focus --terminal ${handle}\`.`
  ].join(' ')
}

// Absence means default; surfacing callers must omit surfaceOwner instead of sending true.
export function ownerSurfacing(shouldSurface: boolean): { surfaceOwner?: false } {
  return shouldSurface ? {} : { surfaceOwner: false }
}

export function resolveTerminalPresentation(opts: {
  presentation?: RuntimeTerminalPresentation
  focus?: boolean
  activate?: boolean
}): RuntimeTerminalPresentation | undefined {
  if (opts.presentation) {
    return opts.presentation
  }
  if (opts.focus === true || opts.activate === true) {
    return 'focused'
  }
  return undefined
}
