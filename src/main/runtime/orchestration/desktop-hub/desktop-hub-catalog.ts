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
  sshHost?: string
  sshLabel?: string
  sshConfigHost?: string
  server?: {
    name: string
    peerFingerprint: string
    homePeerFingerprint?: string
    pairingRevision?: number
  } | null
}

/** Names a row the way the sidebar does: the saved environment label, then the machine name. */
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
    const preferred =
      execution.label.trim() || execution.machineName?.trim() || execution.environmentId
    const name = uniqueName(preferred, execution.machineName?.trim() || execution.label, used)
    const aliases = uniqueAliases(execution, name)
    const row: DesktopHubHostRow = {
      kind: 'execution',
      name,
      ...(execution.machineName ? { machineName: execution.machineName } : {}),
      label: execution.label,
      id: execution.environmentId,
      ...(aliases.length > 0 ? { aliases } : {}),
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

function uniqueAliases(execution: DesktopHubCatalogExecution, name: string): string[] {
  const seen = new Set(
    [name, execution.label, execution.machineName, execution.environmentId].filter(
      (value): value is string => typeof value === 'string' && value.length > 0
    )
  )
  const aliases: string[] = []
  for (const value of [execution.sshHost, execution.sshLabel, execution.sshConfigHost]) {
    const alias = value?.trim()
    if (!alias || seen.has(alias)) {
      continue
    }
    seen.add(alias)
    aliases.push(alias)
  }
  return aliases
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
