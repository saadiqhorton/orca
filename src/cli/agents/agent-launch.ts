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
import { ORCHESTRATION_SESSION_PLACEMENT_FLAG } from '../hosts/desktop-hub-command-route'
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
    const sessionPlacement = flags.has(ORCHESTRATION_SESSION_PLACEMENT_FLAG)
    if (client.isRemote && !flags.has('worktree') && !sessionPlacement) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Remote agent launch requires --worktree because the client cwd cannot identify a server worktree.'
      )
    }
    const selector = flags.get('worktree')
    const current = selector === undefined || selector === 'active' || selector === 'current'
    const target = sessionPlacement
      ? ({ kind: 'orchestration-session' } as const)
      : {
          kind: 'existing' as const,
          worktree: current
            ? await resolveCurrentWorktreeSelector(cwd, client, { agent: launch.agent })
            : await getRequiredWorktreeSelector(flags, 'worktree', cwd, client)
        }
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
        target,
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
