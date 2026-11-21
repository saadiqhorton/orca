import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from '../../../../../orchestration/db/orchestration-db'
import { FIRST_TURN_WATCH_MS } from '../../../agent-launch/agent-launch-first-turn-watch'
import {
  armWorkerFirstTurnFollowThrough,
  failWorkerFirstTurnAfterReady
} from './worker-start-first-turn-follow-through'

afterEach(() => {
  vi.useRealTimers()
})

function startingDispatch(db: OrchestrationDb): string {
  const task = db.createTask({ runId: 'run_legacy_local', spec: 'first-turn follow-through' })
  const started = db.createStartingWorkerDispatch({
    creator: { kind: 'system' },
    maxDepth: Number.MAX_SAFE_INTEGER,
    taskId: task.id,
    startOptions: { topology: 'current', agent: 'codex' }
  })
  db.prepareStartingWorkerAuthority({
    dispatchId: started.dispatch.id,
    handle: 'term_worker',
    paneKey: 'tab_follow:11111111-1111-4111-8111-111111111111',
    processIncarnation: 'pty-follow:22222222-2222-4222-8222-222222222222',
    worktreeId: 'repo::worktree',
    setupState: 'not_applicable',
    effects: []
  })
  db.markWorkerDispatchReady(started.dispatch.id)
  return started.dispatch.id
}

describe('worker-start first-turn follow-through', () => {
  it('fails a ready dispatch when the timer advances to 5s then a 400 arrives', async () => {
    vi.useFakeTimers()
    const db = new OrchestrationDb(':memory:')
    const dispatchId = startingDispatch(db)
    const startedAt = Date.now()
    armWorkerFirstTurnFollowThrough({
      runtime: {
        readTerminal: async () => {
          const elapsed = Date.now() - startedAt
          const seconds = Math.max(1, Math.floor(elapsed / 1000))
          const working = `>_ OpenAI Codex\nTASK submitted\n• Working (${seconds}s • esc to interrupt)`
          return {
            text:
              elapsed >= 5_000
                ? `${working}\nERROR: 400 model_not_found gpt-5.4`
                : working
          }
        },
        notifyMessageArrived: () => undefined
      },
      db,
      dispatchId,
      handle: 'term_worker',
      deadline: startedAt + FIRST_TURN_WATCH_MS
    })
    await vi.advanceTimersByTimeAsync(6_000)
    expect(db.getWorkerDispatch(dispatchId)).toMatchObject({
      state: 'failed',
      stage: 'agent_turn_failed:model_not_found'
    })
    db.close()
  })

  it('leaves a healthy run ready after the timer advances', async () => {
    vi.useFakeTimers()
    const db = new OrchestrationDb(':memory:')
    const dispatchId = startingDispatch(db)
    const startedAt = Date.now()
    armWorkerFirstTurnFollowThrough({
      runtime: {
        readTerminal: async () => {
          const elapsed = Date.now() - startedAt
          const seconds = Math.max(1, Math.floor(elapsed / 1000))
          const working = `>_ OpenAI Codex\nTASK submitted\n• Working (${seconds}s • esc to interrupt)`
          return {
            text: elapsed >= 4_000 ? `${working}\nthinking about the repo` : working
          }
        },
        notifyMessageArrived: () => undefined
      },
      db,
      dispatchId,
      handle: 'term_worker',
      deadline: startedAt + FIRST_TURN_WATCH_MS
    })
    await vi.advanceTimersByTimeAsync(6_000)
    expect(db.getWorkerDispatch(dispatchId)?.state).toBe('ready')
    db.close()
  })

  it('failWorkerFirstTurnAfterReady flips a ready worker through failWorkerStart', () => {
    const db = new OrchestrationDb(':memory:')
    const dispatchId = startingDispatch(db)
    failWorkerFirstTurnAfterReady({
      db,
      dispatchId,
      reason: 'model_not_found',
      notify: () => undefined
    })
    expect(db.getWorkerDispatch(dispatchId)).toMatchObject({
      state: 'failed',
      stage: 'agent_turn_failed:model_not_found'
    })
    expect(db.getDispatchContextById(dispatchId)?.status).toBe('failed')
    db.close()
  })
})
