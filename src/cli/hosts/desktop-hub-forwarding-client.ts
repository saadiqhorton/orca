import { randomUUID } from 'node:crypto'
import {
  isDurableMutation,
  isTerminalPromptMutation
} from '../../shared/orchestration/orchestration-rpc-contract'
import { ORCHESTRATION_CONTRACT_VERSION } from '../../shared/orchestration/orchestration-runtime-capabilities'
import { projectRemoteAppStatus } from '../../shared/remote-runtime/session-graph/cli-app-status-projection'
import { runtimeHostConnectionState } from '../../shared/remote-runtime/host-status/runtime-host-connection-state'
import type {
  CliStatusResult,
  RuntimeStatus
} from '../../shared/remote-runtime/session-graph/runtime-session-contracts'
import type { RuntimeRpcSuccess } from '../../shared/remote-runtime/rpc/runtime-rpc-envelope'
import type { RuntimeClient } from '../runtime/client'
import type { RuntimeCallOptions } from '../runtime/connection/types'
import { desktopHubClientTimeoutMs, desktopHubForwardTimeoutMs } from './desktop-hub-call-timeout'

const HUB_CONTROL_PREFIX = 'orchestration.desktopHub.'

function hubEnvelope(
  method: string,
  params: unknown,
  options?: RuntimeCallOptions
): Record<string, unknown> | undefined {
  const terminalPromptMutation = isTerminalPromptMutation(method, params)
  const durableMutation =
    options?.legacyTerminalPrompt !== true && isDurableMutation(method, params)
  if (!terminalPromptMutation && !durableMutation) {
    return options?.orchestrationCapability
      ? { orchestrationCapability: options.orchestrationCapability }
      : undefined
  }
  return {
    orchestrationRequestId: options?.orchestrationRequestId ?? randomUUID(),
    ...(method.startsWith('orchestration.')
      ? { orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION }
      : {}),
    ...(options?.orchestrationCapability
      ? { orchestrationCapability: options.orchestrationCapability }
      : {})
  }
}

function cliStatusFromRuntime(
  response: RuntimeRpcSuccess<RuntimeStatus>,
  host: string
): RuntimeRpcSuccess<CliStatusResult> {
  const graphState = response.result.graphStatus
  return {
    id: response.id,
    ok: true,
    result: {
      target: { kind: 'environment', environment: host },
      app: projectRemoteAppStatus(response.result),
      runtime: {
        state: graphState === 'ready' ? 'ready' : 'graph_not_ready',
        reachable: true,
        connectionState: runtimeHostConnectionState({
          hasStatusEntry: true,
          status: response.result
        }),
        runtimeId: response.result.runtimeId,
        ...(response.result.appVersion ? { appVersion: response.result.appVersion } : {}),
        ...(response.result.remoteUpdateSupport
          ? { remoteUpdateSupport: response.result.remoteUpdateSupport }
          : {}),
        ...(response.result.capabilities ? { capabilities: response.result.capabilities } : {}),
        ...(response.result.degradations ? { degradations: response.result.degradations } : {})
      },
      graph: { state: graphState }
    },
    _meta: response._meta
  }
}

/** Every RPC except hub control-plane methods runs on the named desktop-connected host. */
export function wrapDesktopHubClient(inner: RuntimeClient, host: string): RuntimeClient {
  const wrapped = Object.create(inner) as RuntimeClient
  Object.defineProperty(wrapped, 'isRemote', { get: () => true })
  wrapped.call = async <TResult>(
    method: string,
    params?: unknown,
    options?: RuntimeCallOptions
  ): Promise<RuntimeRpcSuccess<TResult>> => {
    if (method.startsWith(HUB_CONTROL_PREFIX)) {
      return inner.call<TResult>(method, params, options)
    }
    const envelope = hubEnvelope(method, params, options)
    const timeoutMs = desktopHubForwardTimeoutMs(method, options?.timeoutMs)
    const callOptions =
      timeoutMs !== undefined
        ? { ...options, timeoutMs: desktopHubClientTimeoutMs(timeoutMs) }
        : options
    return inner.call<TResult>(
      'orchestration.desktopHub.call',
      {
        host,
        method,
        params: params ?? {},
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(envelope ? { envelope } : {})
      },
      callOptions
    )
  }
  wrapped.getCliStatus = async () => {
    const response = await wrapped.call<RuntimeStatus>('status.get')
    return cliStatusFromRuntime(response, host)
  }
  return wrapped
}
