import { describe, expect, it } from 'vitest'
import { removeManagedHostInstruction, upsertManagedHostInstruction } from './orca-host-awareness'

describe('box-safety-probe: turning off global instructions is byte-exact', () => {
  it('strips only the managed block and the separator upsert added', () => {
    const original = '# mine\n\n\nthree-newline gap above\n'
    const withBlock = upsertManagedHostInstruction(original, 'Connected machines: dockhand.')
    expect(withBlock).toContain('orca-managed:host-preamble')
    expect(withBlock.startsWith(original)).toBe(true)
    expect(removeManagedHostInstruction(withBlock)).toBe(original)
  })

  it('does not invent a trailing newline or collapse blank-line runs in surrounding text', () => {
    const original = '# keep\n\n\n\nfour blanks then text\n\n'
    expect(removeManagedHostInstruction(upsertManagedHostInstruction(original, 'p'))).toBe(original)
  })

  it('an empty file that only held the managed block becomes empty, not a leftover newline', () => {
    expect(removeManagedHostInstruction(upsertManagedHostInstruction(undefined, 'p'))).toBe('')
    expect(removeManagedHostInstruction(upsertManagedHostInstruction('', 'p'))).toBe('')
  })

  it('a file with no trailing newline is identical after enable then disable', () => {
    const original = 'no newline at end'
    expect(original.endsWith('\n')).toBe(false)
    expect(removeManagedHostInstruction(upsertManagedHostInstruction(original, 'p'))).toBe(original)
  })

  it('a whitespace-only file is identical after enable then disable', () => {
    const original = '\n\n\n'
    expect(removeManagedHostInstruction(upsertManagedHostInstruction(original, 'p'))).toBe(original)
  })
})
