import { describe, expect, it } from 'vitest'
import { runCrossHostOrchestrationE2e } from './desktop-hub-e2e-scenario'

describe('cross-host orchestration through the desktop hub', () => {
  it(
    'lists hosts from a session on A, runs hostname on B, and refuses the other cases',
    async () => {
      const transcript = await runCrossHostOrchestrationE2e()
      expect(transcript.lines.join('\n')).toContain('ubuntu-server-local  connected')
      expect(transcript.needsSignIn).toBe('needs_sign_in')
      expect(transcript.unreachable).toBe('host_unreachable')
      expect(transcript.forwardedMethods).toEqual([
        'orchestration.federationAttachStart',
        'orchestration.federationShow',
        'orchestration.federationStop'
      ])
      expect(transcript.hostname).toContain(transcript.marker)
      expect(transcript.readOutput).toBe(transcript.hostname)
      expect(transcript.stopped).toBe(true)
      expect(transcript.otherSession).toBe('session_refused')
      expect(transcript.forwardedMethods.join(' ')).not.toContain('ssh')
    },
    30_000
  )
})
