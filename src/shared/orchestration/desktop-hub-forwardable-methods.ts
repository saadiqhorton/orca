import { DesktopHubError } from './desktop-hub-contract'

const HUB_CONTROL_PREFIX = 'orchestration.desktopHub.'

/** Methods a desktop-hub hop may run on another connected host. Pairing, accounts, and settings stay local. */
const FORWARDABLE_PREFIXES = [
  'orchestration.',
  'agent.',
  'terminal.',
  'worktree.',
  'folderWorkspace.',
  'projectGroup.',
  'repo.',
  'status.',
  'session.'
] as const

const DENIED_PREFIXES = [
  HUB_CONTROL_PREFIX,
  'pairing.',
  'accounts.',
  'settings.',
  'github.',
  'gitlab.',
  'secrets.',
  'credential.'
] as const

export function isDesktopHubForwardableMethod(method: string): boolean {
  if (DENIED_PREFIXES.some((prefix) => method.startsWith(prefix))) {
    return false
  }
  return FORWARDABLE_PREFIXES.some((prefix) => method.startsWith(prefix))
}

export function assertDesktopHubForwardableMethod(method: string): void {
  if (!isDesktopHubForwardableMethod(method)) {
    throw new DesktopHubError('forbidden', `Desktop hub cannot forward ${method} to another host.`)
  }
}
