import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClientError } from '../runtime/connection/types'
import { reportCliError } from './cli-error'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('reportCliError', () => {
  it('includes dispatchId, handle, and host in the JSON error payload', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    reportCliError(
      new RuntimeClientError('agent_blocked_on_prompt', 'first turn failed', {
        dispatchId: 'ctx_abc',
        handle: 'term_worker',
        host: 'ubuntu-server-local',
        blockedReason: 'agent_turn_failed:model_not_found'
      }),
      true
    )
    const printed = String(log.mock.calls[0]?.[0])
    const payload = JSON.parse(printed) as {
      error: { code: string; data: Record<string, unknown> }
    }
    expect(payload.error.code).toBe('agent_blocked_on_prompt')
    expect(payload.error.data).toMatchObject({
      dispatchId: 'ctx_abc',
      handle: 'term_worker',
      host: 'ubuntu-server-local',
      blockedReason: 'agent_turn_failed:model_not_found'
    })
  })
})
