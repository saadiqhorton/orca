import { describe, expect, it } from 'vitest'
import { cliLaunchPresentation } from './cli-launch-presentation'

describe('cliLaunchPresentation', () => {
  it('keeps local launches in the background unless --focus', () => {
    expect(cliLaunchPresentation({ focus: false, visibleRemote: false })).toBe('background')
    expect(cliLaunchPresentation({ focus: true, visibleRemote: false })).toBe('focused')
  })

  it('omits background for --host surfaces so they become visible tabs', () => {
    expect(cliLaunchPresentation({ focus: false, visibleRemote: true })).toBeUndefined()
    expect(cliLaunchPresentation({ focus: true, visibleRemote: true })).toBe('focused')
  })
})
