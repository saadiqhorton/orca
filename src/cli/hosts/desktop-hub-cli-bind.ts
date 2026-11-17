import type { RuntimeClient } from '../runtime/client'
import { printResult } from '../output/command-result-output'
import {
  bindDesktopHubHost,
  isFolderWorktreeCreateWithoutRepo,
  needsDefaultRemoteWorktree,
  shouldWrapDesktopHubHost
} from './desktop-hub-command-route'
import { formatScratchWorkspace } from './host-format'
import {
  resolveRemoteSelectorsAcrossHosts,
  routeTerminalHandlesToOwner
} from './desktop-hub-selector-resolve'
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
    const scratch = await client.call<{ worktree: string }>(
      'orchestration.surface.ensureScratch',
      {}
    )
    flags.set('worktree', scratch.result.worktree)
  }
  if (!isFolderWorktreeCreateWithoutRepo(commandPath, flags)) {
    return { commandPath, printed: false }
  }
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
  const handleRoute = await routeTerminalHandlesToOwner(client, commandPath, flags)
  if (handleRoute.client) {
    return { client: handleRoute.client, commandPath, printed: false }
  }
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
  nextClient = await resolveRemoteSelectorsAcrossHosts(nextClient, nextPath, flags, {
    skipHandles: handleRoute.handled
  })
  return { client: nextClient, commandPath: nextPath, printed: false }
}
