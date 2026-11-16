import { describe, expect, it } from 'vitest'
import {
  desktopHubHostError,
  desktopHubRowMatches,
  desktopHubStatus,
  unknownDesktopHubHost
} from './desktop-hub-contract'

describe('desktop hub host status', () => {
  it('maps sidebar health onto connected, needs sign-in, and unreachable', () => {
    expect(desktopHubStatus({ health: 'available' })).toBe('connected')
    expect(desktopHubStatus({ health: 'blocked', blockedReason: 'access-revoked' })).toBe(
      'needs_sign_in'
    )
    expect(desktopHubStatus({ health: 'error', sshAuthFailed: true })).toBe('needs_sign_in')
    expect(desktopHubStatus({ health: 'connecting' })).toBe('needs_sign_in')
    expect(desktopHubStatus({ health: 'disconnected' })).toBe('unreachable')
    expect(desktopHubHostError('needs_sign_in', 'TEMPLEOFDOOM')?.message).toContain('needs sign-in')
    expect(desktopHubHostError('unreachable', 'ARCHIT4ME')?.message).toContain('will not try SSH')
    expect(unknownDesktopHubHost('missing').message).toContain('orca host list')
  })

  it('matches --host ubuntu-server-local when the machine is dezignerdrugz00', () => {
    const row = {
      name: 'ubuntu-server-local',
      machineName: 'dezignerdrugz00',
      label: 'ubuntu-server-local'
    }
    expect(desktopHubRowMatches(row, 'ubuntu-server-local')).toBe(true)
    expect(desktopHubRowMatches(row, 'dezignerdrugz00')).toBe(true)
  })
})
