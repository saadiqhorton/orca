import { describe, expect, it, vi } from 'vitest'
import { assertCodexModelSupported } from './agent-launch-codex-model-gate'

describe('assertCodexModelSupported', () => {
  it('refuses gpt-6-luna on Codex 0.154.0', async () => {
    await expect(
      assertCodexModelSupported(
        { agent: 'codex', sessionOptions: { model: 'gpt-6-luna' } },
        async () => ({ status: 'ready' as const, version: '0.154.0' })
      )
    ).rejects.toMatchObject({ code: 'invalid_argument' })
  })

  it('allows gpt-6-luna on Codex 0.156.0', async () => {
    await expect(
      assertCodexModelSupported(
        { agent: 'codex', sessionOptions: { model: 'gpt-6-luna' } },
        async () => ({ status: 'ready' as const, version: '0.156.0' })
      )
    ).resolves.toBeUndefined()
  })

  it('refuses gpt-6.2-luna without probing Codex', async () => {
    const probe = vi.fn(async () => ({ status: 'ready' as const, version: '0.156.0' }))
    await expect(
      assertCodexModelSupported(
        { agent: 'codex', sessionOptions: { model: 'gpt-6.2-luna' } },
        probe
      )
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(probe).not.toHaveBeenCalled()
  })

  it('does not probe Codex for an unrecognized model id', async () => {
    const probe = vi.fn(async () => ({ status: 'ready' as const, version: '0.154.0' }))
    await expect(
      assertCodexModelSupported(
        { agent: 'codex', sessionOptions: { model: 'explicit-model' } },
        probe
      )
    ).resolves.toBeUndefined()
    expect(probe).not.toHaveBeenCalled()
  })
})
