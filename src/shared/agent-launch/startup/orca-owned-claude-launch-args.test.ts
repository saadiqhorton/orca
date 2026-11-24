import { describe, expect, it } from 'vitest'
import { parseExtraAgentArgs } from './automation-extra-agent-args'
import { buildAgentStartupPlan } from './tui-agent-startup'
import { resolveAgentStartupPlanInputs } from './agent-startup-plan-inputs'
import { mergeOrcaOwnedAgentArgs } from './orca-owned-agent-args'

const INSTRUCTION = '/tmp/orca-agent-instructions/ORCA.md'
const OWNED = ['--append-system-prompt-file', INSTRUCTION] as const

describe('R07 Claude launch after a host list has been served', () => {
  it('rejects user extra-args --append-system-prompt-file', () => {
    const parsed = parseExtraAgentArgs({
      agent: 'claude',
      extraAgentArgs: `--append-system-prompt-file '${INSTRUCTION}'`
    })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.errorCode).toBe('optionNotAllowed')
      expect(parsed.error).toContain('--append-system-prompt-file')
    }
  })

  it('builds a Claude launch with owned instruction flags plus user --model', () => {
    const inputs = resolveAgentStartupPlanInputs({
      agent: 'claude',
      settings: {},
      platform: 'linux',
      isRemote: true,
      shell: undefined,
      extraAgentArgs: '--model opus',
      orcaOwnedAgentArgs: OWNED
    })
    const plan = buildAgentStartupPlan({ ...inputs, prompt: 'hostname' })
    expect(plan?.launchCommand).toContain('--append-system-prompt-file')
    expect(plan?.launchCommand).toContain(INSTRUCTION)
    expect(plan?.launchCommand).toContain('opus')
    expect(() =>
      resolveAgentStartupPlanInputs({
        agent: 'claude',
        settings: {},
        platform: 'linux',
        isRemote: true,
        shell: undefined,
        extraAgentArgs: `--append-system-prompt-file '${INSTRUCTION}'`
      })
    ).toThrow('--append-system-prompt-file')
  })

  it('inserts owned flag and value when defaults are empty', () => {
    const merged = mergeOrcaOwnedAgentArgs({
      agent: 'claude',
      defaultArgs: null,
      owned: OWNED,
      shell: 'posix'
    })
    expect(merged).toContain('--append-system-prompt-file')
    expect(merged).toContain(INSTRUCTION)
  })
})
