import { describe, expect, it } from 'vitest'
import {
  formatOrcaHostListStamp,
  formatOrcaHostPreamble,
  formatOrcaHostsEnv,
  parseOrcaHostsEnv,
  removeManagedHostInstruction,
  unknownDesktopHubHostMessage,
  upsertManagedHostInstruction
} from './orca-host-awareness'

describe('orca host awareness copy', () => {
  it('names connected machines and forbids ssh', () => {
    const now = new Date('2026-11-17T18:23:00.000Z')
    const preamble = formatOrcaHostPreamble(['dockhand', 'ubuntu-server-local'], now)
    expect(preamble).toContain('You run inside Orca.')
    expect(preamble).toContain('dockhand, ubuntu-server-local')
    expect(preamble).toContain('never ssh')
    expect(preamble).toContain('orca host inventory --json')
    expect(preamble).toContain('Host list as of 2026-11-17T18:00Z')
    expect(formatOrcaHostListStamp(now)).toBe('2026-11-17T18:00Z')
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
    expect(removeManagedHostInstruction(updated)).toContain('# keep me')
    expect(removeManagedHostInstruction(updated)).not.toContain('orca-managed:host-preamble')
  })

  it('removeManagedHostInstruction is the inverse of an append upsert', () => {
    const original = '# mine\n\n\nthree-newline gap above\n'
    expect(removeManagedHostInstruction(upsertManagedHostInstruction(original, 'p'))).toBe(
      original
    )
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
