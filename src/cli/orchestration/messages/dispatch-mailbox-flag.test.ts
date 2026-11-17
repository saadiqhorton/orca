import { describe, expect, it, vi } from 'vitest'
import { applyDispatchMailboxFlag } from './dispatch-mailbox-flag'
import { parseArgs, validateCommandAndFlags } from '../../arguments/args'
import { specPaths } from '../../discovery/command-spec'
import { COMMAND_SPECS } from '../../specs'

const COMMAND_PATHS = COMMAND_SPECS.flatMap((spec) => specPaths(spec))

vi.mock('../../output/command-result-output', () => ({ printResult: vi.fn() }))
vi.mock('../agent-view', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  printOrchestrationResult: vi.fn()
}))

import { ORCHESTRATION_HANDLERS } from '../orchestration-handlers'

describe('applyDispatchMailboxFlag', () => {
  it('rewrites a bare ctx_ id to the Dispatch mailbox', () => {
    const flags = new Map<string, string | boolean>([['dispatch', 'ctx_793e1b7ab138']])
    applyDispatchMailboxFlag(flags)
    expect(flags.get('terminal')).toBe('dispatch:ctx_793e1b7ab138')
    expect(flags.has('dispatch')).toBe(false)
  })

  it('accepts the dispatch: mailbox spelling', () => {
    const flags = new Map<string, string | boolean>([['dispatch', 'dispatch:ctx_793e1b7ab138']])
    applyDispatchMailboxFlag(flags)
    expect(flags.get('terminal')).toBe('dispatch:ctx_793e1b7ab138')
  })

  it('is a valid flag on check and inbox', () => {
    expect(() =>
      validateCommandAndFlags(
        COMMAND_SPECS,
        parseArgs(
          ['orchestration', 'check', '--dispatch', 'ctx_home'],
          COMMAND_PATHS,
          COMMAND_SPECS
        )
      )
    ).not.toThrow()
    expect(() =>
      validateCommandAndFlags(
        COMMAND_SPECS,
        parseArgs(
          ['orchestration', 'inbox', '--dispatch', 'ctx_home'],
          COMMAND_PATHS,
          COMMAND_SPECS
        )
      )
    ).not.toThrow()
  })

  it('refuses combining --dispatch with --terminal', () => {
    expect(() =>
      applyDispatchMailboxFlag(
        new Map([
          ['dispatch', 'ctx_home'],
          ['terminal', 'term_visible']
        ])
      )
    ).toThrow(/either --dispatch or --terminal/)
  })
})

describe('check and inbox --dispatch', () => {
  it('checks the worker mailbox named by --dispatch', async () => {
    const call = vi.fn().mockResolvedValue({ result: { messages: [], count: 0 } })
    await ORCHESTRATION_HANDLERS['orchestration check']({
      flags: new Map<string, string | boolean>([
        ['dispatch', 'ctx_793e1b7ab138'],
        ['json', true]
      ]),
      client: { call },
      cwd: '/tmp/repo',
      json: true
    } as never)
    expect(call).toHaveBeenCalledWith(
      'orchestration.check',
      expect.objectContaining({ terminal: 'dispatch:ctx_793e1b7ab138' })
    )
  })

  it('reads the worker mailbox named by --dispatch', async () => {
    const call = vi.fn().mockResolvedValue({ result: { messages: [], count: 0 } })
    await ORCHESTRATION_HANDLERS['orchestration inbox']({
      flags: new Map<string, string | boolean>([['dispatch', 'dispatch:ctx_793e1b7ab138']]),
      client: { call },
      cwd: '/tmp/repo',
      json: true
    } as never)
    expect(call).toHaveBeenCalledWith(
      'orchestration.inbox',
      expect.objectContaining({ terminal: 'dispatch:ctx_793e1b7ab138' })
    )
  })
})
