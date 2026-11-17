/** Short, always-on instructions so a fresh Orca agent can see other machines. */

export const ORCA_HOSTS_ENV = 'ORCA_HOSTS'
export const ORCA_INSTRUCTIONS_FILE_ENV = 'ORCA_INSTRUCTIONS_FILE'
export const ORCA_HOST_PREAMBLE_MARKER = 'orca-managed:host-preamble'

export function formatOrcaHostsEnv(hosts: readonly string[]): string {
  return hosts.filter((name) => name.trim().length > 0).join(',')
}

export function parseOrcaHostsEnv(value: string | undefined): string[] {
  if (!value) {
    return []
  }
  return value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
}

export function formatOrcaHostPreamble(hosts: readonly string[]): string {
  const names = hosts.length > 0 ? hosts.join(', ') : '(run `orca host inventory --json`)'
  return [
    'You run inside Orca.',
    `Connected machines: ${names}.`,
    'For any work on another machine use `orca … --host <name>`; never ssh.',
    'Start with `orca host inventory --json`.'
  ].join(' ')
}

export function wrapManagedHostInstruction(preamble: string): string {
  return [
    `<!-- ${ORCA_HOST_PREAMBLE_MARKER} -->`,
    preamble,
    `<!-- /${ORCA_HOST_PREAMBLE_MARKER} -->`,
    ''
  ].join('\n')
}

export function upsertManagedHostInstruction(
  existing: string | undefined,
  preamble: string
): string {
  const block = wrapManagedHostInstruction(preamble)
  const start = `<!-- ${ORCA_HOST_PREAMBLE_MARKER} -->`
  const end = `<!-- /${ORCA_HOST_PREAMBLE_MARKER} -->`
  if (!existing || existing.trim().length === 0) {
    return block
  }
  const startAt = existing.indexOf(start)
  const endAt = existing.indexOf(end)
  if (startAt === -1 || endAt === -1 || endAt < startAt) {
    const trimmed = existing.endsWith('\n') ? existing : `${existing}\n`
    return `${trimmed}\n${block}`
  }
  return `${existing.slice(0, startAt)}${block}${existing.slice(endAt + end.length).replace(/^\n/, '')}`
}

export function unknownDesktopHubHostMessage(name: string, connected: readonly string[]): string {
  const listed = connected.length > 0 ? connected.join(', ') : '(none listed)'
  return (
    `Unknown host "${name}". Connected machines: ${listed}. ` +
    'Run `orca host inventory --json`, then retry with `orca … --host <connected-name>`. ' +
    'Orca will not run this command locally or over ssh.'
  )
}
