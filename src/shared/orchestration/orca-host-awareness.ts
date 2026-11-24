/** Short, always-on instructions so a fresh Orca agent can see other machines. */

export const ORCA_HOSTS_ENV = 'ORCA_HOSTS'
export const ORCA_INSTRUCTIONS_FILE_ENV = 'ORCA_INSTRUCTIONS_FILE'
export const ORCA_HOST_PREAMBLE_MARKER = 'orca-managed:host-preamble'
export const ORCA_HOST_PREAMBLE =
  'You are running inside Orca, which can reach other connected machines. Run `orca host inventory --json` for the live list of machines before assuming one exists. To start a terminal, agent or worker on another machine, pass `--host <name>` to `orca terminal create`, `orca agent launch` or `orca orchestration worker-start`. The IDs you get back work from any machine. Never use ssh to reach another machine. If the user names a project group or workspace, run `orca host inventory --json`, find it, and pass its selector as --worktree. Build task specs from literal values; never leave placeholders or shell variables unset. Use the model id exactly as the user gave it, mapped to the provider id (for example gpt 6 luna maps to gpt-6-luna). After launch, run `orca terminal read --terminal <handle>` until real work appears. Copy handles exactly.'

// ORCA_HOSTS is a spawn-time hint and may be stale; `orca host inventory --json` is the live list.
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

export function formatOrcaHostPreamble(): string {
  return ORCA_HOST_PREAMBLE
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
  if (existing === undefined || existing === '') {
    return block
  }
  const startAt = existing.indexOf(start)
  const endAt = existing.indexOf(end)
  if (startAt === -1 || endAt === -1 || endAt < startAt) {
    // One separator newline before the block. Do not invent a second newline when
    // the file already lacks a trailing newline, and do not treat whitespace as empty.
    return `${existing}\n${block}`
  }
  return `${existing.slice(0, startAt)}${block}${existing.slice(endAt + end.length).replace(/^\n/, '')}`
}

export function removeManagedHostInstruction(existing: string | undefined): string | undefined {
  if (!existing) {
    return existing
  }
  const start = `<!-- ${ORCA_HOST_PREAMBLE_MARKER} -->`
  const end = `<!-- /${ORCA_HOST_PREAMBLE_MARKER} -->`
  const startAt = existing.indexOf(start)
  const endAt = existing.indexOf(end)
  if (startAt === -1 || endAt === -1 || endAt < startAt) {
    return existing
  }
  // Inverse of upsert: drop the block, the wrap's trailing newline, and the one `\n`
  // separator upsert inserts before the start marker. Leave every other byte alone.
  let from = startAt
  let to = endAt + end.length
  if (existing.startsWith('\n', to)) {
    to += 1
  }
  if (from > 0 && existing[from - 1] === '\n') {
    from -= 1
  }
  return existing.slice(0, from) + existing.slice(to)
}

export function unknownDesktopHubHostMessage(name: string, connected: readonly string[]): string {
  const listed = connected.length > 0 ? connected.join(', ') : '(none listed)'
  return (
    `Unknown host "${name}". Connected machines: ${listed}. ` +
    'Run `orca host inventory --json`, then retry with `orca … --host <connected-name>`. ' +
    'Orca will not run this command locally or over ssh.'
  )
}
