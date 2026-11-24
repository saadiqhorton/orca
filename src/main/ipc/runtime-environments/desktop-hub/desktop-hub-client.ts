import { createHash } from 'node:crypto'
import { userInfo } from 'node:os'
import { app } from 'electron'
import { getCanonicalUserDataPath } from '../../../persistence/loading-store/user-data-path'
import { createRuntimeEnvironmentMobileRelayHosts } from '../mobile-relay/runtime-environment-mobile-relay-hosts'
import { lastVerifiedRuntimeStatus } from '../../../../shared/remote-runtime/host-status/runtime-host-status'
import { createOrchestrationEnvironmentTransport } from '../requests/orchestration-environment-transport'
import { describeRelayHosts } from '../../../runtime/mobile-desktop-relay/mobile-relay-host-descriptions'
import { wslHostClientInstanceId } from '../../../wsl/host-lifecycle/wsl-host-client-instance'
import { buildDesktopHubCatalog } from '../../../runtime/orchestration/desktop-hub/desktop-hub-catalog'
import { setDesktopHubCatalogProvider } from '../../../runtime/orchestration/desktop-hub/desktop-hub-provider'
import { enableDesktopHubPlacementStore } from '../../../runtime/orchestration/desktop-hub/desktop-hub-placement-store'
import {
  rememberOrcaHostNames,
  rememberOrcaInstructionFile
} from '../../../runtime/orchestration/desktop-hub/orca-host-name-cache'
import {
  installOrcaHostInstructions,
  orcaHostInstructionPath,
  settingsWriteGlobalSlice,
  type GlobalInstructionSettingsSource
} from '../../../runtime/orchestration/desktop-hub/orca-host-instruction-install'
import { openHubSubscription } from './desktop-hub-subscribe'
import { listRegisteredSshTargets } from '../../../ssh/targets/ssh-target-registry'
import { getManagedOrcadSshTargetId } from '../../../../shared/execution-host/managed-orcad-execution-host'

type DesktopHubClientOptions = {
  userDataPath: string
  machineName: () => string
  localFingerprint: () => string
  settingsHost?: GlobalInstructionSettingsSource
  callLocal: (
    method: string,
    params: unknown,
    envelope: unknown
  ) => Promise<{ ok: boolean; result?: unknown; error?: { code: string; message: string } }>
}

/** The desktop app volunteers on each connected execution host and answers with its existing pairing sockets. */
export function startDesktopHubClient(options: DesktopHubClientOptions): () => void {
  enableDesktopHubPlacementStore()
  const hosts = createRuntimeEnvironmentMobileRelayHosts()
  const identity = desktopHubIdentity()
  setDesktopHubCatalogProvider(() => currentCatalog(options, hosts))
  const stops = new Map<string, { key: string; stop: () => void }>()
  const refresh = (): void => {
    void refreshSubscriptions()
  }
  const refreshSubscriptions = async (): Promise<void> => {
    const desired = new Map<string, string>()
    for (const host of await describeRelayHosts(hosts)) {
      if (host.health !== 'available') {
        continue
      }
      desired.set(host.environmentId, `${host.identity.pairingRevision}:${host.identity.runtimeId}`)
    }
    for (const [environmentId, current] of stops) {
      if (desired.get(environmentId) !== current.key) {
        current.stop()
        stops.delete(environmentId)
      }
    }
    for (const [environmentId, key] of desired) {
      if (stops.has(environmentId)) {
        continue
      }
      stops.set(environmentId, {
        key,
        stop: openHubSubscription({
          userDataPath: options.userDataPath,
          environmentId,
          identity,
          catalog: () => currentCatalog(options, hosts),
          callLocal: options.callLocal,
          onStopped: () => stops.delete(environmentId)
        })
      })
    }
  }
  const stopStatus = hosts.onStatusChanged(refresh)
  const stopCatalog = hosts.onCatalogChanged?.(refresh) ?? ((): void => undefined)
  refresh()
  return () => {
    stopStatus()
    stopCatalog()
    setDesktopHubCatalogProvider(null)
    for (const subscription of stops.values()) {
      subscription.stop()
    }
    stops.clear()
  }
}

type DesktopRelayRpc = {
  setMobileDesktopRelayHosts(
    hosts: ReturnType<typeof createRuntimeEnvironmentMobileRelayHosts>
  ): void
  dispatchLocal(input: {
    method: string
    params?: unknown
    orchestrationContractVersion?: number
    orchestrationRequestId?: string
  }): Promise<{ ok: boolean; result?: unknown; error?: { code: string; message: string } }>
}

