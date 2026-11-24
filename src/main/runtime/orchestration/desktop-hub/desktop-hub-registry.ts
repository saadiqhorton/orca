import { randomUUID } from 'node:crypto'
import type { RuntimeRpcResponse } from '../../../../shared/remote-runtime/rpc/runtime-rpc-envelope'
import {
  DESKTOP_HUB_SESSION_REFUSED_MESSAGE,
  DESKTOP_HUB_UNAVAILABLE_MESSAGE,
  DesktopHubError,
  DesktopHubPlacementSchema,
  desktopHubHostError,
  type DesktopHubHostRow,
  type DesktopHubPlacement,
  type DesktopHubRequestEvent
} from '../../../../shared/orchestration/desktop-hub-contract'
import { isTerminalHandle } from '../../../../shared/terminal/terminal-handle-prefix'
import { readDesktopHubPlacement, writeDesktopHubPlacement } from './desktop-hub-placement-store'

function desktopHubAskTimeoutMessage(
  fields: Omit<DesktopHubRequestEvent, 'type' | 'requestId'>,
  timeoutMs: number
): string {
  const host = fields.name ?? fields.hostKey ?? 'the target host'
  const method = fields.method ?? fields.op
  return (
    `Desktop hub call timed out after ${timeoutMs}ms forwarding ${method} to "${host}". ` +
    `The tab may still be opening. Check with \`orca terminal list --host ${host}\` or \`orca host inventory --json\`. ` +
    'If a trust, hooks, or security dialog is on screen, open the tab in the desktop Orca window and answer it yourself — never via keystrokes. Retry the same command with --host.'
  )
}

function collectTerminalHandles(value: unknown, depth: number, found: Set<string>): void {
  if (depth < 0 || typeof value !== 'object' || value === null) {
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTerminalHandles(item, depth - 1, found)
    }
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'handle' && typeof child === 'string' && isTerminalHandle(child)) {
      found.add(child)
    } else {
      collectTerminalHandles(child, depth - 1, found)
    }
  }
}

type Volunteer = {
  pairedDeviceId: string
  appInstallationId: string
  userId: string
  emit: (event: DesktopHubRequestEvent) => void
}

