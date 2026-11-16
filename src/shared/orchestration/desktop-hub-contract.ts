import { z } from 'zod'
import type { ExecutionHostHealth } from '../execution-host/execution-host-health'

/** Advertised by the desktop app on the client-event socket it already holds to each execution host. */
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
  row: { name: string; machineName?: string; label?: string },
  query: string
): boolean {
  const wanted = query.trim()
  return [row.name, row.machineName, row.label].some((value) => value === wanted)
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

export function unknownDesktopHubHost(name: string): DesktopHubError {
  return new DesktopHubError(
    'host_unknown',
    `Unknown host "${name}". Run orca host list to see the machines this desktop is connected to.`
  )
}

export const DESKTOP_HUB_UNAVAILABLE_MESSAGE =
  'This session is not connected to the desktop app that pairs your hosts. Open Orca on the desktop and reconnect this machine.'

export const DESKTOP_HUB_SESSION_REFUSED_MESSAGE =
  'This session is not the desktop app and user that paired this machine. Refusing to route it to other hosts.'
