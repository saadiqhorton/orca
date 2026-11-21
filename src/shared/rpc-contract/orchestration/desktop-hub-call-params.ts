import { z } from 'zod'

export const DesktopHubCallParams = z.object({
  host: z.string().min(1).max(256),
  method: z.string().min(1).max(200),
  params: z.unknown().optional(),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(30 * 60 * 1000)
    .optional(),
  envelope: z
    .object({
      orchestrationRequestId: z.string().min(1).max(200).optional(),
      orchestrationContractVersion: z.number().int().nonnegative().optional(),
      orchestrationCapability: z.string().min(1).max(200).optional()
    })
    .passthrough()
    .optional()
})

export const OrchestrationSurfaceEnsureScratchParams = z.object({
  name: z.string().min(1).max(64).optional()
})

export const DesktopHubLocateParams = z.object({
  handle: z.string().min(1).max(256)
})
