import type { OrcaRuntimeService } from '../../../../../orca-runtime'
import type { OrchestrationEntryCaller } from '../../../../../orchestration/addressing/orchestration-caller-identity'
import { resolveDispatchCallerWorktreeId } from '../../orchestration-caller-workspace'
import { probeWorkerOpenCodeModelLaunchSupport } from './launch/worker-opencode-model-preflight'
import { resolveWorkerConfiguredAgentParams } from './launch/worker-configured-agent-preflight'
import { prepareLocalWorkerStart } from './launch/worker-start-validation'
import { assertAgentCliInstalled } from './launch/worker-agent-cli-installed'
import { assertWorkerCodexModelSupported } from './launch/worker-codex-model-gate'
import { resolveWorkerWorktreeCreationTarget } from './placement/worker-worktree-creation'
import type { WorkerStartInput } from './worker-start-input'

export async function resolveLocalWorkerLaunchPlan(args: {
  runtime: OrcaRuntimeService
  params: WorkerStartInput
  callerSession?: OrchestrationEntryCaller
}): Promise<{
  requestedWorktree: string
  createsWorktree: boolean
  creationTargetFor: (
    callerWorktreeId: string
  ) => ReturnType<typeof resolveWorkerWorktreeCreationTarget>
  agent: ReturnType<typeof prepareLocalWorkerStart>['agent']
  launch: ReturnType<typeof prepareLocalWorkerStart>['launch']
}> {
  const { runtime, params, callerSession } = args
  const requestedWorktree = params.worktree ?? 'current'
  const createsWorktree = requestedWorktree === 'new-child' || requestedWorktree === 'new-top-level'
  const creationTargetFor = (callerWorktreeId: string) =>
    resolveWorkerWorktreeCreationTarget({
      runtime,
      requestedWorktree,
      repo: params.repo,
      callerWorktreeId
    })
  const launchParams = await resolveWorkerConfiguredAgentParams(runtime, params, async () => {
    const callerWorkspaceId = await resolveDispatchCallerWorktreeId(
      runtime,
      params.from,
      callerSession
    )
    return createsWorktree
      ? { repo: (await creationTargetFor(callerWorkspaceId)).repoSelector }
      : {
          worktree: requestedWorktree === 'current' ? `id:${callerWorkspaceId}` : requestedWorktree
        }
  })
  let openCodeModelLaunchSupported = false
  if (!createsWorktree && launchParams.agent === 'opencode' && launchParams.model) {
    const callerWorkspaceId = await resolveDispatchCallerWorktreeId(
      runtime,
      params.from,
      callerSession
    )
    openCodeModelLaunchSupported = await probeWorkerOpenCodeModelLaunchSupport(
      runtime,
      launchParams,
      { worktree: requestedWorktree === 'current' ? `id:${callerWorkspaceId}` : requestedWorktree }
    )
  }
  const { agent, launch } = prepareLocalWorkerStart({
    params: launchParams,
    createsWorktree,
    runtime,
    openCodeModelLaunchSupported
  })
  if (agent) {
    await assertWorkerCodexModelSupported(agent, launchParams.model)
    const worktreeId = requestedWorktree === 'current' || createsWorktree ? null : requestedWorktree
    await assertAgentCliInstalled(runtime, agent, worktreeId)
  }
  return { requestedWorktree, createsWorktree, creationTargetFor, agent, launch }
}