type Pending = {
  pairedDeviceId: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type BoundHub = {
  userId: string
  appInstallationId: string
  pairedDeviceId: string
}

const registries = new WeakMap<WeakKey, DesktopHubRegistry>()

export function getDesktopHubRegistry(runtime: WeakKey): DesktopHubRegistry {
  const existing = registries.get(runtime)
  if (existing) {
    return existing
  }
  const created = new DesktopHubRegistry()
  registries.set(runtime, created)
  return created
}

export class DesktopHubRegistry {
  private bound: BoundHub | null = null
  private readonly volunteers: Volunteer[] = []
  private readonly pending = new Map<string, Pending>()
  private readonly placements = new Map<string, DesktopHubPlacement>()
  private readonly sessionHosts = new Map<string, string>()

  register(input: Volunteer): { accepted: boolean; stop: () => void } {
    if (
      this.bound &&
      (this.bound.userId !== input.userId ||
        this.bound.appInstallationId !== input.appInstallationId ||
        this.bound.pairedDeviceId !== input.pairedDeviceId)
    ) {
      return { accepted: false, stop: () => {} }
    }
    this.bound = {
      userId: input.userId,
      appInstallationId: input.appInstallationId,
      pairedDeviceId: input.pairedDeviceId
    }
    this.volunteers.push(input)
    return {
      accepted: true,
      stop: () => {
        const index = this.volunteers.indexOf(input)
        if (index !== -1) {
          this.volunteers.splice(index, 1)
        }
      }
    }
  }

  hasVolunteer(): boolean {
    return this.volunteers.length > 0
  }

  /** A local CLI session has no paired device. Any other device is refused. */
  assertCaller(caller: { pairedDeviceId?: string }): void {
    if (!caller.pairedDeviceId) {
      return
    }
    if (!this.bound || caller.pairedDeviceId !== this.bound.pairedDeviceId) {
      throw new DesktopHubError('session_refused', DESKTOP_HUB_SESSION_REFUSED_MESSAGE)
    }
  }

  async list(): Promise<{
    hub: 'remote' | 'unavailable'
    hosts: DesktopHubHostRow[]
    message?: string
  }> {
    if (!this.hasVolunteer()) {
      return { hub: 'unavailable', hosts: [], message: DESKTOP_HUB_UNAVAILABLE_MESSAGE }
    }
    const result = await this.ask({ op: 'list' }, 15_000)
    if (
      !result ||
      typeof result !== 'object' ||
      !('hosts' in result) ||
      !Array.isArray(result.hosts)
    ) {
      throw new DesktopHubError('host_unreachable', DESKTOP_HUB_UNAVAILABLE_MESSAGE)
    }
    return { hub: 'remote', hosts: result.hosts as DesktopHubHostRow[] }
  }

  async place(name: string): Promise<DesktopHubPlacement> {
    if (name.startsWith('ssh:')) {
      throw new DesktopHubError(
        'host_unreachable',
        `Host "${name}" is an SSH target. Orca will not use SSH to start a worker.`
      )
    }
    const placed = DesktopHubPlacementSchema.parse(await this.ask({ op: 'resolve', name }, 15_000))
    const blocked = desktopHubHostError(placed.status, placed.name)
    if (blocked) {
      throw blocked
    }
    this.remember(placed)
    return placed
  }

  resolveCached(selector: string): DesktopHubPlacement {
    const cached = this.placements.get(selector) ?? readDesktopHubPlacement(selector)
    if (!cached?.peerFingerprint) {
      throw new DesktopHubError(
        'desktop_hub_unavailable',
        "This host's desktop placement is not cached. Reconnect the desktop app and retry. Orca will not try SSH."
      )
    }
    this.placements.set(selector, cached)
    return cached
  }

  rememberSession(handle: string, hostKey: string): void {
    this.sessionHosts.set(handle, hostKey)
  }

  rememberSessionHandles(hostKey: string, result: unknown): void {
    const found = new Set<string>()
    collectTerminalHandles(result, 4, found)
    for (const handle of found) {
      this.rememberSession(handle, hostKey)
    }
  }

  knownSessionHost(handle: string): string | undefined {
    return this.sessionHosts.get(handle)
  }

  hasPlacement(selector: string): boolean {
    return this.placements.has(selector) || readDesktopHubPlacement(selector) !== null
  }

  async call(
    selector: string,
    method: string,
    params: unknown,
    timeoutMs: number | undefined,
    envelope: unknown
  ): Promise<RuntimeRpcResponse<unknown>> {
    const placed = this.placements.get(selector) ?? readDesktopHubPlacement(selector)
    if (!placed) {
      throw new DesktopHubError('desktop_hub_unavailable', DESKTOP_HUB_UNAVAILABLE_MESSAGE)
    }
    const blocked = desktopHubHostError(placed.status, placed.name)
    if (blocked) {
      throw blocked
    }
    const waitMs = Math.min(Math.max(timeoutMs ?? 15_000, 1), 30 * 60 * 1000)
    const result = await this.ask(
      {
        op: 'call',
        hostKey: placed.hostKey,
        method,
        params,
        timeoutMs,
        envelope,
        pairingRevision: placed.pairingRevision
      },
      waitMs
    )
    if (!result || typeof result !== 'object' || !('ok' in result)) {
      throw new DesktopHubError(
        'host_unreachable',
        `Host "${placed.name}" is unreachable from the desktop app. It is not connected, and Orca will not try SSH.`
      )
    }
    return result as RuntimeRpcResponse<unknown>
  }

  answer(
    callerDeviceId: string,
    body: {
      requestId: string
      ok: boolean
      result?: unknown
      error?: { code: string; message: string }
    }
  ): { accepted: true } {
    const pending = this.pending.get(body.requestId)
    if (!pending || pending.pairedDeviceId !== callerDeviceId) {
      throw new DesktopHubError('session_refused', DESKTOP_HUB_SESSION_REFUSED_MESSAGE)
    }
    clearTimeout(pending.timer)
    this.pending.delete(body.requestId)
    if (!body.ok) {
      pending.reject(
        new DesktopHubError(
          body.error?.code ?? 'host_unreachable',
          body.error?.message ?? 'The desktop app could not reach that host. Orca will not try SSH.'
        )
      )
    } else {
      pending.resolve(body.result)
    }
    return { accepted: true }
  }

  private remember(placement: DesktopHubPlacement): void {
    this.placements.set(placement.selector, placement)
    writeDesktopHubPlacement(placement)
  }

  private ask(
    fields: Omit<DesktopHubRequestEvent, 'type' | 'requestId'>,
    timeoutMs: number
  ): Promise<unknown> {
    if (!this.bound || this.volunteers.length === 0) {
      throw new DesktopHubError('desktop_hub_unavailable', DESKTOP_HUB_UNAVAILABLE_MESSAGE)
    }
    const requestId = randomUUID()
    const pairedDeviceId = this.bound.pairedDeviceId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(
          new DesktopHubError(
            'desktop_hub_call_timeout',
            desktopHubAskTimeoutMessage(fields, timeoutMs)
          )
        )
      }, timeoutMs)
      timer.unref?.()
      this.pending.set(requestId, { pairedDeviceId, resolve, reject, timer })
      const event: DesktopHubRequestEvent = {
        type: 'orchestrationHubRequested',
        requestId,
        ...fields
      }
      for (const volunteer of this.volunteers) {
        if (volunteer.pairedDeviceId === pairedDeviceId) {
          volunteer.emit(event)
        }
      }
    })
  }
}
