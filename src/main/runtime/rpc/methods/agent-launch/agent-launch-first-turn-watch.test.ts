import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginAgentLaunchFirstTurnWatch,
  finishAgentLaunchFirstTurnWatch,
  FIRST_TURN_WATCH_MS,
  watchAgentLaunchFirstTurn,
  watchTerminalFirstTurn
} from './agent-launch-first-turn-watch'
import type { AgentLaunchResult } from '../../../../../shared/agent-launch/contracts/agent-launch-intent'
import { OrchestrationDb } from '../../../orchestration/db/orchestration-db'

afterEach(() => {
  vi.useRealTimers()
})

function launched(): AgentLaunchResult {
  return {
    outcome: { kind: 'terminal', handle: 'term_codex' },
    worktreeId: 'folder:fld_1',
    receipt: {
      mode: 'terminal',
      preferred: 'terminal',
      reason: 'requested',
      detail: 'fixture'
    },
    prompt: { delivery: 'submit', outcome: 'handed-to-terminal' }
  }
}

function readyWorker(db: OrchestrationDb, handle: string): string {
  const task = db.createTask({ runId: 'run_legacy_local', spec: 'agent-launch first-turn' })
  const started = db.createStartingWorkerDispatch({
    creator: { kind: 'system' },
    maxDepth: Number.MAX_SAFE_INTEGER,
    taskId: task.id,
    startOptions: { topology: 'current', agent: 'codex' }
  })
  db.prepareStartingWorkerAuthority({
    dispatchId: started.dispatch.id,
    handle,
    paneKey: 'tab_launch:11111111-1111-4111-8111-111111111111',
    processIncarnation: 'pty-launch:22222222-2222-4222-8222-222222222222',
    worktreeId: 'repo::worktree',
    setupState: 'not_applicable',
    effects: [],
    terminalOwnership: 'created'
  })
  db.markWorkerDispatchReady(started.dispatch.id)
  return started.dispatch.id
}

describe('watchAgentLaunchFirstTurn', () => {
  it('fails launch when the first screen is model_not_found', async () => {
    const result = await watchAgentLaunchFirstTurn(
      {
        readTerminal: async () => ({
          text: 'ERROR: 400 model_not_found gpt-6-luna'
        })
      },
      launched()
    )
    expect(result.prompt).toMatchObject({
      outcome: 'agent_blocked_on_prompt',
      blockedReason: 'agent_turn_failed:model_not_found'
    })
  })

  it('keeps a successful first turn', async () => {
    const result = await watchAgentLaunchFirstTurn(
      { readTerminal: async () => ({ text: 'thinking about the repo' }) },
      launched()
    )
    expect(result.prompt?.outcome).toBe('handed-to-terminal')
  })

  it('fails when model_not_found arrives after the Codex banner', async () => {
    const screens = [
      '>_ OpenAI Codex (v0.154.0)\n  model: gpt-6-luna\n  To get started, describe a task',
      '>_ OpenAI Codex (v0.154.0)\n  model: gpt-6-luna\nERROR: 400 model_not_found gpt-6-luna'
    ]
    let i = 0
    const result = await watchAgentLaunchFirstTurn(
      {
        readTerminal: async () => ({
          text: screens[Math.min(i++, screens.length - 1)] ?? screens[0]!
        })
      },
      launched()
    )
    expect(result.prompt).toMatchObject({
      outcome: 'agent_blocked_on_prompt',
      blockedReason: 'agent_turn_failed:model_not_found'
    })
  })

  it('returns a healthy fast launch without waiting the 20s watch', async () => {
    vi.useFakeTimers()
    const startedAt = Date.now()
    const pending = watchAgentLaunchFirstTurn(
      { readTerminal: async () => ({ text: '❯ hello from the worktree' }) },
      launched()
    )
    await vi.advanceTimersByTimeAsync(500)
    const result = await pending
    expect(result.prompt?.outcome).toBe('handed-to-terminal')
    expect(Date.now() - startedAt).toBeLessThan(FIRST_TURN_WATCH_MS)
    await vi.advanceTimersByTimeAsync(FIRST_TURN_WATCH_MS)
  })

  it('records a late 400 on the launch caller after a healthy return', async () => {
    vi.useFakeTimers()
    const db = new OrchestrationDb(':memory:')
    const handle = 'term_codex'
    const dispatchId = readyWorker(db, handle)
    const startedAt = Date.now()
    const recorded: string[] = []
    const pending = watchAgentLaunchFirstTurn(
      {
        readTerminal: async () => {
          const elapsed = Date.now() - startedAt
          const seconds = Math.max(1, Math.floor(elapsed / 1000))
          const working = `>_ OpenAI Codex\nTASK submitted\n• Working (${seconds}s • esc to interrupt)`
          return {
            text: elapsed >= 5_000 ? `${working}\nERROR: 400 model_not_found gpt-5.4` : working
          }
        },
        getExistingOrchestrationDb: () => db,
        notifyMessageArrived: () => undefined
      },
      launched(),
      Date.now,
      (reason) => recorded.push(reason)
    )
    await vi.advanceTimersByTimeAsync(3_500)
    const result = await pending
    expect(result.prompt?.outcome).toBe('handed-to-terminal')
    await vi.advanceTimersByTimeAsync(3_000)
    expect(recorded).toEqual(['model_not_found'])
    expect(db.getWorkerDispatch(dispatchId)).toMatchObject({
      state: 'failed',
      stage: 'agent_turn_failed:model_not_found'
    })
    db.close()
  })
})

