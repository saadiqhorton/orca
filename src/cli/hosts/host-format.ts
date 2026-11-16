export type HostListEntry = {
  kind: 'local' | 'ssh' | 'environment' | 'execution'
  name: string
  id: string
  selector: string
  platform?: string
  machineName?: string
  connected?: boolean
  connectionStatus?: string
}

// Explicit host selectors prevent callers from using a display name on the wrong host scope.
export function formatHostList(result: { hosts: HostListEntry[]; note?: string }): string {
  const kindLabel: Record<HostListEntry['kind'], string> = {
    local: 'local',
    ssh: 'ssh target',
    environment: 'orca server',
    execution: 'desktop host'
  }
  const lines = result.hosts
    .map(
      (host) =>
        `${kindLabel[host.kind].padEnd(12)} ${host.name}${host.machineName && host.machineName !== host.name ? ` (${host.machineName})` : ''}  ${host.platform ?? 'platform unknown'}  ${formatHostConnection(host)}  ->  ${host.selector}`
    )
    .join('\n')
  return result.note ? `${lines}\n${result.note}` : lines
}

/** What one runtime calls itself; `machineName` is absent when the runtime predates the field. */
export type HostNameResult = {
  machineName?: string
  platform?: string
}

export function formatHostName(result: HostNameResult): string {
  return `${result.machineName ?? 'unknown'}${result.platform ? ` (${result.platform})` : ''}`
}

function formatHostConnection(host: HostListEntry): string {
  if (host.kind === 'execution') {
    return host.connectionStatus ?? 'connection unknown'
  }
  if (host.kind !== 'ssh') {
    return ''
  }
  if (host.connected === undefined) {
    return `connection unknown${host.connectionStatus ? ` (${host.connectionStatus})` : ''}`
  }
  return host.connected
    ? `connected${host.connectionStatus ? ` (${host.connectionStatus})` : ''}`
    : `not connected${host.connectionStatus ? ` (${host.connectionStatus})` : ''}`
}
