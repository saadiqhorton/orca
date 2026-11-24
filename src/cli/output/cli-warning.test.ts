import { afterEach, describe, expect, it, vi } from 'vitest'
import { emitCliWarning, mergeCliWarning } from './cli-warning'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('emitCliWarning', () => {
  it('keeps --json stdout empty and returns the warning for the JSON payload', () => {
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {})
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const warning = emitCliWarning(
      `Unrecognized Codex model id "bogus-model-xyz". Launch will continue; the first-turn watcher will fail it if the agent rejects the model.`,
      true
    )
    expect(warning).toContain('bogus-model-xyz')
    expect(stdout).not.toHaveBeenCalled()
    expect(stderr).not.toHaveBeenCalled()
    expect(() => JSON.parse(JSON.stringify({ ok: true, result: { warning } }))).not.toThrow()
  })

  it('prints text-mode warnings to stderr, including a Windows path', () => {
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {})
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(
      emitCliWarning('scratch at C:\\Users\\Saadiq\\orca-orchestration may already exist', false)
    ).toBeUndefined()
    expect(stdout).not.toHaveBeenCalled()
    expect(String(stderr.mock.calls[0]?.[0])).toMatch(/^warning: /)
    expect(String(stderr.mock.calls[0]?.[0])).toContain('C:\\Users\\Saadiq\\orca-orchestration')
  })

  it('merges a CLI warning into an existing runtime warning', () => {
    expect(mergeCliWarning('reveal timed out', 'unrecognized model')).toBe(
      'reveal timed out unrecognized model'
    )
    expect(mergeCliWarning(undefined, 'unrecognized model')).toBe('unrecognized model')
    expect(mergeCliWarning('reveal timed out', undefined)).toBe('reveal timed out')
  })
})
