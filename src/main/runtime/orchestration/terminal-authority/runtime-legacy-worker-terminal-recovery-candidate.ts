import type { PtyControllerInventory } from '../../terminal/lifecycle/runtime-pty-controller-contract'
import type { RuntimeLegacyWorkerTerminalRecoveryController } from './runtime-legacy-worker-terminal-recovery-controller'
import {
  LEGACY_WORKER_RECOVERY_ATTEMPT_CAP,
  type LegacyWorkerRecoveryCandidate,
  type LegacyWorkerRecoveryOptions,
  type LegacyWorkerRecoveryPorts,
  type LegacyWorkerRecoveryResolution,
  type LegacyWorkerRecoveryWorkspace
} from './structured-sessions/runtime-legacy-worker-terminal-recovery-types'

export async function isAbsentLegacyWorkerTerminalProvenExited(
  ports: LegacyWorkerRecoveryPorts,
  candidate: LegacyWorkerRecoveryCandidate,
  connectionId: string | null
): Promise<boolean> {
  // A restarted relay's session map cannot speak for the previous relay's processes.
  if (connectionId === null) {
    return true
  }
  try {
    return (await ports.isTerminalProvenAbsent?.(candidate)) === true
  } catch {
    return false
  }
}

function deferUnprovenBinding(args: {
  controller: RuntimeLegacyWorkerTerminalRecoveryController
  candidate: LegacyWorkerRecoveryCandidate
  deferredDispatchIds: Set<string>
  pendingResolutions: LegacyWorkerRecoveryResolution[]
}): void {
  const { controller, candidate, deferredDispatchIds, pendingResolutions } = args
  if (
    controller.recordUnprovenBindingPass(candidate.dispatchId) < LEGACY_WORKER_RECOVERY_ATTEMPT_CAP
  ) {
    deferredDispatchIds.add(candidate.dispatchId)
    return
  }
  controller.clearUnprovenBindingPasses(candidate.dispatchId)
  pendingResolutions.push({ candidate, resolution: 'abandoned' })
}

