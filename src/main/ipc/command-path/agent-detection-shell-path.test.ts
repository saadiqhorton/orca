import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appendUserLocalBinToPath } from './agent-detection-shell-path'

describe('appendUserLocalBinToPath', () => {
  const original = process.env.PATH

  afterEach(() => {
    process.env.PATH = original
  })

  it('adds ~/.local/bin when a non-login PATH omitted it', () => {
    process.env.PATH = '/usr/bin'
    appendUserLocalBinToPath()
    expect(process.env.PATH?.split(':')).toContain(join(homedir(), '.local/bin'))
    expect(process.env.PATH?.startsWith('/usr/bin')).toBe(true)
  })

  it('does not duplicate ~/.local/bin', () => {
    const dir = join(homedir(), '.local/bin')
    process.env.PATH = `${dir}:/usr/bin`
    appendUserLocalBinToPath()
    expect(process.env.PATH).toBe(`${dir}:/usr/bin`)
  })
})
