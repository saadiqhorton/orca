import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const callMock = vi.fn()
const originalExitCode = process.exitCode
vi.mock('../../output/command-result-output', async (importOriginal) => {
  const original = await importOriginal<{ printResult: typeof printResult }>()
  return { printResult: vi.fn(original.printResult) }
})
vi.mock('../../terminals/terminal-selector', () => ({ getTerminalHandle: vi.fn() }))

import { ORCHESTRATION_HANDLERS } from '../orchestration-handlers'
import { printResult } from '../../output/command-result-output'

import { RuntimeClient } from '../../runtime/client'

const client = new RuntimeClient('/tmp/orca-worker-cli', 60_000, null, null)

describe('orchestration worker-start CLI contract', () => {
  beforeEach(() => {
    callMock.mockReset()
    vi.spyOn(client, 'call').mockImplementation(callMock)
    vi.mocked(printResult).mockClear()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    process.exitCode = undefined
    vi.stubEnv('ORCA_CLI_COMMAND', undefined)
    vi.stubEnv('ORCA_DEV_CLI_INVOCATION', undefined)
    vi.stubEnv('ORCA_USER_DATA_PATH', undefined)
    vi.stubEnv('ORCA_TERMINAL_HANDLE', 'term_coord')
    vi.stubEnv('ORCA_AGENT_SESSION_ID', undefined)
  })

  afterEach(() => {
    process.exitCode = originalExitCode
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const invokeWorkerStart = (flags: Map<string, string | boolean>, json = true) =>
    ORCHESTRATION_HANDLERS['orchestration worker-start']({
      flags,
      client,
      cwd: '/tmp/repo',
      json
    })

  it('sets an unsuccessful exit code for an unknown receipt', async () => {
    callMock.mockResolvedValue({
      result: {
        taskId: 'task_1',
        dispatchId: 'ctx_1',
        state: 'outcome_unknown',
        effects: [],
        residualResources: []
      }
    })

    await invokeWorkerStart(
      new Map<string, string | boolean>([
        ['task', 'task_1'],
        ['agent', 'codex'],
        ['from', 'term_coord']
      ])
    )

    expect(process.exitCode).toBe(1)
  })

  it('keeps --json stdout as a single JSON object when the Codex model id is unknown', async () => {
    const stdout = vi.mocked(console.log)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    callMock.mockImplementation(async (method: string) => {
      if (method === 'status.get') {
        return { result: { capabilities: ['orchestration.worker-launch-preferences.v1'] } }
      }
      return {
        result: {
          taskId: 'task_1',
          dispatchId: 'ctx_1',
          state: 'ready',
          effects: [],
          residualResources: []
        }
      }
    })

    await invokeWorkerStart(
      new Map<string, string | boolean>([
        ['spec', 'Say hi.'],
        ['agent', 'codex'],
        ['model', 'bogus-model-xyz'],
        ['from', 'term_coord']
      ]),
      true
    )

    expect(stderr).not.toHaveBeenCalled()
    const printed = String(stdout.mock.calls.at(-1)?.[0])
    expect(printed.trimStart().startsWith('{')).toBe(true)
    const payload = JSON.parse(printed) as { ok: boolean; result: { warning?: string } }
    expect(payload.ok).toBe(true)
    expect(payload.result.warning).toContain('bogus-model-xyz')
  })

  it('sends --as-coordinator as the CLI coordinator when ORCA_TERMINAL_HANDLE is absent', async () => {
    vi.stubEnv('ORCA_TERMINAL_HANDLE', '')
    callMock.mockResolvedValue({
      result: {
        taskId: 'task_1',
        dispatchId: 'ctx_1',
        state: 'ready',
        effects: [],
        residualResources: []
      }
    })

    await invokeWorkerStart(
      new Map<string, string | boolean>([
        ['spec', 'Say hi.'],
        ['agent', 'codex'],
        ['as-coordinator', true]
      ])
    )

    expect(callMock).toHaveBeenCalledWith(
      'orchestration.workerStart',
      expect.objectContaining({ from: 'cli:coordinator' })
    )
  })
})
