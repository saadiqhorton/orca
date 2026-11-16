import type { ExecutionHostHealth } from '../../../../shared/execution-host/execution-host-health'
import {
  desktopHubSelector,
  desktopHubStatus,
  type DesktopHubCatalog,
  type DesktopHubHostRow,
  type DesktopHubPlacement
} from '../../../../shared/orchestration/desktop-hub-contract'

export type DesktopHubCatalogExecution = {
  label: string
  machineName?: string
  environmentId: string
  health: ExecutionHostHealth
  blockedReason?: string | null
  sshAuthFailed?: boolean
  server?: {
    name: string
    peerFingerprint: string
    homePeerFingerprint?: string
    pairingRevision?: number
  } | null
}

/** Names a row the way the sidebar does: the machine name, then the saved environment label. */
export function buildDesktopHubCatalog(input: {
  machineName: string
  localPlacement?: { peerFingerprint: string; homePeerFingerprint?: string }
  executions: readonly DesktopHubCatalogExecution[]
}): DesktopHubCatalog {
  const desktopName = input.machineName.trim() || 'desktop'
  const hosts: DesktopHubHostRow[] = [
    {
      kind: 'desktop',
      name: desktopName,
      machineName: desktopName,
      id: 'desktop',
      hostKey: 'desktop',
      selector: hostSelector(desktopName),
      status: 'connected'
    }
  ]
  const placements: DesktopHubPlacement[] = []
  if (input.localPlacement) {
    placements.push({
      ...hosts[0]!,
      selector: desktopHubSelector('desktop'),
      peerFingerprint: input.localPlacement.peerFingerprint,
      homePeerFingerprint: input.localPlacement.homePeerFingerprint
    })
  }
  const used = new Set<string>([desktopName])
  for (const execution of input.executions) {
    const status = desktopHubStatus(execution)
    const preferred = execution.machineName?.trim() || execution.label
    const name = uniqueName(preferred, execution.label, used)
    const row: DesktopHubHostRow = {
      kind: 'execution',
      name,
      ...(execution.machineName ? { machineName: execution.machineName } : {}),
      label: execution.label,
      id: execution.environmentId,
      hostKey: execution.environmentId,
      selector: hostSelector(name),
      status
    }
    hosts.push(row)
    if (status === 'connected' && execution.server?.peerFingerprint) {
      placements.push({
        ...row,
        selector: desktopHubSelector(execution.environmentId),
        peerFingerprint: execution.server.peerFingerprint,
        ...(execution.server.homePeerFingerprint
          ? { homePeerFingerprint: execution.server.homePeerFingerprint }
          : {}),
        ...(execution.server.pairingRevision !== undefined
          ? { pairingRevision: execution.server.pairingRevision }
          : {})
      })
    }
  }
  return { hosts, placements }
}

function uniqueName(preferred: string, label: string, used: Set<string>): string {
  if (!used.has(preferred)) {
    used.add(preferred)
    return preferred
  }
  const qualified = `${preferred} (${label})`
  used.add(qualified)
  return qualified
}

function hostSelector(name: string): string {
  return /[\s"]/.test(name) ? `--host "${name.replaceAll('"', '\\"')}"` : `--host ${name}`
}
