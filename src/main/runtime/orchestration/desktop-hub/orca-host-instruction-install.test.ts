import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  orcaOwnedHostInstructionArgs,
  rememberOrcaHostNames,
  rememberOrcaInstructionFile,
  rememberOrcaWriteGlobalAgentInstructions
} from './orca-host-name-cache'
import { installOrcaHostInstructions, writeOrcaHostInstructionFile } from './orca-host-instruction-install'

const homes: string[] = []

afterEach(async () => {
  rememberOrcaHostNames([])
  rememberOrcaInstructionFile(undefined)
  rememberOrcaWriteGlobalAgentInstructions(true)
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
    expect(agents).toMatch(/Host list as of \d{4}-\d{2}-\d{2}T\d{2}:00Z/)
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

  it('exposes Claude host-instruction argv as Orca-owned tokens, not extras', () => {
    rememberOrcaInstructionFile('/tmp/orca-agent-instructions/ORCA.md')
    expect(orcaOwnedHostInstructionArgs('claude')).toEqual([
      '--append-system-prompt-file',
      '/tmp/orca-agent-instructions/ORCA.md'
    ])
    expect(orcaOwnedHostInstructionArgs('codex')).toBeUndefined()
  })

  it('skips and strips global instruction files when the setting is off', async () => {
    const home = await mkdtemp(join(tmpdir(), 'orca-instr-off-'))
    homes.push(home)
    const userDataPath = join(home, 'user-data')
    await installOrcaHostInstructions({
      hosts: ['dockhand'],
      userDataPath,
      home,
      writeGlobalAgentInstructions: true
    })
    expect(await readFile(join(home, '.codex', 'AGENTS.md'), 'utf8')).toContain('dockhand')
    await installOrcaHostInstructions({
      hosts: ['dockhand', 'ubuntu-server-local'],
      userDataPath,
      home,
      writeGlobalAgentInstructions: false
    })
    const stripped = await readFile(join(home, '.codex', 'AGENTS.md'), 'utf8')
    expect(stripped).not.toContain('orca-managed:host-preamble')
    expect(stripped).not.toContain('ubuntu-server-local')
    const local = await readFile(join(home, 'orca-orchestration', 'AGENTS.md'), 'utf8')
    expect(local).toContain('ubuntu-server-local')
  })
})

describe('writeOrcaHostInstructionFile safety (box patch)', () => {
  it('keeps user content and never rewrites on a non-ENOENT read failure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orca-instr-'))
    homes.push(dir)
    const user = join(dir, 'AGENTS.md')
    await writeFile(user, '# mine\nkeep me\n', 'utf8')
    await writeOrcaHostInstructionFile(user, ['a'])
    await writeOrcaHostInstructionFile(user, ['a', 'b'])
    const text = await readFile(user, 'utf8')
    expect(text.startsWith('# mine\nkeep me\n')).toBe(true)
    expect(text.match(/<!-- orca-managed:host-preamble -->/g)?.length).toBe(1)
    expect(text).toContain('Connected machines: a, b.')
    const asDir = join(dir, 'CLAUDE.md')
    await mkdir(asDir)
    await writeOrcaHostInstructionFile(asDir, ['a'])
    const utf16 = join(dir, 'U16.md')
    await writeFile(utf16, Buffer.from('\ufeffhi', 'utf16le'))
    await writeOrcaHostInstructionFile(utf16, ['a'])
    expect((await readFile(utf16)).equals(Buffer.from('\ufeffhi', 'utf16le'))).toBe(true)
    expect((await readdir(dir)).filter((n) => n.includes('orca-tmp'))).toEqual([])
  })

  it('strip restores the user file byte-for-byte including blank-line runs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orca-instr-strip-'))
    homes.push(dir)
    const user = join(dir, 'AGENTS.md')
    const original = '# mine\n\n\nthree-newline gap above\n'
    await writeFile(user, original, 'utf8')
    await writeOrcaHostInstructionFile(user, ['dockhand'])
    expect(await readFile(user, 'utf8')).toContain('orca-managed:host-preamble')
    await writeOrcaHostInstructionFile(user, ['dockhand'], { strip: true })
    expect(await readFile(user, 'utf8')).toBe(original)
  })
})
