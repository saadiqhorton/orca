import { describe, expect, it } from 'vitest'
import { projectOrchestrationFleetAttention } from './orchestration-fleet-attention'

const exited = { verdict: 'exited' as const }

describe('projectOrchestrationFleetAttention', () => {
  it('does not report a user-stopped worker as a failure', () => {
    const attention = projectOrchestrationFleetAttention({
      isRoot: false,
      outcome: 'failed',
      interrupted: true,
      operatorStopped: true,
      liveness: exited
    })
    expect(attention.categories).toEqual(['interruption'])
    expect(attention.requiresAction).toBe(true)
  })

  it('still reports a failed worker that was not stopped', () => {
    const attention = projectOrchestrationFleetAttention({
      isRoot: false,
      outcome: 'failed',
      liveness: exited
    })
    expect(attention.categories).toEqual(['failure'])
    expect(attention.requiresAction).toBe(true)
  })
})
