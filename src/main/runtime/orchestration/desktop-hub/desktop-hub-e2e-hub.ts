import { DESKTOP_HUB_CLIENT_CAPABILITY } from '../../../../shared/orchestration/desktop-hub-contract'
import type { DesktopHubRequestEvent } from '../../../../shared/orchestration/desktop-hub-contract'
import { pairedRuntimeConnectionFromOffer } from '../../../../shared/remote-runtime/pairing/paired-runtime-connection'
import type { PairingOffer } from '../../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import '../../../../shared/remote-runtime/requests/remote-runtime-request-socket'
import { RemoteRuntimeSharedControlConnection } from '../../../../shared/remote-runtime/control/remote-runtime-shared-control-connection'
import type { RemoteRuntimeSharedSubscription } from '../../../../shared/remote-runtime/control/remote-runtime-shared-control-types'
import { buildDesktopHubCatalog } from './desktop-hub-catalog'
import {
  createDesktopHubDeliver,
  sendDesktopHubAnswer,
  type DesktopHubAnswerBody
} from './desktop-hub-reply'
import { isHubRequest } from './desktop-hub-e2e-support'

export function crossHostE2eCatalog() {
  return buildDesktopHubCatalog({
    machineName: 'windows-desktop',
    localPlacement: { peerFingerprint: 'fp-desktop', homePeerFingerprint: 'fp-desktop' },
    executions: [
      {
        label: 'ubuntu-server-local',
        machineName: 'dezignerdrugz00',
        environmentId: 'env-ubuntu',
        health: 'available',
        server: {
          name: 'ubuntu',
          peerFingerprint: 'fp-ubuntu',
          homePeerFingerprint: 'fp-home',
          pairingRevision: 1
        }
      },
      {
        label: 'temple',
        machineName: 'TEMPLEOFDOOM',
        environmentId: 'env-temple',
        health: 'blocked',
        blockedReason: 'access-revoked'
      },
      {
        label: 'arch',
        machineName: 'ARCHIT4ME',
        environmentId: 'env-arch',
        health: 'disconnected'
      },
      {
        label: 'dockhand',
        machineName: 'dockhand',
        environmentId: 'env-dock',
        health: 'available',
        server: { name: 'dock', peerFingerprint: 'fp-dock', homePeerFingerprint: 'fp-dock-home' }
      }
    ]
  })
}

/** Production path: shared-control clientEvents subscribe has no sendRequest. */
export async function volunteerDesktopHubOverSharedControl(input: {
  pairing: PairingOffer
  identity: { appInstallationId: string; userId: string }
  answer: (event: DesktopHubRequestEvent) => Promise<DesktopHubAnswerBody>
  onError?: (error: Error) => void
}): Promise<{ close: () => void; answerPath: 'shared-control' }> {
  const control = new RemoteRuntimeSharedControlConnection(
    pairedRuntimeConnectionFromOffer(input.pairing),
    { clientCapabilities: [DESKTOP_HUB_CLIENT_CAPABILITY] }
  )
  let subscription: RemoteRuntimeSharedSubscription | null = null
  const { deliver, flush } = createDesktopHubDeliver({
    isOpen: () => subscription !== null,
    send: (event) => {
      void reply(event)
    }
  })
  const reply = async (event: DesktopHubRequestEvent): Promise<void> => {
    const body = await input.answer(event)
    await sendDesktopHubAnswer({
      subscription: subscription ?? {},
      requestId: event.requestId,
      answer: body,
      callEnvironment: (method, params, timeoutMs) => control.request(method, params, timeoutMs)
    })
  }
  subscription = await control.subscribe(
    'runtime.clientEvents.subscribe',
    { orchestrationHub: input.identity },
    8_000,
    {
      onResponse: (response) => {
        if (response.ok && isHubRequest(response.result)) {
          deliver(response.result)
        }
      },
      onError: (error) => input.onError?.(error)
    }
  )
  if ('sendRequest' in subscription) {
    throw new Error('shared-control subscription unexpectedly has sendRequest')
  }
  flush()
  return {
    answerPath: 'shared-control',
    close: () => {
      subscription?.close()
      control.close()
    }
  }
}

export function formatDesktopHubList(
  hosts: { name: string; machineName?: string; status: string; selector: string }[]
): string[] {
  return [
    '$ orca host list',
    ...hosts.map((host) => {
      const machine =
        host.machineName && host.machineName !== host.name ? ` (${host.machineName})` : ''
      const kind = host.name === 'windows-desktop' ? 'local       ' : 'desktop host'
      return `${kind} ${host.name}${machine}  ${host.status}  ->  ${host.selector}`
    })
  ]
}
