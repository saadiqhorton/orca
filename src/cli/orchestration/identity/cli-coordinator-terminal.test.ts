import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClientError } from '../../runtime/types'
import { CLI_COORDINATOR_HANDLE } from '../../../shared/orchestration/cli-coordinator-identity'
import { resolveCoordinatorTerminalHandle } from './terminal-identity'

const getTerminalHandleMock = vi.hoisted(() => vi.fn())
vi.mock('../../terminals/terminal-selector', () => ({ getTerminalHandle: getTerminalHandleMock }))

describe('resolveCoordinatorTerminalHandle', () => {
  beforeEach(() => {
    getTerminalHandleMock.mockReset()
    delete process.env.ORCA_TERMINAL_HANDLE
    delete process.env.ORCA_PANE_KEY
    delete process.env.CODEX_THREAD_ID
  })

  afterEach(() => {
    delete process.env.ORCA_TERMINAL_HANDLE
    delete process.env.ORCA_PANE_KEY
    delete process.env.CODEX_THREAD_ID
  })

  const client = { call: vi.fn() }

  it('starts as coordinator with --as-coordinator when no Orca terminal is present', async () => {
    const flags = new Map<string, string | boolean>([['as-coordinator', true]])
    await expect(
      resolveCoordinatorTerminalHandle(flags, 'C:\\Users\\Saadiq\\proj', client as never)
    ).resolves.toBe(CLI_COORDINATOR_HANDLE)
    expect(getTerminalHandleMock).not.toHaveBeenCalled()
  })

  it('tells an external shell to pass --as-coordinator', async () => {
    getTerminalHandleMock.mockRejectedValueOnce(
      new RuntimeClientError('no_active_terminal', 'no terminal')
    )
    const flags = new Map<string, string | boolean>()
    await expect(
      resolveCoordinatorTerminalHandle(flags, '/tmp/repo', client as never)
    ).rejects.toMatchObject({
      code: 'no_active_sender_terminal',
      message: expect.stringContaining('--as-coordinator')
    })
  })
})
