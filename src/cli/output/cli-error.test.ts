import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClientError } from '../runtime/types'
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
    expect(printed).toContain('ctx_abc')
    expect(printed).toContain('term_worker')
    expect(printed).toContain('ubuntu-server-local')
  })
})
