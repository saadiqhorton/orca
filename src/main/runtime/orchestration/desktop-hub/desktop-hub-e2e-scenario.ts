import { runProcessSync } from '@orca/process-host'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pairedRuntimeConnectionFromOffer } from '../../../../shared/remote-runtime/pairing/paired-runtime-connection'
import { RemoteRuntimeRequestConnection } from '../../../../shared/remote-runtime/requests/remote-runtime-request-connection'
import '../../../../shared/remote-runtime/requests/remote-runtime-request-socket'
import { subscribeRemoteRuntimeTransport } from '../../../../shared/remote-runtime/requests/remote-runtime-subscription-transport'
import { DESKTOP_HUB_CLIENT_CAPABILITY } from '../../../../shared/orchestration/desktop-hub-contract'
import type { DesktopHubRequestEvent } from '../../../../shared/orchestration/desktop-hub-contract'
import { OrcaRuntimeRpcServer } from '../../rpc/server/runtime-rpc'
import { answerDesktopHubRequest } from './desktop-hub-answer'
import { buildDesktopHubCatalog } from './desktop-hub-catalog'
import { getDesktopHubRegistry } from './desktop-hub-registry'
import {
  isHubRequest,
  pairingOf,
  rejectionCode,
  resultOf,
  rpcOk,
  stubRuntime,
  waitFor
} from './desktop-hub-e2e-support'

const IDENTITY = {
  appInstallationId: 'desktop-install-0001',
  userId: 'desktop-user-000001'
}

export type CrossHostE2eTranscript = {
  lines: string[]
  forwardedMethods: string[]
  hostname: string
  marker: string
  readOutput: string
  stopped: boolean
  otherSession: string
  needsSignIn: string
  unreachable: string
}

