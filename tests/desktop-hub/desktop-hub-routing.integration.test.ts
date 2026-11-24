import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runCrossHostOrchestrationE2e } from './desktop-hub-e2e-scenario'

describe('cross-host orchestration through the desktop hub', () => {
  // Boots paired RPC runtimes, shared-control hub volunteer, and cross-host placement before assertions.
  it('lists hosts from a session on A, runs hostname on B, and refuses the other cases', async () => {
    const transcript = await runCrossHostOrchestrationE2e()
    const body = transcript.lines.join('\n')
    writeFileSync('/tmp/xhost-e2e-transcript.log', `${body}\n`)
    console.log(`\n${body}\n`)
    expect(transcript.answerPath).toBe('shared-control')
    expect(transcript.lines.join('\n')).toContain('$ orca host list')
    expect(transcript.lines.join('\n')).toContain(
      'ubuntu-server-local (dezignerdrugz00)  connected'
    )
    expect(transcript.lines.join('\n')).not.toContain('did not answer')
    expect(transcript.hostname).toContain('B_CWD=')
    expect(transcript.hostname).toContain(transcript.marker)
    expect(transcript.hostA).toBeTruthy()
    expect(transcript.needsSignIn).toBe('needs_sign_in')
    expect(transcript.unreachable).toBe('host_unreachable')
    expect(transcript.forwardedMethods).toEqual([
      'orchestration.surface.ensureScratch',
      'orchestration.surface.ensureScratch',
      'orchestration.federationAttachStart',
      'orchestration.federationShow',
      'orchestration.federationStop',
      'agent.launch',
      'orchestration.surface.inventory',
      'local:orchestration.surface.inventory'
    ])
    expect(transcript.scratchWorktree).toBe('folder:fld_e2e')
    expect(transcript.lines.join('\n')).toContain('scratch reuse: folder:fld_e2e')
    expect(transcript.lines.join('\n')).toContain('folderWorkspaces lists folder:fld_e2e')
    expect(transcript.desktopInventoryMachine).toBe('windows-desktop')
    expect(transcript.launchedTab).toBe('term_visible_e2e')
    expect(transcript.inventoryAgents).toEqual(['claude', 'codex'])
    expect(transcript.hostname).toContain(transcript.marker)
    expect(transcript.readOutput).toBe(transcript.hostname)
    expect(transcript.stopped).toBe(true)
    expect(transcript.otherSession).toBe('session_refused')
    expect(transcript.forwardedMethods.join(' ')).not.toContain('ssh')
  }, 30_000)
})
