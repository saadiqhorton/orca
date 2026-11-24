import { describe, expect, it, vi } from 'vitest'
import { refuseStartupDialogKeystrokes } from './terminal-send-startup-dialog'

describe('refuseStartupDialogKeystrokes', () => {
  it('refuses send into a Codex hooks dialog unless --answer-dialog', async () => {
    const client = {
      call: vi.fn(async () => ({
        id: '1',
        ok: true as const,
        result: {
          terminal: {
            handle: 'term_blocked',
            agentWait: { source: 'prompt-text', reason: 'agent-hooks-review-prompt' }
          }
        },
        _meta: { runtimeId: 'local' }
      }))
    }
    await expect(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial RuntimeClient or DOMRect stub for a unit test.
      refuseStartupDialogKeystrokes(client as never, 'term_blocked', new Map())
    ).rejects.toMatchObject({
      code: 'agent_blocked_on_prompt'
    })
    await expect(
      refuseStartupDialogKeystrokes(
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial RuntimeClient or DOMRect stub for a unit test.
        client as never,
        'term_blocked',
        new Map([['answer-dialog', true]])
      )
    ).resolves.toBeUndefined()
  })

  it('does not block an idle composer', async () => {
    const client = {
      call: vi.fn(async () => ({
        id: '1',
        ok: true as const,
        result: { terminal: { handle: 'term_ok', agentWait: null } },
        _meta: { runtimeId: 'local' }
      }))
    }
    await expect(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial RuntimeClient or DOMRect stub for a unit test.
      refuseStartupDialogKeystrokes(client as never, 'term_ok', new Map())
    ).resolves.toBeUndefined()
  })
})
