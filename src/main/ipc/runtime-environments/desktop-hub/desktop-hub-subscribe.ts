import { ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES } from '../../../../shared/remote-runtime/protocol/electron-remote-runtime-client-capabilities'
import type {
  DesktopHubCatalog,
  DesktopHubRequestEvent
} from '../../../../shared/orchestration/desktop-hub-contract'
import { getPreferredPairedRuntimeConnection } from '../../../../shared/remote-runtime/host-catalog/runtime-environments'
import '../../../../shared/remote-runtime/requests/remote-runtime-request-socket'
import { subscribeRemoteRuntimeTransport } from '../../../../shared/remote-runtime/requests/remote-runtime-subscription-transport'
import type { RemoteRuntimeTransportSubscription } from '../../../../shared/remote-runtime/requests/remote-runtime-subscription-contract'
import type {
  RuntimeOrchestrationEnvelope,
  RuntimeRpcResponse
} from '../../../../shared/remote-runtime/rpc/runtime-rpc-envelope'
import { answerDesktopHubRequest } from '../../../runtime/orchestration/desktop-hub/desktop-hub-answer'
import {
  createDesktopHubDeliver,
  sendDesktopHubAnswer
} from '../../../runtime/orchestration/desktop-hub/desktop-hub-reply'
import { resolveManagedRuntimeEnvironment } from '../managed-orcad/runtime-environment-managed-tunnel'
import { callRuntimeEnvironment } from '../requests/runtime-environment-transport-routing'

export type DesktopHubSubscriptionOptions = {
  userDataPath: string
  environmentId: string
  identity: { appInstallationId: string; userId: string }
  catalog: () => DesktopHubCatalog | Promise<DesktopHubCatalog>
  callLocal: (
    method: string,
    params: unknown,
    envelope: unknown
  ) => Promise<{ ok: boolean; result?: unknown; error?: { code: string; message: string } }>
  onStopped: () => void
}

/** Dedicated raw client-event socket. Shared-control subscriptions cannot send hub answers. */
export function openHubSubscription(options: DesktopHubSubscriptionOptions): () => void {
  const controller = new AbortController()
  let subscription: RemoteRuntimeTransportSubscription | null = null
  const { deliver, flush } = createDesktopHubDeliver({
    isOpen: () => subscription !== null,
    send: (event) => {
      void answerAndSend(options, subscription, event)
    }
  })
  const onHubEvent = (payload: { ok: boolean; result?: unknown }): void => {
    if (payload.ok && isHubRequest(payload.result)) {
      deliver(payload.result)
    }
  }
  void subscribeRawHub(options, controller, onHubEvent).then(
    (opened) => {
      if (controller.signal.aborted) {
        opened.close()
        return
      }
      subscription = opened
      flush()
    },
    () => {
      if (!controller.signal.aborted) {
        options.onStopped()
      }
    }
  )
  return () => {
    controller.abort()
    subscription?.close()
  }
}

async function subscribeRawHub(
  input: DesktopHubSubscriptionOptions,
  controller: AbortController,
  onHubEvent: (payload: { ok: boolean; result?: unknown }) => void
): Promise<RemoteRuntimeTransportSubscription> {
  const environment = await resolveManagedRuntimeEnvironment(
    input.userDataPath,
    input.environmentId,
    undefined,
    'runtime.clientEvents.subscribe',
    controller.signal
  )
  const conn = getPreferredPairedRuntimeConnection(environment)
  return subscribeRemoteRuntimeTransport(
    conn,
    'runtime.clientEvents.subscribe',
    { orchestrationHub: input.identity },
    15_000,
    {
      onResponse: (response) => onHubEvent(response),
      onError: () => undefined,
      onClose: () => {
        if (!controller.signal.aborted) {
          controller.abort()
          input.onStopped()
        }
      }
    },
    { clientCapabilities: ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES, signal: controller.signal }
  )
}

async function answerAndSend(
  options: DesktopHubSubscriptionOptions,
  subscription: RemoteRuntimeTransportSubscription | null,
  event: DesktopHubRequestEvent
): Promise<void> {
  const answer = await answerDesktopHubRequest({
    request: event,
    catalog: options.catalog,
    callHost: (placement, method, params, timeoutMs, envelope) =>
      callRuntimeEnvironment(
        options.userDataPath,
        placement.hostKey,
        method,
        params,
        timeoutMs,
        placement.pairingRevision,
        hubCallEnvelope(envelope)
      ),
    callLocal: async (_placement, method, params, _timeoutMs, envelope) => {
      const response = await options.callLocal(method, params, envelope)
      return hubLocalResponse(response)
    }
  })
  await sendDesktopHubAnswer({
    subscription: subscription ?? {},
    requestId: event.requestId,
    answer,
    callEnvironment: (method, params, timeoutMs) =>
      callRuntimeEnvironment(options.userDataPath, options.environmentId, method, params, timeoutMs)
  })
}

function hubCallEnvelope(envelope: unknown): RuntimeOrchestrationEnvelope | undefined {
  if (envelope == null || typeof envelope !== 'object') {
    return undefined
  }
  const record = envelope
  const parsed: RuntimeOrchestrationEnvelope = {}
  if ('orchestrationRequestId' in record && typeof record.orchestrationRequestId === 'string') {
    parsed.orchestrationRequestId = record.orchestrationRequestId
  }
  if (
    'orchestrationContractVersion' in record &&
    typeof record.orchestrationContractVersion === 'number'
  ) {
    parsed.orchestrationContractVersion = record.orchestrationContractVersion
  }
  if ('orchestrationCapability' in record && typeof record.orchestrationCapability === 'string') {
    parsed.orchestrationCapability = record.orchestrationCapability
  }
  return parsed.orchestrationRequestId ||
    parsed.orchestrationContractVersion !== undefined ||
    parsed.orchestrationCapability
    ? parsed
    : undefined
}

function hubLocalResponse(response: {
  ok: boolean
  result?: unknown
  error?: { code: string; message: string }
}): RuntimeRpcResponse<unknown> {
  if (response.ok) {
    const success: RuntimeRpcResponse<unknown> = {
      id: '',
      ok: true,
      result: response.result,
      _meta: { runtimeId: '' }
    }
    return success
  }
  const failure: RuntimeRpcResponse<unknown> = {
    id: '',
    ok: false,
    error: response.error ?? {
      code: 'host_unreachable',
      message: 'Desktop hub local call failed.'
    }
  }
  return failure
}

function isHubRequest(value: unknown): value is DesktopHubRequestEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'orchestrationHubRequested' &&
    'requestId' in value &&
    typeof value.requestId === 'string' &&
    'op' in value &&
    (value.op === 'list' || value.op === 'resolve' || value.op === 'call')
  )
}
