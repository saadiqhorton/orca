import { describe, expect, it, vi } from 'vitest'
import { OrchestrationError } from '../../../../../../orchestration/orchestration-error'
import { assertRemoteHostHasAgent, refuseUnlessAgentDetected } from './worker-agent-cli-installed'

describe('refuseUnlessAgentDetected', () => {
  it('lists installed agents when the requested CLI is missing', () => {
    expect(() => refuseUnlessAgentDetected('gemini', ['claude', 'codebuddy', 'codex'])).toThrow(
      OrchestrationError
    )
    try {
      refuseUnlessAgentDetected('gemini', ['claude', 'codebuddy', 'codex'])
    } catch (error) {
      expect(error).toMatchObject({
        code: 'agent_unconfigured',
        message:
          'Agent CLI "gemini" is not installed on this host. Available agents: claude, codebuddy, codex.'
      })
    }
  })

  it('does not refuse when detection found nothing', () => {
    expect(() => refuseUnlessAgentDetected('gemini', [])).not.toThrow()
  })
})

describe('assertRemoteHostHasAgent', () => {
  it('refuses before attach when the remote inventory does not include the agent', async () => {
    const runtime = {
      callOrchestrationWorkerServer: vi.fn(async () => ({
        agents: ['claude', 'codebuddy', 'codex']
      }))
    }
    await expect(
      assertRemoteHostHasAgent({
        runtime,
        environmentId: 'env-ubuntu',
        agent: 'gemini',
        timeoutMs: 5_000
      })
    ).rejects.toMatchObject({
      code: 'agent_unconfigured',
      message: expect.stringContaining('Available agents: claude, codebuddy, codex')
    })
    expect(runtime.callOrchestrationWorkerServer).toHaveBeenCalledWith(
      'env-ubuntu',
      'orchestration.surface.inventory',
      {},
      5_000,
      undefined,
      undefined
    )
  })

  it('skips when inventory cannot be read', async () => {
    const runtime = {
      callOrchestrationWorkerServer: vi.fn(async () => {
        throw new Error('offline')
      })
    }
    await expect(
      assertRemoteHostHasAgent({
        runtime,
        environmentId: 'env-ubuntu',
        agent: 'gemini',
        timeoutMs: 5_000
      })
    ).resolves.toBeUndefined()
  })
})
