import { describe, expect, it } from 'vitest'
import {
  isFolderWorkspaceNotFound,
  shouldSettleMissingWorkerStop
} from './worker-stop-missing-folder'

describe('shouldSettleMissingWorkerStop', () => {
  it('settles when the folder catalog row is gone and the terminal is gone', () => {
    expect(isFolderWorkspaceNotFound('folder_workspace_not_found')).toBe(true)
    expect(
      shouldSettleMissingWorkerStop({
        error: 'folder_workspace_not_found',
        capabilityRevoked: true,
        terminalGone: true
      })
    ).toBe(true)
    expect(
      shouldSettleMissingWorkerStop({
        error: 'folder_workspace_not_found',
        capabilityRevoked: false,
        terminalGone: false
      })
    ).toBe(false)
  })
})
