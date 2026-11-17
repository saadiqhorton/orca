import { DesktopHubError } from '../../../../../shared/orchestration/desktop-hub-contract'
import { desktopHubOnSelector } from '../../../orchestration/desktop-hub/desktop-hub-route'

const HUB_CONTROL_PREFIX = 'orchestration.desktopHub.'

type HubCallRuntime = {
  callOrchestrationWorkerServer: (
    selector: string,
    method: string,
    params: unknown,
    timeoutMs?: number,
    envelope?: unknown
  ) => Promise<unknown>
}

export async function callDesktopHubHost(
  runtime: HubCallRuntime,
  params: {
    host: string
    method: string
    params?: unknown
    timeoutMs?: number
    envelope?: unknown
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
  return runtime.callOrchestrationWorkerServer(
    on,
    params.method,
    params.params ?? {},
    params.timeoutMs,
    params.envelope
  )
}