describe('begin/finishAgentLaunchFirstTurnWatch', () => {
  it('does not add the 20s watch after a healthy overlapping launch', async () => {
    vi.useFakeTimers()
    const startedAt = Date.now()
    const runtime = {
      readTerminal: async () => ({
        text: '>_ OpenAI Codex (v0.154.0)\n  To get started, describe a task'
      })
    }
    const watch = beginAgentLaunchFirstTurnWatch(runtime, launched())
    await vi.advanceTimersByTimeAsync(1_000)
    const result = await finishAgentLaunchFirstTurnWatch(runtime, launched(), watch)
    expect(result.prompt?.outcome).toBe('handed-to-terminal')
    expect(Date.now() - startedAt).toBeLessThan(FIRST_TURN_WATCH_MS)
    await vi.advanceTimersByTimeAsync(FIRST_TURN_WATCH_MS)
  })

  it('still fails the launch when an early 400 already landed', async () => {
    const runtime = {
      readTerminal: async () => ({
        text: 'ERROR: 400 model_not_found gpt-6-luna'
      })
    }
    const watch = beginAgentLaunchFirstTurnWatch(runtime, launched())
    await watch?.promise
    const result = await finishAgentLaunchFirstTurnWatch(runtime, launched(), watch)
    expect(result.prompt).toMatchObject({
      outcome: 'agent_blocked_on_prompt',
      blockedReason: 'agent_turn_failed:model_not_found'
    })
  })
})

describe('watchTerminalFirstTurn', () => {
  it('retries a transient terminal.read error until activity arrives', async () => {
    vi.useFakeTimers()
    let reads = 0
    const pending = watchTerminalFirstTurn(
      {
        readTerminal: async () => {
          reads += 1
          if (reads < 3) {
            throw new Error('timeout')
          }
          return { text: 'thinking about the repo' }
        }
      },
      'term_codex'
    )
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(pending).resolves.toEqual({ status: 'settled' })
    expect(reads).toBeGreaterThanOrEqual(3)
  })

  it('does not treat a single read timeout as settled before a late 400', async () => {
    vi.useFakeTimers()
    const startedAt = Date.now()
    const pending = watchTerminalFirstTurn(
      {
        readTerminal: async () => {
          if (Date.now() - startedAt < 5_000) {
            throw new Error('timeout')
          }
          return { text: 'ERROR: 400 model_not_found gpt-5.4' }
        }
      },
      'term_codex'
    )
    await vi.advanceTimersByTimeAsync(6_000)
    await expect(pending).resolves.toEqual({ status: 'failed', reason: 'model_not_found' })
  })
})
