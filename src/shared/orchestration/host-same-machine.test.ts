import { describe, expect, it } from 'vitest'
import { namesSameMachine, preferPairedServerForSameMachine } from './host-same-machine'

describe('preferPairedServerForSameMachine', () => {
  it('prefers the paired server when an SSH target is that server’s managed deployment', () => {
    const environment = {
      id: 'env-dockhand',
      name: 'dockhand',
      orcadDeployment: { kind: 'ssh' as const, sshTargetId: 'ssh-dockhand' }
    }
    const ssh = { id: 'ssh-dockhand', label: 'dockhand', host: '192.168.1.10' }
    expect(preferPairedServerForSameMachine(environment, [ssh])).toEqual(ssh)
    expect(namesSameMachine(environment, ssh)).toBe(true)
  })

  it('prefers the paired server when --host is the SSH host address of that pair', () => {
    const environment = {
      id: 'env-clawd',
      name: '192.168.1.35',
      orcadDeployment: { kind: 'ssh' as const, sshTargetId: 'ssh-clawd' }
    }
    const ssh = { id: 'ssh-clawd', label: 'clawd', host: '192.168.1.35' }
    expect(preferPairedServerForSameMachine(environment, [ssh])?.id).toBe('ssh-clawd')
  })

  it('does not collapse unrelated machines that only share a word', () => {
    const environment = { id: 'env-a', name: 'build' }
    expect(
      preferPairedServerForSameMachine(environment, [{ id: 'ssh-1', label: 'build-box' }])
    ).toBeUndefined()
  })
})
