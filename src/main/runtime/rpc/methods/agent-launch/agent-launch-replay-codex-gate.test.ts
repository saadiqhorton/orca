import { describe, expect, it, vi } from 'vitest'
import { methodNamed, rpcContext, runtimeStub } from './agent-launch.test-fixture'

vi.mock('../../../../agent-launch/preflight/agent-cli-version-probe', () => ({
  checkAgentCliVersion: vi.fn(async () => ({ status: 'ready' as const, version: '0.154.0' }))
}))

vi.mock('../structured-sessions/creation/structured-agent-session-create', () => ({
  createStructuredAgentSessionForWorktree: async () => ({
    ok: true,
    value: { sessionId: 'sess-1' }
  })
}))

const { AGENT_LAUNCH_METHODS } = await import('./agent-launch')
const AGENT_LAUNCH_REPLAY = methodNamed(AGENT_LAUNCH_METHODS, 'agent.launchReplay')

describe('agent.launchReplay Codex version gate', () => {
  it('refuses gpt-6-luna on Codex 0.154 before the launch is recorded', async () => {
    const runtime = runtimeStub()
    const params = AGENT_LAUNCH_REPLAY.params.parse({
      agent: 'codex',
      target: { kind: 'existing', worktree: 'id:wt-7' },
      operationId: `${Date.now()}-000000000000000000000000000000cc`,
      sessionOptions: { model: 'gpt-6-luna' }
    })

    await expect(AGENT_LAUNCH_REPLAY.handler(params, rpcContext(runtime, {}))).rejects.toThrow(
      'needs Codex 0.156.0 or newer; this host has 0.154.0'
    )
    expect(runtime.openAgentSessionRecordStore).not.toHaveBeenCalled()
    expect(runtime.createTerminal).not.toHaveBeenCalled()
  })
})
