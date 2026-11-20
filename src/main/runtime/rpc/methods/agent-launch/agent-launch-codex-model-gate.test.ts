import { describe, expect, it } from 'vitest'
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
})
