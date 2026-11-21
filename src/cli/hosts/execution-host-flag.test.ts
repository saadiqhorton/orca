import { describe, expect, it } from 'vitest'
import { preferPairedServerForSameMachine } from '../../shared/orchestration/host-same-machine'

describe('--host same-machine clash', () => {
  it('prefers the paired server when dockhand names the same SSH deployment', () => {
    const preferred = preferPairedServerForSameMachine(
      {
        id: 'env-dockhand',
        name: 'dockhand',
        orcadDeployment: { sshTargetId: 'ssh-dockhand' }
      },
      [{ id: 'ssh-dockhand', label: 'dockhand', host: '192.168.1.10' }]
    )
    expect(preferred?.id).toBe('ssh-dockhand')
  })

  it('prefers the paired server when --host is the SSH address of that pair', () => {
    const preferred = preferPairedServerForSameMachine(
      {
        id: 'env-clawd',
        name: '192.168.1.35',
        orcadDeployment: { sshTargetId: 'ssh-clawd' }
      },
      [{ id: 'ssh-clawd', label: 'clawd', host: '192.168.1.35' }]
    )
    expect(preferred?.id).toBe('ssh-clawd')
  })

  it('does not prefer when the SSH target is a different machine', () => {
    expect(
      preferPairedServerForSameMachine({ id: 'env-a', name: 'dockhand' }, [
        { id: 'ssh-other', label: 'ubuntu-server-local', host: '192.168.1.20' }
      ])
    ).toBeUndefined()
  })
})
