import { describe, expect, it } from 'vitest'
import {
  DESKTOP_HUB_LONG_CALL_TIMEOUT_MS,
  desktopHubCallTimeoutMessage,
  desktopHubClientTimeoutMs,
  desktopHubForwardTimeoutMs
} from './desktop-hub-call-timeout'

describe('desktop hub long-call timeouts', () => {
  it('gives agent.launch 90s so readiness is not cut off at 15s', () => {
    expect(desktopHubForwardTimeoutMs('agent.launch', undefined)).toBe(
      DESKTOP_HUB_LONG_CALL_TIMEOUT_MS
    )
    expect(desktopHubForwardTimeoutMs('agent.launchReplay', undefined)).toBe(
      DESKTOP_HUB_LONG_CALL_TIMEOUT_MS
    )
    expect(desktopHubForwardTimeoutMs('orchestration.workerStart', undefined)).toBe(
      DESKTOP_HUB_LONG_CALL_TIMEOUT_MS
    )
    expect(desktopHubForwardTimeoutMs('terminal.list', undefined)).toBeUndefined()
    expect(desktopHubForwardTimeoutMs('agent.launch', 120_000)).toBe(120_000)
    expect(desktopHubClientTimeoutMs(90_000)).toBe(100_000)
  })

  it('names the host, method, and the no-keystroke next step', () => {
    const message = desktopHubCallTimeoutMessage({
      host: 'ubuntu-server-local',
      method: 'agent.launch',
      timeoutMs: 90_000
    })
    expect(message).toContain('timed out')
    expect(message).toContain('ubuntu-server-local')
    expect(message).toContain('agent.launch')
    expect(message).toContain('never via keystrokes')
    expect(message).toContain('--host')
  })
})
