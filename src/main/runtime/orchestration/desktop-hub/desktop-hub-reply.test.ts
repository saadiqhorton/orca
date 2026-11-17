import { describe, expect, it, vi } from 'vitest'
import type { DesktopHubRequestEvent } from '../../../../shared/orchestration/desktop-hub-contract'
import type { RemoteRuntimeSharedSubscription } from '../../../../shared/remote-runtime/control/remote-runtime-shared-control-types'
import {
  createDesktopHubDeliver,
  DESKTOP_HUB_ANSWER_METHOD,
  DESKTOP_HUB_ANSWER_TIMEOUT_MS,
  sendDesktopHubAnswer
} from './desktop-hub-reply'

function sharedControlSubscription(): RemoteRuntimeSharedSubscription {
  return {
    requestId: 'sub-shared-control',
    close: () => undefined,
    sendBinary: () => false
  }
}

function hubRequest(requestId: string): DesktopHubRequestEvent {
  return { type: 'orchestrationHubRequested', requestId, op: 'list' }
}

describe('desktop hub answers over shared control', () => {
  it('sends orchestration.desktopHub.answer when the subscription has no sendRequest', async () => {
    const subscription = sharedControlSubscription()
    expect(subscription).not.toHaveProperty('sendRequest')
    const callEnvironment = vi.fn(async () => ({ ok: true, result: { accepted: true } }))
    await sendDesktopHubAnswer({
      subscription,
      requestId: 'req-list-1',
      answer: { ok: true, result: { hosts: [{ name: 'ubuntu-server-local' }] } },
      callEnvironment
    })
    expect(callEnvironment).toHaveBeenCalledOnce()
    expect(callEnvironment).toHaveBeenCalledWith(
      DESKTOP_HUB_ANSWER_METHOD,
      {
        requestId: 'req-list-1',
        ok: true,
        result: { hosts: [{ name: 'ubuntu-server-local' }] }
      },
      DESKTOP_HUB_ANSWER_TIMEOUT_MS
    )
  })

  it('delivers as soon as the shared-control subscription is open', () => {
    const sent: string[] = []
    const open: { current: RemoteRuntimeSharedSubscription | null } = { current: null }
    const { deliver, flush } = createDesktopHubDeliver({
      isOpen: () => open.current !== null,
      send: (event) => {
        sent.push(event.requestId)
      }
    })
    deliver(hubRequest('queued-before-open'))
    expect(sent).toEqual([])
    open.current = sharedControlSubscription()
    flush()
    deliver(hubRequest('after-open'))
    expect(sent).toEqual(['queued-before-open', 'after-open'])
  })
})
