import { describe, expect, it, vi } from 'vitest'
import {
  normalizeOrchestrationSendTo,
  sendStaysOnHomeRun,
  withPeerMailSend
} from './peer-mail-send'

vi.mock('../../../../orchestration/desktop-hub/desktop-hub-route', () => ({
  routeDesktopHubCommand: async (_runtime: unknown, params: { host?: string; on?: string }) => ({
    ...params,
    on: params.host ? `dhub:${params.host}` : params.on,
    host: undefined
  })
}))

describe('normalizeOrchestrationSendTo', () => {
  it('prefixes a bare ctx_ id as a Dispatch mailbox', () => {
    expect(normalizeOrchestrationSendTo('ctx_6098b1871ad2')).toBe('dispatch:ctx_6098b1871ad2')
    expect(normalizeOrchestrationSendTo('dispatch:ctx_6098b1871ad2')).toBe(
      'dispatch:ctx_6098b1871ad2'
    )
    expect(normalizeOrchestrationSendTo('term_visible')).toBe('term_visible')
  })
})

describe('sendStaysOnHomeRun', () => {
  it('keeps dispatch, run, and task addresses on the caller even with --host', () => {
    expect(sendStaysOnHomeRun('dispatch:ctx_1', {})).toBe(true)
    expect(sendStaysOnHomeRun('run:run_1', {})).toBe(true)
    expect(sendStaysOnHomeRun('task:task_1', {})).toBe(true)
  })

  it('keeps a bare ctx_ Dispatch id even when this host has no such row', () => {
    expect(sendStaysOnHomeRun('ctx_cf017fdf8e85', {})).toBe(true)
    expect(
      sendStaysOnHomeRun('ctx_other', {
        getOrchestrationDb: () => ({ getDispatchContextById: () => null })
      })
    ).toBe(true)
  })

  it('leaves a live tab address for peer mail on the named host', () => {
    expect(sendStaysOnHomeRun('term_visible', { getOrchestrationDb: () => ({}) })).toBe(false)
  })
})

describe('withPeerMailSend', () => {
  it('strips --host when --to is a bare ctx_ id', async () => {
    const send = vi.fn(async (params: { to?: string; on?: string; host?: string }) => params)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial RuntimeClient or DOMRect stub for a unit test.
    const handler = withPeerMailSend(send as never)
    await handler(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial RuntimeClient or DOMRect stub for a unit test.
      { to: 'ctx_home', subject: 'ping', host: 'ubuntu-server-local' } as never,
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial RuntimeClient or DOMRect stub for a unit test.
      { runtime: {}, replayedMutationReceipt: undefined } as never
    )
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'dispatch:ctx_home', on: undefined, host: undefined }),
      expect.anything()
    )
  })
})
