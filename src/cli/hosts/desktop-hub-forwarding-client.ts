import type { RuntimeClient } from '../runtime/client'
import type { RuntimeCallOptions, RuntimeRpcSuccess } from '../runtime/types'

const HUB_CONTROL_PREFIX = 'orchestration.desktopHub.'

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
    return inner.call<TResult>(
      'orchestration.desktopHub.call',
      {
        host,
        method,
        params: params ?? {},
        ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {})
      },
      options
    )
  }
  return wrapped
}
