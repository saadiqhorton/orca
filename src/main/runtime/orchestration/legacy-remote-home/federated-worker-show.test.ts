import { describe, expect, it } from 'vitest'
import { shouldShowFederatedWorkerRemotely } from './federated-worker-show'

describe('shouldShowFederatedWorkerRemotely', () => {
  it('keeps a first-turn failure on the home record instead of a remote dispatch_not_found', () => {
    expect(shouldShowFederatedWorkerRemotely({ state: 'failed' })).toBe(false)
    expect(shouldShowFederatedWorkerRemotely({ state: 'ready' })).toBe(true)
  })
})
