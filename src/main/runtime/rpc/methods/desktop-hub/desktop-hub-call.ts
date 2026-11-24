import {
  DesktopHubError,
  desktopHubHostKey,
  isDesktopHubSelector
} from '../../../../../shared/orchestration/desktop-hub-contract'
import { assertDesktopHubForwardableMethod } from '../../../../../shared/orchestration/desktop-hub-forwardable-methods'
import type { RuntimeOrchestrationEnvelope } from '../../../../../shared/remote-runtime/rpc/runtime-rpc-envelope'
import { desktopHubOnSelector } from '../../../orchestration/desktop-hub/desktop-hub-route'
import { getDesktopHubRegistry } from '../../../orchestration/desktop-hub/desktop-hub-registry'

export type HubCallRuntime = {
  callOrchestrationWorkerServer: (
    selector: string,
    method: string,
    params: unknown,
    timeoutMs?: number,
    envelope?: RuntimeOrchestrationEnvelope
  ) => Promise<unknown>
  dispatchLocalRpc?: (
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
  assertDesktopHubForwardableMethod(params.method)
  const on = await desktopHubOnSelector(runtime, params.host, undefined)
  if (!on) {
    if (!runtime.dispatchLocalRpc) {
      throw new DesktopHubError('invalid_argument', 'Missing host for desktop hub call.')
    }
    return runtime.dispatchLocalRpc(
      params.method,
      params.params ?? {},
      params.timeoutMs,
      params.envelope
    )
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
