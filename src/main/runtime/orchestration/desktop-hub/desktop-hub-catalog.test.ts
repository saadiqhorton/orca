import { describe, expect, it } from 'vitest'
import { desktopHubRowMatches } from '../../../../shared/orchestration/desktop-hub-contract'
import { buildDesktopHubCatalog } from './desktop-hub-catalog'

describe('desktop hub catalog names', () => {
  it('lists the environment name and resolves --host ubuntu-server-local when the machine is dezignerdrugz00', () => {
    const catalog = buildDesktopHubCatalog({
      machineName: 'windows-desktop',
      executions: [
        {
          label: 'ubuntu-server-local',
          machineName: 'dezignerdrugz00',
          environmentId: 'env-ubuntu',
          health: 'available',
          server: { name: 'ubuntu', peerFingerprint: 'fp-ubuntu', homePeerFingerprint: 'fp-home' }
        }
      ]
    })
    const row = catalog.hosts.find((host) => host.kind === 'execution')
    expect(row).toMatchObject({
      name: 'ubuntu-server-local',
      machineName: 'dezignerdrugz00',
      label: 'ubuntu-server-local',
      selector: '--host ubuntu-server-local',
      status: 'connected'
    })
    expect(desktopHubRowMatches(row!, 'ubuntu-server-local')).toBe(true)
    expect(desktopHubRowMatches(row!, 'dezignerdrugz00')).toBe(true)
  })

  it('matches --host 192.168.1.35 when clawd is labelled with that SSH host', () => {
    const catalog = buildDesktopHubCatalog({
      machineName: 'windows-desktop',
      executions: [
        {
          label: 'clawd',
          environmentId: 'env-clawd',
          health: 'available',
          sshHost: '192.168.1.35',
          sshLabel: 'clawd',
          server: { name: 'clawd', peerFingerprint: 'fp-clawd' }
        }
      ]
    })
    const row = catalog.hosts.find((host) => host.kind === 'execution')
    expect(row).toMatchObject({
      name: 'clawd',
      aliases: ['192.168.1.35']
    })
    expect(desktopHubRowMatches(row!, '192.168.1.35')).toBe(true)
    expect(desktopHubRowMatches(row!, 'clawd')).toBe(true)
  })
})
