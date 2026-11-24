import { describe, expect, it } from 'vitest'
import { resolveFleetWorkerOutcome } from './orchestration-fleet-outcome-resolution'

describe('resolveFleetWorkerOutcome', () => {
  it('does not treat a user-stopped worker as failed just because dispatch status is failed', () => {
    expect(
      resolveFleetWorkerOutcome({
        workerState: 'stopped',
        dispatchStatus: 'failed'
      })
    ).toBe('in_progress')
  })

  it('still reports a worker that actually failed', () => {
    expect(
      resolveFleetWorkerOutcome({
        workerState: 'failed',
        dispatchStatus: 'failed'
      })
    ).toBe('failed')
  })
})
