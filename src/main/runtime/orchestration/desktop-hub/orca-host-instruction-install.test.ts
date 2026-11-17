import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extraAgentArgsWithHostInstructions,
  rememberOrcaHostNames,
  rememberOrcaInstructionFile
} from './orca-host-name-cache'
import { installOrcaHostInstructions } from './orca-host-instruction-install'

const homes: string[] = []

afterEach(async () => {
  rememberOrcaHostNames([])
  rememberOrcaInstructionFile(undefined)
  await Promise.all(homes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('installOrcaHostInstructions', () => {
  it('writes AGENTS.md and CLAUDE.md that Orca can keep current', async () => {
    const home = await mkdtemp(join(tmpdir(), 'orca-instr-'))
    homes.push(home)
    const userDataPath = join(home, 'user-data')
    await installOrcaHostInstructions({
      hosts: ['dockhand', 'ubuntu-server-local'],
      userDataPath,
      home
    })
    const agents = await readFile(join(home, 'orca-orchestration', 'AGENTS.md'), 'utf8')
    const claude = await readFile(
      join(userDataPath, 'orca-agent-instructions', 'CLAUDE.md'),
      'utf8'
    )
    expect(agents).toContain('ubuntu-server-local')
    expect(agents).toContain('never ssh')
    expect(claude).toContain('orca host inventory --json')
    await installOrcaHostInstructions({
      hosts: ['dockhand'],
      userDataPath,
      home
    })
    const updated = await readFile(join(home, 'orca-orchestration', 'AGENTS.md'), 'utf8')
    expect(updated).toContain('dockhand')
    expect(updated).not.toContain('ubuntu-server-local')
    const globalCodex = await readFile(join(home, '.codex', 'AGENTS.md'), 'utf8')
    expect(globalCodex).toContain('You run inside Orca.')
    expect(globalCodex).toContain('dockhand')
  })

  it('injects Claude --append-system-prompt-file from the managed instruction path', () => {
    rememberOrcaInstructionFile('/tmp/orca-agent-instructions/ORCA.md')
    expect(extraAgentArgsWithHostInstructions('claude', undefined)).toBe(
      "--append-system-prompt-file '/tmp/orca-agent-instructions/ORCA.md'"
    )
    expect(extraAgentArgsWithHostInstructions('codex', undefined)).toBeUndefined()
  })
})
