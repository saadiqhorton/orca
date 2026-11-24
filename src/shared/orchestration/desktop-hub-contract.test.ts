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
    expect(unknownDesktopHubHost('missing').code).toBe('unknown_host')
    expect(unknownDesktopHubHost('missing').message).toContain('orca host inventory')
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

  it('matches the environment id that orca host list --json prints', () => {
    const row = {
      name: 'ubuntu-server-local',
      machineName: 'dezignerdrugz00',
      label: 'ubuntu-server-local',
      id: 'f12a5fc4-a853-4aa2-8b76-b0b6977b45c5'
    }
    expect(desktopHubRowMatches(row, 'f12a5fc4-a853-4aa2-8b76-b0b6977b45c5')).toBe(true)
    expect(desktopHubRowMatches(row, 'f12a5fc4')).toBe(false)
  })

  it('matches --host when the managed SSH target is labelled with its IP', () => {
    const row = {
      name: 'clawd',
      label: 'clawd',
      aliases: ['192.168.1.35']
    }
    expect(desktopHubRowMatches(row, '192.168.1.35')).toBe(true)
    expect(desktopHubRowMatches(row, 'clawd')).toBe(true)
  })
})
