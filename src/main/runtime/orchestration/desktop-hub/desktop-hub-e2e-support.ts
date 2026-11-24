import { parsePairingCode } from '../../../../shared/remote-runtime/pairing/pairing'
import type { DesktopHubRequestEvent } from '../../../../shared/orchestration/desktop-hub-contract'
import type { RuntimeClientEvent } from '../../../../shared/remote-runtime/session-graph/runtime-client-events'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { OrcaRuntimeRpcServer } from '../../rpc/server/runtime-rpc'

export function pairingOf(server: OrcaRuntimeRpcServer, name: string) {
  const offer = server.createPairingOffer({ name, scope: 'runtime' })
  if (!offer.available) {
    throw new Error(`pairing unavailable for ${name}`)
  }
  const pairing = parsePairingCode(offer.pairingUrl)
  if (!pairing) {
    throw new Error(`invalid pairing for ${name}`)
  }
  return pairing
}

export function stubRuntime(machineName: string): OrcaRuntimeService {
  const listeners = new Set<(event: RuntimeClientEvent) => void>()
  const cleanups = new Map<string, () => void>()
  const runtime = {
    configureNotificationDismissalStore: () => {},
    getRuntimeId: () => machineName,
    getStartedAt: () => 1,
    cleanupSubscriptionsForConnection: (connectionId: string) => {
      for (const [id, cleanup] of cleanups) {
        if (id.includes(connectionId)) {
          cleanup()
          cleanups.delete(id)
        }
      }
    },
    registerSubscriptionCleanup: (id: string, cleanup: () => void) => {
      cleanups.set(id, cleanup)
    },
    cleanupSubscription: (id: string) => {
      cleanups.get(id)?.()
      cleanups.delete(id)
    },
    onClientDisconnected: () => {},
    getClientSettings: () => ({ nativeChatQueueFollowUps: false }),
    onClientEvent: (listener: (event: RuntimeClientEvent) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getTerminalSleepClientEventSnapshot: () => [],
    getNativeChatLaunchDraftResolutionClientEventSnapshot: () => []
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this socket fixture implements every runtime method the two test servers reach.
  return runtime as unknown as OrcaRuntimeService
}

export function isHubRequest(value: unknown): value is DesktopHubRequestEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'orchestrationHubRequested'
  )
}

export function rpcOk(result: Record<string, unknown>) {
  return {
    id: 'host-b',
    ok: true as const,
    result,
    _meta: { runtimeId: 'ubuntu-server-local' }
  }
}

export function resultOf(response: {
  ok: boolean
  result?: unknown
  error?: { message: string }
}): Record<string, unknown> {
  if (!response.ok) {
    throw new Error(response.error?.message ?? 'hub call failed')
  }
  const result = response.result
  return result && typeof result === 'object' ? (result as Record<string, unknown>) : {}
}

export async function rejectionCode(pending: Promise<unknown>): Promise<string> {
  try {
    await pending
  } catch (error) {
    return error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'error'
  }
  throw new Error('expected the desktop hub to refuse this host')
}

export async function waitFor(ready: () => boolean): Promise<void> {
  const started = Date.now()
  while (!ready()) {
    if (Date.now() - started > 8_000) {
      throw new Error('desktop hub did not register')
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
