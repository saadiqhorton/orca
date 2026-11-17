import { describe, expect, it } from 'vitest'
import { launchPromptLooksSecret } from './agent-launch-secret-prompt'

describe('launch prompt secret heuristic', () => {
  it('flags token-like prompts and leaves ordinary task text alone', () => {
    expect(launchPromptLooksSecret('Review the deploy and report blockers')).toBe(false)
    expect(launchPromptLooksSecret('export TOKEN=sk-abcdefghijklmnopqrstuvwxyz')).toBe(true)
    expect(launchPromptLooksSecret('Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123')).toBe(
      true
    )
  })
})
