import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  formatOrcaHostPreamble,
  upsertManagedHostInstruction
} from '../../../../shared/orchestration/orca-host-awareness'
import { orchestrationScratchPaths } from '../../../../shared/orchestration/orchestration-scratch-workspace'

export const ORCA_AGENT_INSTRUCTIONS_DIR = 'orca-agent-instructions'
export const ORCA_HOST_INSTRUCTION_FILE = 'ORCA.md'

export function orcaHostInstructionPath(userDataPath: string): string {
  return join(userDataPath, ORCA_AGENT_INSTRUCTIONS_DIR, ORCA_HOST_INSTRUCTION_FILE)
}

export async function writeOrcaHostInstructionFile(
  path: string,
  hosts: readonly string[]
): Promise<void> {
  const preamble = formatOrcaHostPreamble(hosts)
  let existing: string | undefined
  try {
    existing = await readFile(path, 'utf8')
  } catch {
    existing = undefined
  }
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, upsertManagedHostInstruction(existing, preamble), 'utf8')
}

function globalAgentInstructionFiles(home: string): string[] {
  return [
    join(home, '.codex', 'AGENTS.md'),
    join(home, '.claude', 'CLAUDE.md'),
    join(home, '.agents', ORCA_HOST_INSTRUCTION_FILE)
  ]
}

export async function installOrcaHostInstructions(args: {
  hosts: readonly string[]
  userDataPath?: string
  home?: string
  extraDirs?: readonly string[]
}): Promise<string[]> {
  const written: string[] = []
  const home = args.home ?? homedir()
  const dirs: string[] = [...(args.extraDirs ?? [])]
  if (args.userDataPath) {
    dirs.push(join(args.userDataPath, ORCA_AGENT_INSTRUCTIONS_DIR))
  }
  dirs.push(orchestrationScratchPaths(home).workspacePath)
  const files = [
    ...dirs.flatMap((dir) => [
      join(dir, 'AGENTS.md'),
      join(dir, 'CLAUDE.md'),
      join(dir, ORCA_HOST_INSTRUCTION_FILE)
    ]),
    // Vitest blocks writes under the real ~/.codex and ~/.claude; tests pass a temp home.
    ...(args.home !== undefined || !process.env.VITEST ? globalAgentInstructionFiles(home) : [])
  ]
  for (const file of files) {
    await writeOrcaHostInstructionFile(file, args.hosts)
    written.push(file)
  }
  return written
}
