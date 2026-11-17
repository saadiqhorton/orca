import { HARNESS_LAUNCH_CAPABILITIES } from '../../../../shared/agent-launch/harness-launch-capabilities'
import {
  formatOrcaHostsEnv,
  ORCA_HOSTS_ENV,
  ORCA_INSTRUCTIONS_FILE_ENV
} from '../../../../shared/orchestration/orca-host-awareness'

let remembered: string[] = []
let instructionFile: string | undefined
let writeGlobalAgentInstructions = true

export function rememberOrcaHostNames(hosts: readonly string[]): void {
  remembered = hosts.filter((name) => name.trim().length > 0)
}

export function rememberOrcaInstructionFile(path: string | undefined): void {
  instructionFile = path
}

export function rememberOrcaWriteGlobalAgentInstructions(value: boolean | undefined): void {
  writeGlobalAgentInstructions = value !== false
}

export function rememberedOrcaHostNames(): readonly string[] {
  return remembered
}

export function rememberedOrcaInstructionFile(): string | undefined {
  return instructionFile
}

export function rememberedOrcaWriteGlobalAgentInstructions(): boolean {
  return writeGlobalAgentInstructions
}

export function applyOrcaHostAwarenessEnv(env: Record<string, string>): void {
  if (remembered.length > 0) {
    env[ORCA_HOSTS_ENV] = formatOrcaHostsEnv(remembered)
  }
  if (instructionFile) {
    env[ORCA_INSTRUCTIONS_FILE_ENV] = instructionFile
  }
}

/** Claude host-instruction argv. Must not be placed on the user extra-args allowlist path. */
export function orcaOwnedHostInstructionArgs(agent: string): string[] | undefined {
  if (agent !== 'claude' || !instructionFile) {
    return undefined
  }
  const channel = HARNESS_LAUNCH_CAPABILITIES.claude.channels.instructions
  if (channel.kind !== 'flag') {
    return undefined
  }
  return [channel.flag, instructionFile]
}