export async function reconcileLegacyWorkerCandidate(args: {
  controller: RuntimeLegacyWorkerTerminalRecoveryController
  ports: LegacyWorkerRecoveryPorts
  options: LegacyWorkerRecoveryOptions
  candidate: LegacyWorkerRecoveryCandidate
  workspace: LegacyWorkerRecoveryWorkspace
  resolvedWorktrees: LegacyWorkerRecoveryWorkspace['resolved'][]
  inventory: PtyControllerInventory
  deferredDispatchIds: Set<string>
  pendingResolutions: LegacyWorkerRecoveryResolution[]
}): Promise<void> {
  const { controller, ports, options, workspace, resolvedWorktrees } = args
  let { candidate } = args
  if (!args.inventory.livePtyIds.has(candidate.ptyId)) {
    if (
      await isAbsentLegacyWorkerTerminalProvenExited(ports, candidate, workspace.scope.connectionId)
    ) {
      args.pendingResolutions.push({ candidate, resolution: 'exited' })
    } else {
      args.deferredDispatchIds.add(candidate.dispatchId)
    }
    return
  }
  const controllerIdentity = args.inventory.terminalIdentityByPtyId.get(candidate.ptyId)
  if (!controllerIdentity) {
    args.deferredDispatchIds.add(candidate.dispatchId)
    return
  }
  if (controllerIdentity.incarnationId !== candidate.incarnationId) {
    // A live PTY under another binding is not an exit; only proven exit marks the worker lost.
    deferUnprovenBinding(args)
    return
  }
  let rebound = false
  if (controllerIdentity.handle !== candidate.terminalHandle) {
    // Same PTY incarnation: only the handle moved, so adoption and persistence follow the PTY.
    candidate = { ...candidate, terminalHandle: controllerIdentity.handle }
    rebound = true
  }
  controller.clearUnprovenBindingPasses(candidate.dispatchId)
  let adoptionStatus: 'ready' | 'unverifiable' | 'exited'
  try {
    adoptionStatus = await ports.runMutation(candidate.worktreeId, async () => {
      const preAdoptionInventory = await ports.refreshInventory(
        resolvedWorktrees,
        workspace.scope.connectionId
      )
      if (!preAdoptionInventory) {
        return 'unverifiable'
      }
      if (!preAdoptionInventory.livePtyIds.has(candidate.ptyId)) {
        return (await isAbsentLegacyWorkerTerminalProvenExited(
          ports,
          candidate,
          workspace.scope.connectionId
        ))
          ? 'exited'
          : 'unverifiable'
      }
      const preAdoptionIdentity = preAdoptionInventory.terminalIdentityByPtyId.get(candidate.ptyId)
      if (!preAdoptionIdentity) {
        return 'unverifiable'
      }
      if (
        preAdoptionIdentity.handle !== candidate.terminalHandle ||
        preAdoptionIdentity.incarnationId !== candidate.incarnationId
      ) {
        return 'unverifiable'
      }
      const exactSurfaceAlreadyPublished =
        ports.hasExactPersistedSurface(candidate) && ports.hasExactSurface(candidate)
      if (!exactSurfaceAlreadyPublished) {
        await ports.adopt(
          candidate,
          workspace.scope,
          preAdoptionInventory,
          ports.getActivation(candidate.worktreeId)
        )
      }
      return 'ready'
    })
  } catch (error) {
    console.warn('[orchestration] legacy worker terminal adoption deferred', {
      dispatchId: candidate.dispatchId,
      error
    })
    args.deferredDispatchIds.add(candidate.dispatchId)
    return
  }
  if (adoptionStatus === 'unverifiable') {
    args.deferredDispatchIds.add(candidate.dispatchId)
    return
  }
  if (adoptionStatus === 'exited') {
    args.pendingResolutions.push({ candidate, resolution: 'exited' })
    return
  }
  const rendererEpoch = ports.getRendererEpoch()
  let rendererMaterialized =
    options.materializeRenderer !== true || controller.hasReceipt(candidate.paneKey, rendererEpoch)
  if (options.materializeRenderer && !rendererMaterialized) {
    for (let attempt = 0; attempt < 2 && !rendererMaterialized; attempt += 1) {
      try {
        const reveal = await ports.reveal(candidate)
        if (reveal === null) {
          break
        }
        rendererMaterialized = reveal
        if (!rendererMaterialized) {
          throw new Error('terminal_reveal_identity_mismatch')
        }
        controller.setReceipt(candidate.paneKey, ports.getRendererEpoch())
      } catch (error) {
        if (attempt === 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 100))
          continue
        }
        console.warn('[orchestration] adopted legacy worker was not revealed', {
          dispatchId: candidate.dispatchId,
          error
        })
      }
    }
  }
  if (!rendererMaterialized) {
    controller.deleteReceipt(candidate.paneKey)
    args.deferredDispatchIds.add(candidate.dispatchId)
    return
  }
  if (options.materializeRenderer === true && !ports.hasExactSurface(candidate)) {
    args.deferredDispatchIds.add(candidate.dispatchId)
    return
  }
  const finalInventory = await ports.refreshInventory(
    resolvedWorktrees,
    workspace.scope.connectionId
  )
  if (!finalInventory) {
    args.deferredDispatchIds.add(candidate.dispatchId)
    return
  }
  if (!finalInventory.livePtyIds.has(candidate.ptyId)) {
    controller.deleteReceipt(candidate.paneKey)
    if (
      await isAbsentLegacyWorkerTerminalProvenExited(ports, candidate, workspace.scope.connectionId)
    ) {
      ports.onPtyExit(candidate)
      args.pendingResolutions.push({ candidate, resolution: 'exited' })
    } else {
      args.deferredDispatchIds.add(candidate.dispatchId)
    }
    return
  }
  const finalIdentity = finalInventory.terminalIdentityByPtyId.get(candidate.ptyId)
  if (!finalIdentity) {
    controller.deleteReceipt(candidate.paneKey)
    args.deferredDispatchIds.add(candidate.dispatchId)
    return
  }
  if (
    finalIdentity.handle !== candidate.terminalHandle ||
    finalIdentity.incarnationId !== candidate.incarnationId
  ) {
    controller.deleteReceipt(candidate.paneKey)
    args.deferredDispatchIds.add(candidate.dispatchId)
    return
  }
  args.pendingResolutions.push({
    candidate,
    resolution: 'adopted',
    ...(rebound ? { rebound: true } : {})
  })
}
