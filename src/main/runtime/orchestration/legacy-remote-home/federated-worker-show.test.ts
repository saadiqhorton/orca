import { describe, expect, it } from 'vitest'
import { shouldShowFederatedWorkerRemotely } from './federated-worker-show'

describe('shouldShowFederatedWorkerRemotely', () => {
  it('keeps a first-turn failure on the home record instead of a remote dispatch_not_found', () => {
    expect(
      shouldShowFederatedWorkerRemotely({
        state: 'failed',
        stage: 'agent_turn_failed:model_not_supported'
      })
    ).toBe(false)
    expect(
      shouldShowFederatedWorkerRemotely({
        state: 'ready',
        stage: 'remote_input_accepted'
      })
    ).toBe(true)
  })
})
