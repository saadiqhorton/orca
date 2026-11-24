import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  formatOrcaHostPreamble,
  removeManagedHostInstruction,
  upsertManagedHostInstruction
} from '../../../../shared/orchestration/orca-host-awareness'
import {
  rememberOrcaWriteGlobalAgentInstructions,
  rememberedOrcaWriteGlobalAgentInstructions
} from './orca-host-name-cache'
import { orchestrationScratchPaths } from '../../../../shared/orchestration/orchestration-scratch-workspace'

export const ORCA_AGENT_INSTRUCTIONS_DIR = 'orca-agent-instructions'
export const ORCA_HOST_INSTRUCTION_FILE = 'ORCA.md'

export function orcaHostInstructionPath(userDataPath: string): string {
  return join(userDataPath, ORCA_AGENT_INSTRUCTIONS_DIR, ORCA_HOST_INSTRUCTION_FILE)
}

export function writeGlobalAgentInstructionsEnabled(
  settings?: { orcaWriteGlobalAgentInstructions?: boolean } | null
): boolean {
  return settings?.orcaWriteGlobalAgentInstructions !== false
}

type GlobalInstructionSettings = { orcaWriteGlobalAgentInstructions?: boolean }

export type GlobalInstructionSettingsSource = {
  getSettings?: () => GlobalInstructionSettings
  requireStore?: () => { getSettings: () => GlobalInstructionSettings }
}

export function settingsWriteGlobalSlice(
  source: GlobalInstructionSettingsSource | undefined
): GlobalInstructionSettings | undefined {
  if (!source) {
    return undefined
  }
  if (typeof source.getSettings === 'function') {
    return source.getSettings()
  }
  try {
    return source.requireStore?.().getSettings()
  } catch {
    // Why: a runtime without a store yet falls back to the default (on).
    return undefined
  }
}

export async function writeOrcaHostInstructionFile(
  path: string,
  opts?: { strip?: boolean }
): Promise<void> {
  const preamble = formatOrcaHostPreamble()
  let existing: string | undefined
  try {
    existing = await readFile(path, 'utf8')
  } catch (error) {
    // Why: only a missing file may be created from scratch. Any other read failure
    // (EACCES, EBUSY, EMFILE, EISDIR…) must never replace the user's content.
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (code !== 'ENOENT') {
      return
    }
    existing = undefined
  }
  if (opts?.strip && existing === undefined) {
    return
  }
  // Why: a UTF-16 file decoded as UTF-8 would be corrupted on rewrite; leave it alone.
  if (existing !== undefined && existing.includes('\u0000')) {
    return
  }
  const next = opts?.strip
    ? (removeManagedHostInstruction(existing) ?? existing)
    : upsertManagedHostInstruction(existing, preamble)
  if (next === existing) {
    return
  }
  await mkdir(join(path, '..'), { recursive: true })
  // Why: write a sibling temp file and rename so a crash never truncates the user's file.
  const tmp = `${path}.orca-tmp-${process.pid}`
  await writeFile(tmp, next ?? '', 'utf8')
  try {
    await rename(tmp, path)
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw error
  }
}

function globalAgentInstructionFiles(home: string): string[] {
  return [
    join(home, '.codex', 'AGENTS.md'),
    join(home, '.claude', 'CLAUDE.md'),
    join(home, '.agents', ORCA_HOST_INSTRUCTION_FILE)
  ]
}

function writeGlobalFrom(args: {
  writeGlobalAgentInstructions?: boolean
  settings?: { orcaWriteGlobalAgentInstructions?: boolean } | null
}): boolean {
  if (args.writeGlobalAgentInstructions !== undefined) {
    return args.writeGlobalAgentInstructions
  }
  if (args.settings) {
    return writeGlobalAgentInstructionsEnabled(args.settings)
  }
  return rememberedOrcaWriteGlobalAgentInstructions()
}

export async function installOrcaHostInstructions(args: {
  userDataPath?: string
  home?: string
  extraDirs?: readonly string[]
  writeGlobalAgentInstructions?: boolean
  settings?: { orcaWriteGlobalAgentInstructions?: boolean } | null
}): Promise<string[]> {
  const written: string[] = []
  const home = args.home ?? homedir()
  const writeGlobal = writeGlobalFrom(args)
  rememberOrcaWriteGlobalAgentInstructions(writeGlobal)
  const dirs: string[] = [...(args.extraDirs ?? [])]
  if (args.userDataPath) {
    dirs.push(join(args.userDataPath, ORCA_AGENT_INSTRUCTIONS_DIR))
  }
  dirs.push(orchestrationScratchPaths(home).workspacePath)
  const localFiles = dirs.flatMap((dir) => [
    join(dir, 'AGENTS.md'),
    join(dir, 'CLAUDE.md'),
    join(dir, ORCA_HOST_INSTRUCTION_FILE)
  ])
  // Vitest blocks writes under the real ~/.codex and ~/.claude; tests pass a temp home.
  const globalFiles =
    args.home !== undefined || !process.env.VITEST ? globalAgentInstructionFiles(home) : []
  for (const file of localFiles) {
    await writeOrcaHostInstructionFile(file)
    written.push(file)
  }
  for (const file of globalFiles) {
    if (writeGlobal) {
      await writeOrcaHostInstructionFile(file)
      written.push(file)
    } else {
      await writeOrcaHostInstructionFile(file, { strip: true })
    }
  }
  return written
}
