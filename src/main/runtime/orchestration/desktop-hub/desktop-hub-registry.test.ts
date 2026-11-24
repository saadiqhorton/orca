import { describe, expect, it } from 'vitest'
import {
  DesktopHubError,
  desktopHubSelector,
  type DesktopHubRequestEvent
} from '../../../../shared/orchestration/desktop-hub-contract'
import { getDesktopHubRegistry } from './desktop-hub-registry'

const HUB = {
  userId: 'desktop-user-000001',
  appInstallationId: 'desktop-install-0001',
  pairedDeviceId: 'desktop-device'
}

const CONNECTED = {
  kind: 'execution' as const,
  name: 'ubuntu-server-local',
  machineName: 'ubuntu-server-local',
  id: 'env-ubuntu',
  hostKey: 'env-ubuntu',
  selector: desktopHubSelector('env-ubuntu'),
  status: 'connected' as const,
  peerFingerprint: 'fp-ubuntu',
  homePeerFingerprint: 'fp-home'
}

describe('desktop hub registry', () => {
  it('lists connected remotes and forwards the worker call to that host', async () => {
    const runtime = {}
    const registry = getDesktopHubRegistry(runtime)
    const forwarded: string[] = []
    const ssh = (): void => {
      throw new Error('ssh was used')
    }
    registry.register({
      ...HUB,
      emit(event) {
        const body = answer(event, forwarded, ssh)
        registry.answer(HUB.pairedDeviceId, { requestId: event.requestId, ...body })
      }
    })
    const listed = await registry.list()
    expect(listed.hub).toBe('remote')
    expect(listed.hosts.map((host) => host.name)).toContain('ubuntu-server-local')
    const placed = await registry.place('ubuntu-server-local')
    expect(placed.selector).toBe(desktopHubSelector('env-ubuntu'))
    const response = await registry.call(
      placed.selector,
      'orchestration.federationAttachStart',
      { task: 'hostname' },
      1000,
      undefined
    )
    expect(response).toMatchObject({
      ok: true,
      result: { forwarded: 'orchestration.federationAttachStart' }
    })
    expect(forwarded).toEqual(['orchestration.federationAttachStart'])
    await expect(registry.place('TEMPLEOFDOOM')).rejects.toMatchObject({ code: 'needs_sign_in' })
    await expect(registry.place('ARCHIT4ME')).rejects.toMatchObject({ code: 'host_unreachable' })
    await expect(registry.place('ssh:legacy')).rejects.toMatchObject({ code: 'host_unreachable' })
    expect(forwarded).toEqual(['orchestration.federationAttachStart'])
  })

  it('refuses a session from another desktop app or user', async () => {
    const runtime = {}
    const registry = getDesktopHubRegistry(runtime)
    let event: DesktopHubRequestEvent | undefined
    const registered = registry.register({
      ...HUB,
      emit: (next) => {
        event = next
      }
    })
    expect(registered.accepted).toBe(true)
    expect(
      registry.register({
        ...HUB,
        userId: 'other-user-00000001',
        pairedDeviceId: 'other-device',
        emit: () => {
          throw new Error('another desktop was asked')
        }
      }).accepted
    ).toBe(false)
    expect(() => registry.assertCaller({ pairedDeviceId: 'other-device' })).toThrow(DesktopHubError)
    expect(() => registry.assertCaller({ pairedDeviceId: 'other-device' })).toThrow(
      /not the desktop app and user/
    )
    expect(() => registry.assertCaller({})).not.toThrow()
    const pending = registry.place('ubuntu-server-local')
    if (!event) {
      throw new Error('desktop was not asked')
    }
    const asked = event
    expect(() =>
      registry.answer('other-device', { requestId: asked.requestId, ok: true, result: CONNECTED })
    ).toThrow(/not the desktop app and user/)
    registry.answer(HUB.pairedDeviceId, { requestId: asked.requestId, ok: true, result: CONNECTED })
    await expect(pending).resolves.toMatchObject({ name: 'ubuntu-server-local' })
  })

  it('times out a silent hub volunteer with desktop_hub_call_timeout, not host_unreachable', async () => {
    const runtime = {}
    const registry = getDesktopHubRegistry(runtime)
    registry.register({
      ...HUB,
      emit(event) {
        if (event.op === 'call') {
          return
        }
        const body = answer(event, [], () => {
          throw new Error('ssh was used')
        })
        registry.answer(HUB.pairedDeviceId, { requestId: event.requestId, ...body })
      }
    })
    const placed = await registry.place('ubuntu-server-local')
    await expect(
      registry.call(placed.selector, 'agent.launch', { agent: 'claude' }, 20, undefined)
    ).rejects.toMatchObject({
      code: 'desktop_hub_call_timeout',
      message: expect.stringContaining('never via keystrokes')
    })
  })
})

function answer(
  event: DesktopHubRequestEvent,
  forwarded: string[],
  ssh: () => void
): { ok: true; result: unknown } | { ok: false; error: { code: string; message: string } } {
  if (event.method?.includes('ssh') || event.name?.startsWith('ssh:')) {
    ssh()
  }
  if (event.op === 'list') {
    return {
      ok: true,
      result: {
        hosts: [
          { ...CONNECTED, selector: '--host ubuntu-server-local' },
          {
            ...CONNECTED,
            name: 'TEMPLEOFDOOM',
            machineName: 'TEMPLEOFDOOM',
            id: 'env-temple',
            hostKey: 'env-temple',
            status: 'needs_sign_in',
            selector: '--host TEMPLEOFDOOM'
          },
          {
            ...CONNECTED,
            name: 'ARCHIT4ME',
            machineName: 'ARCHIT4ME',
            id: 'env-arch',
            hostKey: 'env-arch',
            status: 'unreachable',
            selector: '--host ARCHIT4ME'
          }
        ]
      }
    }
  }
  if (event.name === 'TEMPLEOFDOOM') {
    return {
      ok: false,
      error: {
        code: 'needs_sign_in',
        message:
          'Host "TEMPLEOFDOOM" needs sign-in in the desktop app before a worker can start there.'
      }
    }
  }
  if (event.name === 'ARCHIT4ME') {
    return {
      ok: false,
      error: {
        code: 'host_unreachable',
        message:
          'Host "ARCHIT4ME" is unreachable from the desktop app. It is not connected, and Orca will not try SSH.'
      }
    }
  }
  if (event.op === 'call' && event.method) {
    forwarded.push(event.method)
    return {
      ok: true,
      result: { ok: true, result: { forwarded: event.method }, _meta: { runtimeId: 'host-b' } }
    }
  }
  return { ok: true, result: CONNECTED }
}

describe('desktop hub session index', () => {
  it('remembers which host returned a terminal handle', () => {
    const registry = getDesktopHubRegistry({})
    registry.rememberSessionHandles('env-ubuntu', {
      ok: true,
      result: { terminal: { handle: 'term_abc123' } }
    })
    expect(registry.knownSessionHost('term_abc123')).toBe('env-ubuntu')
    expect(registry.knownSessionHost('term_other')).toBeUndefined()
  })
})
