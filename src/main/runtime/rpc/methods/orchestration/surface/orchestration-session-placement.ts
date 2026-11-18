import { homedir } from 'node:os'
import {
  ensureOrchestrationScratchWorkspace,
  type OrchestrationScratchRuntime
} from './ensure-orchestration-scratch'

export type OrchestrationSessionPlacementRuntime = OrchestrationScratchRuntime

export type OrchestrationSessionPlacement = {
  worktree: string
  source: 'scratch'
}

/**
 * Default --host sessions to the visible Orca orchestration scratch folder.
 * A real repo is used only when the command names --worktree / a workspace.
 */
export async function resolveOrchestrationSessionPlacement(
  runtime: OrchestrationSessionPlacementRuntime,
  home = homedir()
): Promise<OrchestrationSessionPlacement> {
  const scratch = await ensureOrchestrationScratchWorkspace(runtime, {}, home)
  return { worktree: scratch.worktree, source: 'scratch' }
}
