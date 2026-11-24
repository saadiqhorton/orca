import { z } from 'zod'
import type { ExecutionHostHealth } from '../execution-host/execution-host-health'

/** Advertised by the desktop app on the client-event socket it already holds to each execution host. */
/** Terminal handles minted by an execution host's runtime. */
export const TERMINAL_HANDLE_PREFIX = 'term_'

export const DESKTOP_HUB_CLIENT_CAPABILITY = 'orchestration.desktop-hub.v1' as const

/** Environment id stored on a dispatch when the worker was placed through the desktop hub. */
export const DESKTOP_HUB_SELECTOR_PREFIX = 'dhub:'

export const DesktopHubHostStatusSchema = z.enum(['connected', 'needs_sign_in', 'unreachable'])
export type DesktopHubHostStatus = z.infer<typeof DesktopHubHostStatusSchema>

export const DesktopHubIdentitySchema = z.object({
  appInstallationId: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
  userId: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)
})
export type DesktopHubIdentity = z.infer<typeof DesktopHubIdentitySchema>

export const DesktopHubHostRowSchema = z.object({
  kind: z.enum(['desktop', 'execution']),
  name: z.string().min(1).max(256),
  machineName: z.string().min(1).max(256).optional(),
  label: z.string().min(1).max(256).optional(),
  id: z.string().min(1).max(256),
  aliases: z.array(z.string().min(1).max(256)).max(16).optional(),
  selector: z.string().min(1).max(512),
  status: DesktopHubHostStatusSchema,
  hostKey: z.string().min(1).max(256)
})
export type DesktopHubHostRow = z.infer<typeof DesktopHubHostRowSchema>

export const DesktopHubPlacementSchema = DesktopHubHostRowSchema.extend({
  selector: z.string().startsWith(DESKTOP_HUB_SELECTOR_PREFIX),
  peerFingerprint: z.string().min(1).max(256).optional(),
  homePeerFingerprint: z.string().min(1).max(256).optional(),
  pairingRevision: z.number().int().nonnegative().optional()
})
export type DesktopHubPlacement = z.infer<typeof DesktopHubPlacementSchema>

export type DesktopHubCatalog = {
  hosts: DesktopHubHostRow[]
  placements: DesktopHubPlacement[]
}

export const DesktopHubAnswerParams = z.object({
  requestId: z.string().min(1).max(200),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string().min(1).max(128),
      message: z.string().min(1).max(4000)
    })
    .optional()
})
export type DesktopHubAnswerParams = z.infer<typeof DesktopHubAnswerParams>

export type DesktopHubRequestEvent = {
  type: 'orchestrationHubRequested'
  requestId: string
  op: 'list' | 'resolve' | 'call'
  name?: string
  hostKey?: string
  method?: string
  params?: unknown
  timeoutMs?: number
  envelope?: unknown
  pairingRevision?: number
}

export class DesktopHubError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'DesktopHubError'
    this.code = code
  }
}

export function desktopHubSelector(hostKey: string): string {
  return `${DESKTOP_HUB_SELECTOR_PREFIX}${hostKey}`
}

export function isDesktopHubSelector(selector: string): boolean {
  return selector.startsWith(DESKTOP_HUB_SELECTOR_PREFIX)
}

export function desktopHubHostKey(selector: string): string {
  return selector.slice(DESKTOP_HUB_SELECTOR_PREFIX.length)
}

export function desktopHubRowMatches(
  row: {
    name: string
    machineName?: string
    label?: string
    id?: string
    aliases?: readonly string[]
  },
  query: string
): boolean {
  const wanted = query.trim().toLowerCase()
  // `orca host list --json` prints the environment id too; accept it as a selector.
  // SSH host/label aliases let `--host 192.168.1.35` match a managed target named clawd.
  return [row.name, row.machineName, row.label, row.id, ...(row.aliases ?? [])].some(
    (value) => value?.trim().toLowerCase() === wanted
  )
}

/** Sidebar health, as the desktop already computed it, in the three statuses an agent can act on. */
export function desktopHubStatus(input: {
  health: ExecutionHostHealth
  blockedReason?: string | null
  sshAuthFailed?: boolean
}): DesktopHubHostStatus {
  if (
    input.sshAuthFailed ||
    input.blockedReason === 'access-revoked' ||
    input.blockedReason === 'server-replaced' ||
    input.health === 'blocked' ||
    // After launch, a paired host waits for Reconnect (`awaiting_authenticated` / connecting).
    input.health === 'connecting'
  ) {
    return 'needs_sign_in'
  }
  if (input.health === 'available' || input.health === 'local') {
    return 'connected'
  }
  return 'unreachable'
}

export function desktopHubHostError(
  status: DesktopHubHostStatus,
  name: string
): DesktopHubError | null {
  if (status === 'connected') {
    return null
  }
  if (status === 'needs_sign_in') {
    return new DesktopHubError(
      'needs_sign_in',
      `Host "${name}" needs sign-in in the desktop app before a worker can start there.`
    )
  }
  return new DesktopHubError(
    'host_unreachable',
    `Host "${name}" is unreachable from the desktop app. It is not connected, and Orca will not try SSH.`
  )
}

export function unknownDesktopHubHost(
  name: string,
  connected: readonly string[] = []
): DesktopHubError {
  const listed = connected.length > 0 ? connected.join(', ') : '(none listed)'
  return new DesktopHubError(
    'unknown_host',
    `Unknown host "${name}". Connected machines: ${listed}. Run \`orca host inventory --json\`, then retry with \`orca … --host <connected-name>\`. Orca will not run this command locally or over ssh.`
  )
}

export const DesktopHubLocateSchema = z.discriminatedUnion('owner', [
  z.object({ owner: z.literal('local') }),
  z.object({ owner: z.literal('none') }),
  z.object({
    owner: z.literal('host'),
    name: z.string().min(1).max(256),
    hostKey: z.string().min(1).max(256),
    machineName: z.string().min(1).max(256).optional(),
    id: z.string().min(1).max(256).optional(),
    label: z.string().min(1).max(256).optional()
  })
])
export type DesktopHubLocate = z.infer<typeof DesktopHubLocateSchema>

export function sessionNotFoundError(handle: string): DesktopHubError {
  return new DesktopHubError(
    'session_not_found',
    `No session "${handle}" is known to this desktop or any connected host. Run \`orca terminal list --json\` on the host that owns it, or check the handle.`
  )
}

export function hostMismatchError(
  handle: string,
  owner: string,
  requested: string
): DesktopHubError {
  return new DesktopHubError(
    'host_mismatch',
    `Session "${handle}" lives on host "${owner}", not "${requested}". Drop --host, or pass --host ${owner}.`
  )
}

export const DESKTOP_HUB_UNAVAILABLE_MESSAGE =
  'This session is not connected to the desktop app that pairs your hosts. Open Orca on the desktop and reconnect this machine.'

export const DESKTOP_HUB_SESSION_REFUSED_MESSAGE =
  'This session is not the desktop app and user that paired this machine. Refusing to route it to other hosts.'
