import {
  DesktopHubError,
  desktopHubHostKey,
  isDesktopHubSelector
} from '../../../../../shared/orchestration/desktop-hub-contract'
import type { RuntimeOrchestrationEnvelope } from '../../../../../shared/runtime-rpc-envelope'
import { desktopHubOnSelector } from '../../../orchestration/desktop-hub/desktop-hub-route'
import { getDesktopHubRegistry } from '../../../orchestration/desktop-hub/desktop-hub-registry'

const HUB_CONTROL_PREFIX = 'orchestration.desktopHub.'

export type HubCallRuntime = {
  callOrchestrationWorkerServer: (
    selector: string,
    method: string,
    params: unknown,
    timeoutMs?: number,
    envelope?: RuntimeOrchestrationEnvelope
  ) => Promise<unknown>
}

export async function callDesktopHubHost(
  runtime: HubCallRuntime,
  params: {
    host: string
    method: string
    params?: unknown
    timeoutMs?: number
    envelope?: RuntimeOrchestrationEnvelope
  }
): Promise<unknown> {
  if (params.method.startsWith(HUB_CONTROL_PREFIX)) {
    throw new DesktopHubError(
      'invalid_argument',
      'Desktop hub control-plane methods cannot be forwarded to another host.'
    )
  }
  const on = await desktopHubOnSelector(runtime, params.host, undefined)
  if (!on) {
    throw new DesktopHubError('invalid_argument', 'Missing host for desktop hub call.')
  }
  const result = await runtime.callOrchestrationWorkerServer(
    on,
    params.method,
    params.params ?? {},
    params.timeoutMs,
    params.envelope
  )
  getDesktopHubRegistry(runtime).rememberSessionHandles(
    isDesktopHubSelector(on) ? desktopHubHostKey(on) : on,
    result
  )
  return result
}