/** Phone host catalog and the orchestration hub share the desktop's pairing sockets. */
export function installDesktopConnectedSurfaces(
  runtime: GlobalInstructionSettingsSource & {
    readMachineName(): string
    getOrchestrationDb(): { getOrCreateLocalMutationCallerFingerprint(): string }
  },
  runtimeRpc: DesktopRelayRpc
): void {
  runtimeRpc.setMobileDesktopRelayHosts(createRuntimeEnvironmentMobileRelayHosts())
  const stop = startDesktopHubClient({
    userDataPath: getCanonicalUserDataPath(),
    settingsHost: runtime,
    machineName: () => runtime.readMachineName(),
    localFingerprint: () =>
      runtime.getOrchestrationDb().getOrCreateLocalMutationCallerFingerprint(),
    callLocal: (method, params, envelope) => {
      const record =
        envelope && typeof envelope === 'object' ? (envelope as Record<string, unknown>) : {}
      return runtimeRpc.dispatchLocal({
        method,
        params,
        ...(typeof record.orchestrationContractVersion === 'number'
          ? { orchestrationContractVersion: record.orchestrationContractVersion }
          : {}),
        ...(typeof record.orchestrationRequestId === 'string'
          ? { orchestrationRequestId: record.orchestrationRequestId }
          : {})
      })
    }
  })
  app.on('will-quit', stop)
}

export function desktopHubIdentity(): { appInstallationId: string; userId: string } {
  return {
    appInstallationId: wslHostClientInstanceId(),
    userId: createHash('sha256')
      .update(`orca-desktop-user\0${userInfo().username}`)
      .digest('base64url')
      .slice(0, 32)
  }
}

async function currentCatalog(
  options: DesktopHubClientOptions,
  relay: ReturnType<typeof createRuntimeEnvironmentMobileRelayHosts>
) {
  const listing = await relay.list()
  let localPlacement: { peerFingerprint: string; homePeerFingerprint?: string } | undefined
  try {
    const fingerprint = options.localFingerprint()
    localPlacement = { peerFingerprint: fingerprint, homePeerFingerprint: fingerprint }
  } catch {
    localPlacement = undefined
  }
  const transport = createOrchestrationEnvironmentTransport()
  const executions = await Promise.all(
    (await describeRelayHosts(relay)).map(async (host) => {
      const status = listing.statusByEnvironmentId.get(host.environmentId)
      const verified = lastVerifiedRuntimeStatus(status)
      const environment = listing.environments.find((entry) => entry.id === host.environmentId)
      const sshTargetId = getManagedOrcadSshTargetId({
        id: host.environmentId,
        orcadDeployment: environment?.orcadDeployment
      })
      const ssh = sshTargetId
        ? listRegisteredSshTargets().find((target) => target.id === sshTargetId)
        : undefined
      let server: {
        name: string
        peerFingerprint: string
        homePeerFingerprint?: string
        pairingRevision?: number
      } | null = null
      if (host.health === 'available') {
        try {
          const resolved = await transport.resolve(host.environmentId)
          server = {
            name: resolved.name,
            peerFingerprint: resolved.peerFingerprint,
            ...(resolved.homePeerFingerprint
              ? { homePeerFingerprint: resolved.homePeerFingerprint }
              : {}),
            ...(resolved.pairingRevision !== undefined
              ? { pairingRevision: resolved.pairingRevision }
              : {})
          }
        } catch {
          server = null
        }
      }
      return {
        label: host.label,
        ...(verified?.machineName ? { machineName: verified.machineName } : {}),
        environmentId: host.environmentId,
        health: host.health,
        ...(status?.snapshot?.blockedReason
          ? { blockedReason: status.snapshot.blockedReason }
          : {}),
        ...(ssh?.host ? { sshHost: ssh.host } : {}),
        ...(ssh?.label ? { sshLabel: ssh.label } : {}),
        ...(ssh?.configHost ? { sshConfigHost: ssh.configHost } : {}),
        server
      }
    })
  )
  const catalog = buildDesktopHubCatalog({
    machineName: options.machineName(),
    ...(localPlacement ? { localPlacement } : {}),
    executions
  })
  const names = catalog.hosts.map((row) => row.name).filter((name) => name.length > 0)
  rememberOrcaHostNames(names)
  rememberOrcaInstructionFile(orcaHostInstructionPath(options.userDataPath))
  void installOrcaHostInstructions({
    userDataPath: options.userDataPath,
    settings: settingsWriteGlobalSlice(options.settingsHost)
  }).catch(() => undefined)
  return catalog
}
