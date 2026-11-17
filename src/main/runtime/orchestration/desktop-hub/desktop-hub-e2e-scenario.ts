import { runProcessSync } from '@orca/process-host'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pairedRuntimeConnectionFromOffer } from '../../../../shared/remote-runtime/pairing/paired-runtime-connection'
import { RemoteRuntimeRequestConnection } from '../../../../shared/remote-runtime/requests/remote-runtime-request-connection'
import '../../../../shared/remote-runtime/requests/remote-runtime-request-socket'
import { answerDesktopHubRequest } from './desktop-hub-answer'
import {
  crossHostE2eCatalog,
  formatDesktopHubList,
  volunteerDesktopHubOverSharedControl
} from './desktop-hub-e2e-hub'
import { getDesktopHubRegistry } from './desktop-hub-registry'
import { OrcaRuntimeRpcServer } from '../../rpc/server/runtime-rpc'
import {
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
  hostA: string
  marker: string
  readOutput: string
  stopped: boolean
  otherSession: string
  needsSignIn: string
  unreachable: string
  answerPath: 'shared-control'
  launchedTab: string
  inventoryAgents: string[]
}

/** Two runtimes plus a desktop hub on the shared-control socket production uses. */
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
  const runtimeB = stubRuntime('dezignerdrugz00')
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
  let hub: { close: () => void; answerPath: 'shared-control' } | null = null
  try {
    await serverA.start()
    await serverB.start()
    const pairingA = pairingOf(serverA, 'dockhand')
    const pairingB = pairingOf(serverB, 'dezignerdrugz00')
    requesterB = new RemoteRuntimeRequestConnection(pairedRuntimeConnectionFromOffer(pairingB))
    const catalog = crossHostE2eCatalog()
    say(`machine A runtime: dockhand  userData=${userDataA}`)
    say(`machine B runtime: dezignerdrugz00  env=ubuntu-server-local  worktree=${worktree}`)
    hub = await volunteerDesktopHubOverSharedControl({
      pairing: pairingA,
      identity: IDENTITY,
      onError: (error) => say(`desktop subscription error: ${error.message}`),
      answer: async (event) =>
        answerDesktopHubRequest({
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
              savedOutput = runHostBHostname(worktree)
              return rpcOk({ state: 'ready', dispatchId: 'disp_e2e', output: savedOutput })
            }
            if (method === 'orchestration.federationShow') {
              return rpcOk({ state: 'ready', output: savedOutput })
            }
            if (method === 'orchestration.federationStop') {
              return rpcOk({ state: 'stopped', dispatchId: 'disp_e2e' })
            }
            if (method === 'agent.launch') {
              return rpcOk({
                outcome: { kind: 'terminal', handle: 'term_visible_e2e' },
                worktree: `path:${worktree}`
              })
            }
            if (method === 'terminal.create') {
              return rpcOk({ terminal: { handle: 'term_shell_e2e', worktree: `path:${worktree}` } })
            }
            if (method === 'orchestration.surface.ensureScratch') {
              return rpcOk({
                path: worktree,
                worktree: `path:${worktree}`,
                created: false
              })
            }
            if (method === 'orchestration.surface.inventory') {
              return rpcOk({
                machineName: 'dezignerdrugz00',
                agents: ['claude', 'codex'],
                projects: [{ id: 'grp_e2e', name: 'Orca orchestration', parentPath: worktree }],
                folderWorkspaces: [
                  { id: 'fld_e2e', name: 'scratch', path: worktree, projectGroupId: 'grp_e2e' }
                ],
                sessions: [{ handle: 'term_visible_e2e', agent: 'claude' }]
              })
            }
            return rpcOk({ method })
          }
        })
    })
    say(`hub answer path: ${hub.answerPath} (no sendRequest; one-shot ${'orchestration.desktopHub.answer'})`)
    await waitFor(() => getDesktopHubRegistry(runtimeA).hasVolunteer())
    const listed = await serverA.dispatchLocal({
      method: 'orchestration.desktopHub.list',
      params: {}
    })
    if (!listed.ok) {
      throw new Error(listed.error.message)
    }
    const hosts = (
      listed.result as {
        hosts: { name: string; machineName?: string; status: string; selector: string }[]
      }
    ).hosts
    for (const line of formatDesktopHubList(hosts)) {
      say(line)
    }
    if (listed.error?.message?.includes('did not answer')) {
      throw new Error(listed.error.message)
    }
    const registry = getDesktopHubRegistry(runtimeA)
    const needsSignIn = await rejectionCode(registry.place('TEMPLEOFDOOM'))
    say(`$ orca orchestration worker-start --host TEMPLEOFDOOM: ${needsSignIn}`)
    const unreachable = await rejectionCode(registry.place('ARCHIT4ME'))
    say(`$ orca orchestration worker-start --host ARCHIT4ME: ${unreachable}`)
    if (forwardedMethods.length !== 0) {
      throw new Error('a host that is not connected was dialed')
    }
    const hostA = runProcessSync({
      program: 'hostname',
      args: [],
      cwd: userDataA,
      timeoutMs: 5_000
    }).stdout.trim()
    say(`machine A hostname: ${hostA}`)
    say('$ orca orchestration worker-start --host ubuntu-server-local --spec hostname')
    const placed = await registry.place('ubuntu-server-local')
    say(`placed -> ${placed.selector}`)
    const started = await registry.call(
      placed.selector,
      'orchestration.federationAttachStart',
      { task: 'hostname' },
      8_000,
      undefined
    )
    say('$ orca orchestration worker-read')
    const read = await registry.call(
      placed.selector,
      'orchestration.federationShow',
      { dispatchId: 'disp_e2e' },
      8_000,
      undefined
    )
    say('$ orca orchestration worker-stop')
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
    say('$ orca agent launch --host ubuntu-server-local --agent claude')
    const launched = await registry.call(
      placed.selector,
      'agent.launch',
      { agent: 'claude' },
      8_000,
      undefined
    )
    const launchedOutcome = resultOf(launched).outcome
    const launchedTab =
      launchedOutcome && typeof launchedOutcome === 'object' && 'handle' in launchedOutcome
        ? String(launchedOutcome.handle)
        : ''
    say(`visible tab on host B: ${launchedTab}`)
    say('$ orca host inventory --json')
    const inventory = await registry.call(
      placed.selector,
      'orchestration.surface.inventory',
      {},
      8_000,
      undefined
    )
    const inventoryAgents = Array.isArray(resultOf(inventory).agents)
      ? (resultOf(inventory).agents as string[])
      : []
    say(`host B agents: ${inventoryAgents.join(', ')}`)
    say('$ orca orchestration worker-status  stopped')
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
      hostA,
      marker: 'host-b-worktree',
      readOutput: String(readResult.output),
      stopped: stopResult.state === 'stopped',
      otherSession,
      needsSignIn,
      unreachable,
      answerPath: hub.answerPath,
      launchedTab,
      inventoryAgents
    }
  } finally {
    hub?.close()
    requesterB?.close()
    other?.close()
    await Promise.allSettled([serverA.stop(), serverB.stop()])
    rmSync(root, { recursive: true, force: true })
  }
}

function runHostBHostname(worktree: string): string {
  const hostname = runProcessSync({
    program: 'sh',
    args: [
      '-c',
      'echo "B_CWD=$(pwd)"; hostname; cat MARKER'
    ],
    cwd: worktree,
    timeoutMs: 5_000
  })
  if (hostname.code !== 0) {
    throw new Error(hostname.stderr || 'hostname failed in the host B worktree')
  }
  return hostname.stdout.trim()
}
