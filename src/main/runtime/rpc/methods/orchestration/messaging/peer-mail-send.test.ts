import { describe, expect, it, vi } from 'vitest'
import { sendStaysOnHomeRun, withPeerMailSend } from './peer-mail-send'

vi.mock('../../../../orchestration/desktop-hub/desktop-hub-route', () => ({
  routeDesktopHubCommand: async (_runtime: unknown, params: { host?: string; on?: string }) => ({
    ...params,
    on: params.host ? `dhub:${params.host}` : params.on,
    host: undefined
  })
}))

describe('sendStaysOnHomeRun', () => {
  it('keeps dispatch, run, and task addresses on the caller even with --host', () => {
    expect(sendStaysOnHomeRun('dispatch:ctx_1', {})).toBe(true)
    expect(sendStaysOnHomeRun('run:run_1', {})).toBe(true)
    expect(sendStaysOnHomeRun('task:task_1', {})).toBe(true)
  })

  it('keeps a bare Dispatch id that this Orca owns', () => {
    expect(
      sendStaysOnHomeRun('ctx_owned', {
        getOrchestrationDb: () => ({
          getDispatchContextById: (id: string) => (id === 'ctx_owned' ? {} : null)
        })
      })
    ).toBe(true)
    expect(
      sendStaysOnHomeRun('ctx_other', {
        getOrchestrationDb: () => ({ getDispatchContextById: () => null })
      })
    ).toBe(false)
  })

  it('leaves a live tab address for peer mail on the named host', () => {
    expect(sendStaysOnHomeRun('term_visible', { getOrchestrationDb: () => ({}) })).toBe(false)
  })
})

describe('withPeerMailSend', () => {
  it('strips --host when --to names a Dispatch on this run', async () => {
    const send = vi.fn(async (params: { to?: string; on?: string; host?: string }) => params)
    const handler = withPeerMailSend(send as never)
    const runtime = {
      getOrchestrationDb: () => ({
        getDispatchContextById: (id: string) => (id === 'ctx_home' ? { id } : null)
      })
    }
    await handler(
      { to: 'ctx_home', subject: 'ping', host: 'ubuntu-server-local' } as never,
      { runtime, replayedMutationReceipt: undefined } as never
    )
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ctx_home', on: undefined, host: undefined }),
      expect.anything()
    )
  })
})
