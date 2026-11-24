import { describe, expect, it } from 'vitest'
import { newestTerminalReadCursor } from './newest-terminal-read'

describe('newestTerminalReadCursor', () => {
  it('pages backward from the latest cursor so worker-read sees newest scrollback', () => {
    expect(newestTerminalReadCursor({ latestCursor: '500', limit: 50 })).toEqual({
      cursor: 450,
      limit: 50
    })
    expect(newestTerminalReadCursor({ latestCursor: 10, limit: 50 })).toEqual({
      cursor: 0,
      limit: 50
    })
    expect(newestTerminalReadCursor({ latestCursor: '0' })).toBeUndefined()
  })
})
