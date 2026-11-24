import type { CommandHandler } from '../dispatch/dispatch'
import {
  assertAgentLaunchPromptDelivered,
  callAgentLaunch,
  formatAgentLaunch,
  getAgentLaunchCapabilities,
  parseCliAgent,
  readCliAgentLaunch
} from './agent-launch-request'
import { cliLaunchPresentation } from './cli-launch-presentation'
import { applyGroupWorktreeFlag } from '../hosts/orchestration-group-flag'
import { applyRemoteGroupPlacement } from '../hosts/orchestration-group-fallback'
import { resolveGroupWorktreeOnTarget } from '../hosts/orchestration-group-placement'
import { getRequiredStringFlag } from '../arguments/flags'
import { printResult } from '../output/command-result-output'
import { RuntimeClientError } from '../runtime/types'
import {
  getRequiredWorktreeSelector,
  resolveCurrentWorktreeSelector
} from '../workspace-selection/workspace-selector'

export const AGENT_LAUNCH_HANDLERS: Record<string, CommandHandler> = {
  'agent launch': async ({ flags, client, cwd, json, rawArgs }) => {
    const launch = readCliAgentLaunch(flags, parseCliAgent(getRequiredStringFlag(flags, 'agent')), {
      createsWorktree: false
    })
    applyGroupWorktreeFlag(flags)
    await applyRemoteGroupPlacement(flags, client, cwd)
    await resolveGroupWorktreeOnTarget(client, flags)
    const selector = flags.get('worktree')
    const current = selector === undefined || selector === 'active' || selector === 'current'
    const worktree = current
      ? await resolveCurrentWorktreeSelector(cwd, client, { agent: launch.agent })
      : await getRequiredWorktreeSelector(flags, 'worktree', cwd, client)
    const capabilities = await getAgentLaunchCapabilities(client)
    if (!capabilities) {
      if (launch.operationId) {
        throw new RuntimeClientError(
          'agent_session_operation_unknown',
          'This host cannot replay the earlier launch. Return to the original execution host; do not retry without --retry-launch.'
        )
      }
      throw new RuntimeClientError(
        'incompatible_runtime',
        'This Orca host cannot start agents from the CLI. Update Orca on the execution host.'
      )
    }
    const result = await callAgentLaunch(
      client,
      launch,
      {
        target: { kind: 'existing', worktree },
        presentation: cliLaunchPresentation({
          focus: flags.get('focus') === true,
          visibleRemote: client.isRemote
        })
      },
      capabilities,
      rawArgs
    )
    assertAgentLaunchPromptDelivered(result.result)
    printResult(result, json, formatAgentLaunch)
  }
}
