export type HarnessTransport = 'tui' | 'acp' | 'codex-app-server' | 'claude-stream-json'

export type HarnessFlag = { kind: 'flag'; flag: string; minVersion?: string }
export type HarnessEnv = { kind: 'env'; name: string }
export type HarnessProtocol = { kind: 'protocol'; on: 'acp.session/new' }
export type HarnessCandidate = HarnessFlag | HarnessEnv | HarnessProtocol

export type HarnessChannel =
  | HarnessFlag
  | HarnessEnv
  | { kind: 'none' }
  | { kind: 'untested'; candidate: HarnessCandidate; reason: string }

export type HarnessLaunchCapabilities = {
  transport: HarnessTransport
  channels: {
    instructions: HarnessChannel
    mcp: HarnessChannel
    skills: HarnessChannel
    settings: HarnessChannel
  }
  readsManagedInstructionFiles: boolean
}

export const NONE: HarnessChannel = { kind: 'none' }
export const ACP_SESSION_NEW: HarnessProtocol = { kind: 'protocol', on: 'acp.session/new' }

export function flag(name: string, minVersion?: string): HarnessFlag {
  return minVersion ? { kind: 'flag', flag: name, minVersion } : { kind: 'flag', flag: name }
}

export function env(name: string): HarnessEnv {
  return { kind: 'env', name }
}

export function untested(candidate: HarnessCandidate, reason: string): HarnessChannel {
  return { kind: 'untested', candidate, reason }
}

export function channels(
  instructions: HarnessChannel,
  mcp: HarnessChannel,
  skills: HarnessChannel,
  settings: HarnessChannel
): HarnessLaunchCapabilities['channels'] {
  return { instructions, mcp, skills, settings }
}

export const NO_CHANNELS = channels(NONE, NONE, NONE, NONE)
