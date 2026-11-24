import { defineOrchestrationMethod } from '../access/orchestration-method-access'
import { OrchestrationSurfaceEnsureScratchParams } from '../../../../../../shared/rpc-contract/orchestration/desktop-hub-call-params'
import { ensureOrchestrationScratchWorkspace } from './ensure-orchestration-scratch'
import { collectHostSurfaceInventory } from './orchestration-surface-inventory'

/** Host-local surfaces the desktop hub forwards: scratch projects and a one-shot inventory. */
export const ORCHESTRATION_SURFACE_METHODS = [
  defineOrchestrationMethod({
    name: 'orchestration.surface.ensureScratch',
    permission: 'workspace',
    params: OrchestrationSurfaceEnsureScratchParams,
    access: { kind: 'localOnly', targets: {} },
    handler: async (params, ctx) => ensureOrchestrationScratchWorkspace(ctx.runtime, params)
  }),
  defineOrchestrationMethod({
    name: 'orchestration.surface.inventory',
    permission: 'workspace',
    params: null,
    access: { kind: 'localOnly', targets: {} },
    handler: async (_params, ctx) => collectHostSurfaceInventory(ctx.runtime)
  })
]
