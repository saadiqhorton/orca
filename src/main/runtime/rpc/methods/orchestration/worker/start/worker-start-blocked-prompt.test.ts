import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationError } from '../../../../../orchestration/orchestration-error'
import {
  persistWorkerFirstTurnFailure,
  throwIfWorkerFirstTurnFailed
} from './worker-start-blocked-prompt'

describe('throwIfWorkerFirstTurnFailed', () => {
  it('fails a worker whose first screen is model_not_found', async () => {
    await expect(
      throwIfWorkerFirstTurnFailed(
        {
          readTerminal: async () => ({
            text: 'ERROR: 400 model_not_found gpt-6-luna'
          })
        },
        'term_worker',
        Date.now,
        { dispatchId: 'ctx_worker', host: 'ubuntu-server-local' }
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
        'term_worker',
        Date.now,
        { dispatchId: 'ctx_worker', host: 'ubuntu-server-local' }
      )
    } catch (error) {
      expect(error).toBeInstanceOf(OrchestrationError)
      if (!(error instanceof OrchestrationError)) {
        throw error
      }
      expect(error.data).toMatchObject({
        blockedReason: 'agent_turn_failed:model_not_found',
        handle: 'term_worker',
        dispatchId: 'ctx_worker',
        host: 'ubuntu-server-local'
      })
    }
  })

  it('lets a healthy first screen through', async () => {
    await expect(
      throwIfWorkerFirstTurnFailed(
        { readTerminal: async () => ({ text: 'thinking about the repo' }) },
        'term_worker'
      )
    ).resolves.toBe(false)
  })

  it('fails a worker when model_not_found arrives after the Codex banner', async () => {
    const screens = [
      '>_ OpenAI Codex (v0.154.0)\n  model: gpt-6-luna\n  To get started, describe a task',
      '>_ OpenAI Codex (v0.154.0)\nERROR: 400 model_not_found gpt-6-luna'
    ]
    let i = 0
    await expect(
      throwIfWorkerFirstTurnFailed(
        {
          readTerminal: async () => ({
            text: screens[Math.min(i++, screens.length - 1)] ?? screens[0]!
          })
        },
        'term_worker'
      )
    ).rejects.toMatchObject({
      code: 'agent_blocked_on_prompt'
    })
  })

  it('fails worker-start after banner, prompt submitted, Working, a 5s delay, then 400', async () => {
    vi.useFakeTimers()
    const started = Date.now()
    const banner =
      '>_ OpenAI Codex (v0.154.0)\n  model: gpt-6-luna\n  To get started, describe a task'
    const working = `${banner}\nTASK submitted\nWorking`
    const fatal = `${working}\nERROR: 400 model_not_found gpt-6-luna`
    const pending = throwIfWorkerFirstTurnFailed(
      {
        readTerminal: async () => {
          const elapsed = Date.now() - started
          const text = elapsed === 0 ? banner : elapsed < 5_000 ? working : fatal
          return { text }
        }
      },
      'term_worker'
    )
    const expectation = expect(pending).rejects.toMatchObject({
      code: 'agent_blocked_on_prompt',
      data: { blockedReason: 'agent_turn_failed:model_not_found' }
    })
    await vi.advanceTimersByTimeAsync(5_250)
    await expectation
  })

  it('returns a healthy worker-start well before 20s once Working (Ns) advances', async () => {
    vi.useFakeTimers()
    const started = Date.now()
    const pending = throwIfWorkerFirstTurnFailed(
      {
        readTerminal: async () => {
          const elapsed = Math.floor((Date.now() - started) / 1000)
          return {
            text: `>_ OpenAI Codex\nTASK submitted\n• Working (${elapsed}s • esc to interrupt)`
          }
        }
      },
      'term_worker'
    )
    const finished = pending.then((value) => ({ value, at: Date.now() - started }))
    await vi.advanceTimersByTimeAsync(3_500)
    const result = await finished
    expect(result.value).toBe(true)
    expect(result.at).toBeLessThan(20_000)
    expect(result.at).toBeLessThanOrEqual(4_000)
  })

  it('returns a healthy Claude worker-start well before 20s once ✻ status seconds advance', async () => {
    vi.useFakeTimers()
    const started = Date.now()
    const pending = throwIfWorkerFirstTurnFailed(
      {
        readTerminal: async () => {
          const elapsed = Math.floor((Date.now() - started) / 1000)
          return {
            text: `✻ Working… (${elapsed}s · esc to interrupt)`
          }
        }
      },
      'term_worker'
    )
    const finished = pending.then((value) => ({ value, at: Date.now() - started }))
    await vi.advanceTimersByTimeAsync(3_500)
    const result = await finished
    expect(result.value).toBe(true)
    expect(result.at).toBeLessThan(20_000)
  })

  it('marks the dispatch failed with agent_turn_failed on a first-turn 400', async () => {
    const persisted: string[] = []
    const error = new OrchestrationError('agent_blocked_on_prompt', 'first turn failed', {
      handle: 'term_worker',
      blockedReason: 'agent_turn_failed:model_not_found'
    })
    await persistWorkerFirstTurnFailure(error, async () => {
      persisted.push('agent_turn_failed:model_not_found')
    })
    expect(persisted).toEqual(['agent_turn_failed:model_not_found'])
  })
})

afterEach(() => {
  vi.useRealTimers()
})
