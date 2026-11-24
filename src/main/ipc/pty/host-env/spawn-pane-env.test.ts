import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ORCA_HOSTS_ENV,
  ORCA_INSTRUCTIONS_FILE_ENV
} from '../../../../shared/orchestration/orca-host-awareness'
import {
  rememberOrcaHostNames,
  rememberOrcaInstructionFile
} from '../../../runtime/orchestration/desktop-hub/orca-host-name-cache'
import { stampPtySpawnPaneEnv } from './spawn-pane-env'

afterEach(() => {
  rememberOrcaHostNames([])
  rememberOrcaInstructionFile(undefined)
})

describe('stampPtySpawnPaneEnv host awareness', () => {
  it('puts ORCA_HOSTS on every pane and keeps the instruction file off remote panes', () => {
    const instructionFile = join('user-data', 'orca-agent-instructions', 'ORCA.md')
    rememberOrcaHostNames(['ubuntu-server-local'])
    rememberOrcaInstructionFile(instructionFile)
    const local: Record<string, string> = {}
    stampPtySpawnPaneEnv(local, { pane: null, jcodeRuntimeDir: undefined })
    expect(local[ORCA_HOSTS_ENV]).toBe('ubuntu-server-local')
    expect(local[ORCA_INSTRUCTIONS_FILE_ENV]).toBe(instructionFile)
    const remote: Record<string, string> = { [ORCA_INSTRUCTIONS_FILE_ENV]: instructionFile }
    stampPtySpawnPaneEnv(remote, {
      pane: null,
      jcodeRuntimeDir: undefined,
      isRemote: true
    })
    expect(remote[ORCA_HOSTS_ENV]).toBe('ubuntu-server-local')
    expect(remote[ORCA_INSTRUCTIONS_FILE_ENV]).toBeUndefined()
  })
})
