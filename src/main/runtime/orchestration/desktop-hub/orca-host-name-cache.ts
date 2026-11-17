import {
  formatOrcaHostsEnv,
  ORCA_HOSTS_ENV,
  ORCA_INSTRUCTIONS_FILE_ENV
} from '../../../../shared/orchestration/orca-host-awareness'

let remembered: string[] = []
let instructionFile: string | undefined

export function rememberOrcaHostNames(hosts: readonly string[]): void {
  remembered = hosts.filter((name) => name.trim().length > 0)
}

export function rememberOrcaInstructionFile(path: string | undefined): void {
  instructionFile = path
}

export function rememberedOrcaHostNames(): readonly string[] {
  return remembered
}

export function rememberedOrcaInstructionFile(): string | undefined {
  return instructionFile
}

export function applyOrcaHostAwarenessEnv(env: Record<string, string>): void {
  if (remembered.length > 0) {
    env[ORCA_HOSTS_ENV] = formatOrcaHostsEnv(remembered)
  }
  if (instructionFile) {
    env[ORCA_INSTRUCTIONS_FILE_ENV] = instructionFile
  }
}

export function extraAgentArgsWithHostInstructions(
  agent: string,
  extra: string | undefined
): string | undefined {
  if (agent !== 'claude' || !instructionFile || instructionFile.includes("'")) {
    return extra
  }
  const flag = `--append-system-prompt-file '${instructionFile}'`
  return extra ? `${flag} ${extra}` : flag
}