/** Desktop hub plus two runtime processes' sockets. The worker task is `hostname` in host B's worktree. */
export async function runCrossHostOrchestrationE2e(): Promise<CrossHostE2eTranscript> {
  const lines: string[] = []
  const say = (line: string): void => {
    lines.push(line)
  }
  const root = mkdtempSync(join(tmpdir(), 'orca-cross-host-'))
  const worktree = join(root, 'host-b-worktree')
  const userDataA = join(root, 'host-a')
  const userDataB = join(root, 'host-b')
  mkdirSync(worktree, { recursive: true })
  mkdirSync(userDataA, { recursive: true })
  mkdirSync(userDataB, { recursive: true })
  writeFileSync(join(worktree, 'MARKER'), 'host-b-worktree\n')
  const runtimeA = stubRuntime('dockhand')
  const runtimeB = stubRuntime('ubuntu-server-local')
  const serverA = new OrcaRuntimeRpcServer({
    runtime: runtimeA,
    userDataPath: userDataA,
    enableWebSocket: true,
    wsPort: 0
  })
  const serverB = new OrcaRuntimeRpcServer({
    runtime: runtimeB,
    userDataPath: userDataB,
    enableWebSocket: true,
    wsPort: 0
  })
  const forwardedMethods: string[] = []
  let savedOutput = ''
  let requesterB: RemoteRuntimeRequestConnection | null = null
  let other: RemoteRuntimeRequestConnection | null = null
  try {
    await serverA.start()
    await serverB.start()
    const pairingA = pairingOf(serverA, 'dockhand')
    const pairingB = pairingOf(serverB, 'ubuntu-server-local')
    requesterB = new RemoteRuntimeRequestConnection(pairedRuntimeConnectionFromOffer(pairingB))
    const catalog = buildDesktopHubCatalog({
      machineName: 'windows-desktop',
      localPlacement: { peerFingerprint: 'fp-desktop', homePeerFingerprint: 'fp-desktop' },
      executions: [
        {
          label: 'ubuntu',
          machineName: 'ubuntu-server-local',
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
          label: 'dock',
          machineName: 'dockhand',
          environmentId: 'env-dock',
          health: 'available',
          server: { name: 'dock', peerFingerprint: 'fp-dock', homePeerFingerprint: 'fp-dock-home' }
        }
      ]
    })
    const queued: DesktopHubRequestEvent[] = []
    let subscription: Awaited<ReturnType<typeof subscribeRemoteRuntimeTransport>> | null = null
    const deliver = (event: DesktopHubRequestEvent): void => {
      if (!subscription?.sendRequest) {
        queued.push(event)
        return
      }
      void respond(event)
    }
    const respond = async (event: DesktopHubRequestEvent): Promise<void> => {
      const answer = await answerDesktopHubRequest({
        request: event,
        catalog: () => catalog,
        callHost: async (placement, method) => {
          forwardedMethods.push(method)
          if (placement.hostKey !== 'env-ubuntu') {
            throw new Error(`refusing to dial ${placement.hostKey}`)
          }
          const probe = await requesterB!.request<{ unsubscribed: boolean }>(
            'runtime.clientEvents.unsubscribe',
            { subscriptionId: 'not-this-session' },
            5_000
          )
          if (!probe.ok || probe.result.unsubscribed !== false) {
            throw new Error('host B did not accept the desktop socket')
          }
          if (method === 'orchestration.federationAttachStart') {
            const hostname = runProcessSync({
              program: 'sh',
              args: ['-c', 'hostname && cat MARKER'],
              cwd: worktree,
              timeoutMs: 5_000
            })
            if (hostname.code !== 0) {
              throw new Error(hostname.stderr || 'hostname failed in the host B worktree')
            }
            savedOutput = hostname.stdout.trim()
            return rpcOk({ state: 'ready', dispatchId: 'disp_e2e', output: savedOutput })
          }
          if (method === 'orchestration.federationShow') {
            return rpcOk({ state: 'ready', output: savedOutput })
          }
          if (method === 'orchestration.federationStop') {
            return rpcOk({ state: 'stopped', dispatchId: 'disp_e2e' })
          }
          return rpcOk({ method })
        }
      })
      await subscription?.sendRequest?.(
        'orchestration.desktopHub.answer',
        { requestId: event.requestId, ...answer },
        10_000
      )
    }
    subscription = await subscribeRemoteRuntimeTransport(
      pairedRuntimeConnectionFromOffer(pairingA),
      'runtime.clientEvents.subscribe',
      { orchestrationHub: IDENTITY },
      8_000,
      {
        onResponse: (response) => {
          if (response.ok && isHubRequest(response.result)) {
            deliver(response.result)
          }
        },
        onError: (error) => {
          say(`desktop subscription error: ${error.message}`)
        }
      },
      { clientCapabilities: [DESKTOP_HUB_CLIENT_CAPABILITY] }
    )
    for (const event of queued.splice(0)) {
      void respond(event)
    }
    await waitFor(() => getDesktopHubRegistry(runtimeA).hasVolunteer())
    const listed = await serverA.dispatchLocal({
      method: 'orchestration.desktopHub.list',
      params: {}
    })
    if (!listed.ok) {
      throw new Error(listed.error.message)
    }
    const hosts = (listed.result as { hosts: { name: string; status: string }[] }).hosts
    say('host list:')
    for (const host of hosts) {
      say(`  ${host.name}  ${host.status}`)
    }
    const registry = getDesktopHubRegistry(runtimeA)
    const needsSignIn = await rejectionCode(registry.place('TEMPLEOFDOOM'))
    say(`worker-start --host TEMPLEOFDOOM: ${needsSignIn}`)
    const unreachable = await rejectionCode(registry.place('ARCHIT4ME'))
    say(`worker-start --host ARCHIT4ME: ${unreachable}`)
    if (forwardedMethods.length !== 0) {
      throw new Error('a host that is not connected was dialed')
    }
    const placed = await registry.place('ubuntu-server-local')
    say(`worker-start --host ubuntu-server-local -> ${placed.selector}`)
    const started = await registry.call(
      placed.selector,
      'orchestration.federationAttachStart',
      { task: 'hostname' },
      8_000,
      undefined
    )
    const read = await registry.call(
      placed.selector,
      'orchestration.federationShow',
      { dispatchId: 'disp_e2e' },
      8_000,
      undefined
    )
    const stopped = await registry.call(
      placed.selector,
      'orchestration.federationStop',
      { dispatchId: 'disp_e2e' },
      8_000,
      undefined
    )
    const startResult = resultOf(started)
    const readResult = resultOf(read)
    const stopResult = resultOf(stopped)
    const oneLine = (value: unknown): string => String(value).replace(/\n/g, ' | ')
    say(`forwarded: ${forwardedMethods.join(' -> ')}`)
    say(`hostname in host B worktree: ${oneLine(startResult.output)}`)
    say(`worker-read: ${oneLine(readResult.output)}`)
    say(`worker-stop: ${stopResult.state}`)
    other = new RemoteRuntimeRequestConnection(
      pairedRuntimeConnectionFromOffer(pairingOf(serverA, 'other-app'))
    )
    const foreign = await other.request('orchestration.desktopHub.list', {}, 5_000)
    const otherSession = foreign.ok ? 'accepted' : foreign.error.code
    say(`other desktop session: ${otherSession}`)
    if (forwardedMethods.some((method) => method.includes('ssh'))) {
      throw new Error('SSH was used')
    }
    return {
      lines,
      forwardedMethods,
      hostname: String(startResult.output),
      marker: 'host-b-worktree',
      readOutput: String(readResult.output),
      stopped: stopResult.state === 'stopped',
      otherSession,
      needsSignIn,
      unreachable
    }
  } finally {
    requesterB?.close()
    other?.close()
    await Promise.allSettled([serverA.stop(), serverB.stop()])
    rmSync(root, { recursive: true, force: true })
  }
}
