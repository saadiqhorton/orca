import { describe, expect, it } from 'vitest'
import { checkCodexModelAgainstVersion, normalizeCodexModelId } from './codex-model-version-gate'

describe('checkCodexModelAgainstVersion', () => {
  it('maps spoken names onto provider ids', () => {
    expect(normalizeCodexModelId('gpt 6 luna')).toBe('gpt-6-luna')
  })

  it('refuses gpt-6-sol and gpt-6-luna on Codex older than 0.156.0', () => {
    const check = checkCodexModelAgainstVersion('gpt-6-luna', '0.154.0')
    expect(check.status).toBe('tooOld')
    if (check.status === 'tooOld') {
      expect(check.minimumVersion).toBe('0.156.0')
    }
    expect(checkCodexModelAgainstVersion('gpt-6-sol', '0.156.0').status).toBe('ok')
  })

  it('refuses dotted gpt-6.N ids as known-bad', () => {
    const check = checkCodexModelAgainstVersion('gpt-6.2-luna', '0.156.0')
    expect(check.status).toBe('refused')
  })

  it('warns on an unrecognized well-formed model id', () => {
    const check = checkCodexModelAgainstVersion('custom-codex-model', '0.156.0')
    expect(check.status).toBe('unknown')
  })
})
