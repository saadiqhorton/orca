import { z } from 'zod'

export const DesktopHubCallParams = z.object({
  host: z.string().min(1).max(256),
  method: z.string().min(1).max(200),
  params: z.unknown().optional(),
  timeoutMs: z.number().int().positive().max(30 * 60 * 1000).optional()
})

export const OrchestrationSurfaceEnsureScratchParams = z.object({
  name: z.string().min(1).max(64).optional()
})
