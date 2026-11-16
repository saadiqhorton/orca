import {
  DESKTOP_HUB_SESSION_REFUSED_MESSAGE,
  DesktopHubAnswerParams,
  DesktopHubError
} from '../../../../../shared/orchestration/desktop-hub-contract'
import { getDesktopHubRegistry } from '../../../orchestration/desktop-hub/desktop-hub-registry'
import { readDesktopHubCatalogProvider } from '../../../orchestration/desktop-hub/desktop-hub-provider'
import { defineOrchestrationMethod } from '../orchestration/access/orchestration-method-access'

/**
 * Routing control plane, not a Run mutation. A local CLI session may list and place.
 * Only the paired desktop that registered as the hub may answer.
 */
export const DESKTOP_HUB_METHODS = [
  defineOrchestrationMethod({
    name: 'orchestration.desktopHub.list',
    permission: 'workspace',
    params: null,
    access: { kind: 'localOnly', targets: {} },
    handler: async (_params, ctx) => {
      const registry = getDesktopHubRegistry(ctx.runtime)
      registry.assertCaller({ pairedDeviceId: ctx.pairedDeviceId })
      const provider = readDesktopHubCatalogProvider()
      if (provider && !registry.hasVolunteer()) {
        const catalog = await provider()
        return { hub: 'desktop' as const, hosts: catalog.hosts }
      }
      return registry.list()
    }
  }),
  defineOrchestrationMethod({
    name: 'orchestration.desktopHub.answer',
    permission: 'workspace',
    params: DesktopHubAnswerParams,
    access: { kind: 'localOnly', targets: {} },
    handler: async (params, ctx) => {
      if (!ctx.pairedDeviceId) {
        throw new DesktopHubError('session_refused', DESKTOP_HUB_SESSION_REFUSED_MESSAGE)
      }
      return getDesktopHubRegistry(ctx.runtime).answer(ctx.pairedDeviceId, params)
    }
  })
]
