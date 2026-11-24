import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../agent-launch/preflight/agent-cli-version-probe', () => ({
  checkAgentCliVersion: vi.fn(async () => ({ status: 'ready' as const, version: '0.154.0' }))
}))

const { AGENT_LAUNCH_METHODS } = await import('./agent-launch')
const AGENT_LAUNCH_REPLAY = AGENT_LAUNCH_METHODS.find(
  (method) => method.name === 'agent.launchReplay'
)

describe('agent.launchReplay Codex version gate', () => {
  it('refuses gpt-6-luna on Codex 0.154 before the launch is recorded', async () => {
    if (!AGENT_LAUNCH_REPLAY) {
      throw new Error('agent.launchReplay is missing')
    }
    const runtime = {
      openAgentSessionRecordStore: vi.fn(),
      createTerminal: vi.fn()
    }
    const params = AGENT_LAUNCH_REPLAY.params.parse({
      agent: 'codex',
      target: { kind: 'existing', worktree: 'id:wt-7' },
      operationId: `${Date.now()}-000000000000000000000000000000cc`,
      sessionOptions: { model: 'gpt-6-luna' }
    })

    await expect(AGENT_LAUNCH_REPLAY.handler(params, { runtime } as never)).rejects.toThrow(
      'needs Codex 0.156.0 or newer; this host has 0.154.0'
    )
    expect(runtime.openAgentSessionRecordStore).not.toHaveBeenCalled()
    expect(runtime.createTerminal).not.toHaveBeenCalled()
  })
})
