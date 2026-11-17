import type { RuntimeClient } from '../runtime/client'
import { printResult } from '../output/command-result-output'
import {
  bindDesktopHubHost,
  isFolderWorktreeCreateWithoutRepo,
  needsDefaultRemoteWorktree,
  ORCHESTRATION_SESSION_PLACEMENT_FLAG,
  shouldWrapDesktopHubHost
} from './desktop-hub-command-route'
import { ORCHESTRATION_SESSION_PLACEMENT_RUNTIME_CAPABILITY } from '../../shared/orchestration/orchestration-runtime-capabilities'
import { formatScratchWorkspace } from './host-format'
import { resolveRemoteSelectorsAcrossHosts } from './desktop-hub-selector-resolve'
import { warnIfLaunchPromptLooksSecret } from '../agents/agent-launch-secret-prompt'

type ScratchWorkspace = {
  path: string
  worktree: string
  created: boolean
  groupName?: string
  workspaceName?: string
  host?: string
  next?: string
}

export type DesktopHubCliBind = {
  client: RuntimeClient
  commandPath: string[]
  printed: boolean
}

function boundHubName(
  requestedHost: string | boolean | undefined,
  flags: ReadonlyMap<string, string | boolean>
): string | undefined {
  return !flags.has('host') && typeof requestedHost === 'string' ? requestedHost : undefined
}

async function applyBoundHubDefaults(
  commandPath: string[],
  flags: Map<string, string | boolean>,
  client: RuntimeClient,
  host: string,
  json: boolean
): Promise<{ commandPath: string[]; printed: boolean }> {
  if (needsDefaultRemoteWorktree(commandPath, flags)) {
    if (await hostPlacesOrchestrationSessions(client)) {
      flags.set(ORCHESTRATION_SESSION_PLACEMENT_FLAG, true)
    } else {
      await applyScratchWorktreeDefault(flags, client)
    }
  }
  if (!isFolderWorktreeCreateWithoutRepo(commandPath, flags)) {
    return { commandPath, printed: false }
  }
  return applyScratchFolderCreateDefaults(commandPath, flags, client, host, json)
}

async function hostPlacesOrchestrationSessions(client: RuntimeClient): Promise<boolean> {
  const status = await client.getCliStatus()
  return (
    status.result.runtime.capabilities?.includes(
      ORCHESTRATION_SESSION_PLACEMENT_RUNTIME_CAPABILITY
    ) === true
  )
}

/** Older hosts without session placement keep the scratch default the CLI always chose. */
async function applyScratchWorktreeDefault(
  flags: Map<string, string | boolean>,
  client: RuntimeClient
): Promise<void> {
  const scratch = await client.call<{ worktree: string }>('orchestration.surface.ensureScratch', {})
  flags.set('worktree', scratch.result.worktree)
}

async function applyScratchFolderCreateDefaults(
  commandPath: string[],
  flags: Map<string, string | boolean>,
  client: RuntimeClient,
  host: string,
  json: boolean
): Promise<{ commandPath: string[]; printed: boolean }> {
  const name = flags.get('name')
  const scratch = await client.call<ScratchWorkspace>(
    'orchestration.surface.ensureScratch',
    typeof name === 'string' ? { name } : {}
  )
  const agent = flags.get('agent')
  if (typeof agent === 'string' && agent.trim()) {
    flags.set('worktree', scratch.result.worktree)
    flags.delete('name')
    flags.delete('no-parent')
    flags.delete('activate')
    flags.delete('run-hooks')
    return { commandPath: ['agent', 'launch'], printed: false }
  }
  const next =
    `To start an agent in this folder: orca agent launch --host ${host} --worktree ${scratch.result.worktree} --agent <agent> --prompt "<task>". ` +
    'Either launch with that command, or pass --agent on worktree create --host.'
  printResult(
    { ...scratch, result: { ...scratch.result, host, next } },
    json,
    formatScratchWorkspace
  )
  return { commandPath, printed: true }
}

/** Bind --host, honour worktree create --agent, and auto-resolve unique remote selectors. */
export async function prepareDesktopHubCliClient(
  commandPath: string[],
  flags: Map<string, string | boolean>,
  client: RuntimeClient,
  json: boolean
): Promise<DesktopHubCliBind> {
  warnIfLaunchPromptLooksSecret(flags)
  let nextClient = client
  let nextPath = commandPath
  const requestedHost = flags.get('host')
  if (shouldWrapDesktopHubHost(commandPath, flags)) {
    nextClient = await bindDesktopHubHost(client, flags)
    const host = boundHubName(requestedHost, flags)
    if (host) {
      const applied = await applyBoundHubDefaults(nextPath, flags, nextClient, host, json)
      nextPath = applied.commandPath
      if (applied.printed) {
        return { client: nextClient, commandPath: nextPath, printed: true }
      }
    }
  }
  nextClient = await resolveRemoteSelectorsAcrossHosts(nextClient, nextPath, flags)
  return { client: nextClient, commandPath: nextPath, printed: false }
}
