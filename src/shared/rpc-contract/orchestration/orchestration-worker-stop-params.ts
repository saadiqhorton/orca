import { z } from 'zod'
import { requiredString } from '../rpc-param-primitives'
import { normalizeDispatchId } from '../../orchestration/orchestration-dispatch-id'

export const WorkerDispatchParams = z.object({
  dispatch: requiredString('Missing --dispatch').transform(normalizeDispatchId)
})
