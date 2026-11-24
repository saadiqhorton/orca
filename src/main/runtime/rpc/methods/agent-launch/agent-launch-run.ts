import type { AgentLaunchResult } from '../../../../../shared/agent-launch/contracts/agent-launch-intent'
import { executeAgentLaunch } from '../../../../agent-launch/agent-launch-executor'
import type { RpcContext } from '../../core'
import type { ReplaySafeLaunch } from './agent-launch-replay'
import {
  beginAgentLaunchFirstTurnWatch,
  finishAgentLaunchFirstTurnWatch
} from './agent-launch-first-turn-watch'
import { agentLaunchSurfaceFactory } from './agent-launch-surfaces'
import { agentLaunchCallerNavigationId, selectLaunchedTab } from './agent-launch-caller-selection'
import { agentLaunchWorkspaceFactory } from './agent-launch-worktree-creation'
import type { resolveUnlaunchedIntent } from './agent-launch-intent-resolution'
import { withPlacement, type AgentLaunchView } from './agent-launch-tab-publication'

export type HostLaunchContext = RpcContext & {
  agentLaunchPolicy?: { onSurfacePublished?: (surface: AgentLaunchResult) => void }
}

export async function runAgentLaunch(
  { intent, decidedMode }: Awaited<ReturnType<typeof resolveUnlaunchedIntent>>,
  context: HostLaunchContext,
  view: AgentLaunchView,
  replaySafe?: ReplaySafeLaunch
): Promise<AgentLaunchResult> {
  const callerNavigationId = agentLaunchCallerNavigationId(context)
  let firstTurnWatch: ReturnType<typeof beginAgentLaunchFirstTurnWatch> | null = null
  const result = await executeAgentLaunch({
    runtime: context.runtime,
    intent,
    decidedMode,
    surfaces: agentLaunchSurfaceFactory(
      context,
      replaySafe?.attachOperationId,
      replaySafe?.callerKey,
      // Worktree creation keeps host-wide chat activation, so a windowless host's other clients open the new worktree on the chat.
      callerNavigationId !== null && intent.target.kind !== 'create-worktree',
      replaySafe?.terminalSpawn,
      view
    ),
    workspaces: agentLaunchWorkspaceFactory(context, intent.agent),
    // The tab is shown as it is published, not after a prompt that can take a minute to land.
    onSurfacePublished: async (surface) => {
      try {
        context.agentLaunchPolicy?.onSurfacePublished?.(surface)
      } catch (error) {
        console.warn('[agent-launch] publication bookkeeping failed', error)
      }
      view.early?.surfacePublished(surface)
      replaySafe?.recordSurface(withPlacement(surface, view))
      await selectLaunchedTab(context, surface, view.presentation, callerNavigationId)
      firstTurnWatch ??= beginAgentLaunchFirstTurnWatch(
        context.runtime,
        withPlacement(surface, view)
      )
    }
  })
  return finishAgentLaunchFirstTurnWatch(
    context.runtime,
    withPlacement(result, view),
    firstTurnWatch,
    Date.now,
    replaySafe?.failFirstTurn
  )
}
