import { describe, expect, it } from 'vitest'
import { RuntimeClientError } from '../runtime/types'
import { cliErrorExitCode } from './cli-exit-code'

const orchestration = ['orchestration', 'worker-start']

describe('cliErrorExitCode', () => {
  it.each([
    ['invalid_argument', 1],
    ['unknown_host', 3],
    ['session_not_found', 3],
    ['host_unreachable', 4],
    ['needs_sign_in', 4],
    ['agent_blocked_on_prompt', 5],
    ['incompatible_runtime', 6],
    ['runtime_unavailable', 1]
  ])('maps %s to exit %i for orchestration commands', (code, exit) => {
    expect(cliErrorExitCode(new RuntimeClientError(code, 'x'), orchestration)).toBe(exit)
  })

  it('keeps plugin exit codes unchanged', () => {
    const plugin = ['plugin', 'install']
    expect(cliErrorExitCode(new RuntimeClientError('plugin_invalid', 'x'), plugin)).toBe(2)
    expect(cliErrorExitCode(new RuntimeClientError('approval_stale', 'x'), plugin)).toBe(3)
    expect(cliErrorExitCode(new RuntimeClientError('incompatible_runtime', 'x'), plugin)).toBe(1)
  })

  it('keeps other commands at exit 1', () => {
    const browser = ['browser', 'click']
    expect(cliErrorExitCode(new RuntimeClientError('incompatible_runtime', 'x'), browser)).toBe(1)
    expect(
      cliErrorExitCode(new RuntimeClientError('incompatible_runtime', 'x'), ['worktree', 'create'])
    ).toBe(1)
  })

  it('maps incompatible_runtime to 6 for agent, terminal, and host families', () => {
    const error = new RuntimeClientError('incompatible_runtime', 'x')
    expect(cliErrorExitCode(error, ['agent', 'launch'])).toBe(6)
    expect(cliErrorExitCode(error, ['terminal', 'create'])).toBe(6)
    expect(cliErrorExitCode(error, ['host', 'inventory'])).toBe(6)
  })

  it('maps agent_blocked_on_prompt to exit 5 for agent launch', () => {
    expect(
      cliErrorExitCode(new RuntimeClientError('agent_blocked_on_prompt', 'x'), ['agent', 'launch'])
    ).toBe(5)
  })

  it('exits 1 for errors without a code', () => {
    expect(cliErrorExitCode(new Error('boom'), orchestration)).toBe(1)
  })
})
