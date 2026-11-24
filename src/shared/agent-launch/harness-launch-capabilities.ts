import type { TuiAgent } from './catalog/tui-agent'
import type { HarnessLaunchCapabilities } from './harness-launch-capability-types'
import { STRUCTURED_HARNESS_CAPABILITIES } from './harness-structured-capabilities'
import { TUI_HARNESS_CAPABILITIES } from './harness-tui-capabilities'

export const HARNESS_LAUNCH_CAPABILITIES: Record<TuiAgent, HarnessLaunchCapabilities> = {
  ...STRUCTURED_HARNESS_CAPABILITIES,
  ...TUI_HARNESS_CAPABILITIES
}
