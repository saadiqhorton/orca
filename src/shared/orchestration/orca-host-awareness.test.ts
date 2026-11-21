import { describe, expect, it } from 'vitest'
import {
  formatOrcaHostPreamble,
  formatOrcaHostsEnv,
  parseOrcaHostsEnv,
  removeManagedHostInstruction,
  unknownDesktopHubHostMessage,
  upsertManagedHostInstruction
} from './orca-host-awareness'

describe('orca host awareness copy', () => {
  it('names connected machines and forbids ssh', () => {
    const preamble = formatOrcaHostPreamble()
    expect(preamble).toContain('Never use ssh')
    expect(preamble).toContain('orca host inventory --json')
    expect(preamble).toContain('pass its selector as --worktree')
    expect(preamble).toContain('never leave placeholders or shell variables unset')
    expect(preamble).toContain('gpt 6 luna maps to gpt-6-luna')
    expect(preamble).toContain('orca terminal read --terminal')
    expect(preamble).toContain('Copy handles exactly')
    expect(preamble).not.toMatch(/Host list as of|Connected machines/)
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
    expect(removeManagedHostInstruction(upsertManagedHostInstruction(original, 'p'))).toBe(original)
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
