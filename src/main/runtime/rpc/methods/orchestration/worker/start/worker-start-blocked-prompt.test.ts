import { describe, expect, it } from 'vitest'
import { OrchestrationError } from '../../../../../orchestration/orchestration-error'
import { throwIfWorkerFirstTurnFailed } from './worker-start-blocked-prompt'

describe('throwIfWorkerFirstTurnFailed', () => {
  it('fails a worker whose first screen is model_not_found', async () => {
    await expect(
      throwIfWorkerFirstTurnFailed(
        {
          readTerminal: async () => ({
            text: 'ERROR: 400 model_not_found gpt-6-luna'
          })
        },
        'term_worker'
      )
    ).rejects.toMatchObject({
      code: 'agent_blocked_on_prompt'
    })
    try {
      await throwIfWorkerFirstTurnFailed(
        {
          readTerminal: async () => ({
            text: 'ERROR: 400 model_not_found gpt-6-luna'
          })
        },
        'term_worker'
      )
    } catch (error) {
      expect(error).toBeInstanceOf(OrchestrationError)
      expect((error as OrchestrationError).data).toMatchObject({
        blockedReason: 'agent_turn_failed:model_not_found'
      })
    }
  })

  it('lets a healthy first screen through', async () => {
    await expect(
      throwIfWorkerFirstTurnFailed(
        { readTerminal: async () => ({ text: 'thinking about the repo' }) },
        'term_worker'
      )
    ).resolves.toBeUndefined()
  })
})
