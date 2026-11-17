import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ORCHESTRATION_SCRATCH_GROUP_NAME,
  orchestrationScratchPaths,
  orchestrationScratchWorktreeSelector,
  sanitizeOrchestrationScratchName
} from './orchestration-scratch-workspace'

describe('orchestration scratch workspace', () => {
  it('defaults the folder to ~/orca-orchestration, never home', () => {
    const paths = orchestrationScratchPaths('/home/saadiq')
    expect(paths.workspacePath).toBe(path.join('/home/saadiq', 'orca-orchestration'))
    expect(paths.workspacePath).not.toBe('/home/saadiq')
    expect(paths.groupName).toBe(ORCHESTRATION_SCRATCH_GROUP_NAME)
    expect(orchestrationScratchWorktreeSelector('fld_scratch')).toBe('folder:fld_scratch')
  })

  it('nests a named workspace under the scratch root', () => {
    expect(orchestrationScratchPaths('/home/saadiq', 'review-bot').workspacePath).toBe(
      path.join('/home/saadiq', 'orca-orchestration', 'review-bot')
    )
    expect(sanitizeOrchestrationScratchName(undefined)).toBe('scratch')
  })

  it('refuses path fragments that would escape the scratch root', () => {
    expect(() => sanitizeOrchestrationScratchName('../home')).toThrow(/Invalid scratch/)
    expect(() => sanitizeOrchestrationScratchName('a/b')).toThrow(/Invalid scratch/)
    expect(() => sanitizeOrchestrationScratchName('')).toBeDefined()
  })
})
