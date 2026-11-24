import type { DesktopHubRequestEvent } from '../../../../shared/orchestration/desktop-hub-contract'

export const DESKTOP_HUB_ANSWER_METHOD = 'orchestration.desktopHub.answer' as const
export const DESKTOP_HUB_ANSWER_TIMEOUT_MS = 15_000

export type DesktopHubAnswerTransport = {
  sendRequest?: (method: string, params: unknown, timeoutMs: number) => Promise<unknown>
}

export type DesktopHubAnswerCall = (
  method: typeof DESKTOP_HUB_ANSWER_METHOD,
  params: { requestId: string } & Record<string, unknown>,
  timeoutMs: number
) => Promise<unknown>

export type DesktopHubAnswerBody = {
  ok: boolean
  result?: unknown
  error?: { code: string; message: string }
}

/** Shared-control subscriptions have no sendRequest; one-shot RPCs still reach the runtime. */
export async function sendDesktopHubAnswer(input: {
  subscription: DesktopHubAnswerTransport | object
  requestId: string
  answer: DesktopHubAnswerBody
  callEnvironment?: DesktopHubAnswerCall
}): Promise<void> {
  const params = { requestId: input.requestId, ...input.answer }
  const transport = input.subscription
  if ('sendRequest' in transport && typeof transport.sendRequest === 'function') {
    await transport.sendRequest(DESKTOP_HUB_ANSWER_METHOD, params, DESKTOP_HUB_ANSWER_TIMEOUT_MS)
    return
  }
  if (!input.callEnvironment) {
    return
  }
  await input.callEnvironment(DESKTOP_HUB_ANSWER_METHOD, params, DESKTOP_HUB_ANSWER_TIMEOUT_MS)
}

/** Queue until the hub socket is open. Shared-control sockets still count as open. */
export function createDesktopHubDeliver(input: {
  isOpen: () => boolean
  send: (event: DesktopHubRequestEvent) => void
}): { deliver: (event: DesktopHubRequestEvent) => void; flush: () => void } {
  const queued: DesktopHubRequestEvent[] = []
  const deliver = (event: DesktopHubRequestEvent): void => {
    if (!input.isOpen()) {
      queued.push(event)
      return
    }
    input.send(event)
  }
  return {
    deliver,
    flush: () => {
      for (const event of queued.splice(0)) {
        input.send(event)
      }
    }
  }
}
