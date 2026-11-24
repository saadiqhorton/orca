import type {
  OrchestrationEnvironmentTransport,
  OrchestrationWorkerServer
} from '../federation/environment-transport'
import { isDesktopHubSelector } from '../../../../shared/orchestration/desktop-hub-contract'
import { getDesktopHubRegistry, type DesktopHubRegistry } from './desktop-hub-registry'

/** `dhub:` ids dial through the paired desktop. Every other id stays on the transport this runtime already had. */
export function wrapDesktopHubTransport(
  inner: OrchestrationEnvironmentTransport | null,
  runtime: object
): OrchestrationEnvironmentTransport | null {
  if (!inner) {
    return null
  }
  const registry = (): DesktopHubRegistry => getDesktopHubRegistry(runtime)
  return {
    async resolve(selector: string): Promise<OrchestrationWorkerServer> {
      if (!isDesktopHubSelector(selector)) {
        return inner.resolve(selector)
      }
      const placed = registry().resolveCached(selector)
      return {
        environmentId: placed.selector,
        name: placed.name,
        peerFingerprint: placed.peerFingerprint ?? '',
        ...(placed.homePeerFingerprint ? { homePeerFingerprint: placed.homePeerFingerprint } : {}),
        ...(placed.pairingRevision !== undefined ? { pairingRevision: placed.pairingRevision } : {})
      }
    },
    async hasEnvironment(environmentId: string): Promise<boolean> {
      if (isDesktopHubSelector(environmentId)) {
        return registry().hasPlacement(environmentId) || registry().hasVolunteer()
      }
      return (await inner.hasEnvironment?.(environmentId)) ?? true
    },
    call(selector, method, params, timeoutMs, envelope, revision, send) {
      if (!isDesktopHubSelector(selector)) {
        return inner.call(selector, method, params, timeoutMs, envelope, revision, send)
      }
      return registry().call(selector, method, params, timeoutMs, envelope)
    },
    onEnvironmentVerified(listener) {
      return inner.onEnvironmentVerified?.(listener) ?? (() => {})
    }
  }
}
