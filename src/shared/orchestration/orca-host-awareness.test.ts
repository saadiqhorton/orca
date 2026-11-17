import { describe, expect, it } from 'vitest'
import {
  formatOrcaHostPreamble,
  formatOrcaHostsEnv,
  parseOrcaHostsEnv,
  unknownDesktopHubHostMessage,
  upsertManagedHostInstruction
} from './orca-host-awareness'

describe('orca host awareness copy', () => {
  it('names connected machines and forbids ssh', () => {
    const preamble = formatOrcaHostPreamble(['dockhand', 'ubuntu-server-local'])
    expect(preamble).toContain('You run inside Orca.')
    expect(preamble).toContain('dockhand, ubuntu-server-local')
    expect(preamble).toContain('never ssh')
    expect(preamble).toContain('orca host inventory --json')
    expect(formatOrcaHostsEnv(['dockhand', 'ubuntu-server-local'])).toBe(
      'dockhand,ubuntu-server-local'
    )
    expect(parseOrcaHostsEnv('dockhand, ubuntu-server-local')).toEqual([
      'dockhand',
      'ubuntu-server-local'
    ])
  })

  it('replaces only the managed instruction block', () => {
    const first = upsertManagedHostInstruction(undefined, 'first')
    expect(first).toContain('first')
    const updated = upsertManagedHostInstruction(`${first}# keep me\n`, 'second')
    expect(updated).toContain('second')
    expect(updated).not.toContain('first')
    expect(updated).toContain('# keep me')
  })

  it('refuses an unknown host with the connected names', () => {
    expect(unknownDesktopHubHostMessage('TEMPLEOFDOOM', ['ubuntu-server-local'])).toContain(
      'ubuntu-server-local'
    )
    expect(unknownDesktopHubHostMessage('TEMPLEOFDOOM', [])).toContain(
      'will not run this command locally'
    )
  })
})
