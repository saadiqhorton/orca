import { runProcessSync } from '@orca/process-host'
import type { DesktopHubPlacement } from '../../src/shared/orchestration/desktop-hub-contract'
import type { RuntimeRpcResponse } from '../../src/shared/remote-runtime/rpc/runtime-rpc-envelope'
import type { RemoteRuntimeRequestConnection } from '../../src/shared/remote-runtime/requests/remote-runtime-request-connection'
import { rpcOk } from './desktop-hub-e2e-support'

type Forwarded = string[]

export function crossHostE2eCallLocal(
  forwardedMethods: Forwarded,
  method: string
): RuntimeRpcResponse<unknown> {
  forwardedMethods.push(`local:${method}`)
  if (method === 'orchestration.surface.inventory') {
    return rpcOk({
      machineName: 'windows-desktop',
      agents: ['claude'],
      projects: [],
      folderWorkspaces: [],
      repos: [],
      sessions: []
    })
  }
  return rpcOk({ method })
}

export async function crossHostE2eCallHost(args: {
  forwardedMethods: Forwarded
  placement: DesktopHubPlacement
  method: string
  requesterB: RemoteRuntimeRequestConnection
  worktree: string
  attachOutput: { value: string }
}): Promise<RuntimeRpcResponse<unknown>> {
  args.forwardedMethods.push(args.method)
  if (args.placement.hostKey !== 'env-ubuntu') {
    throw new Error(`refusing to dial ${args.placement.hostKey}`)
  }
  const probe = await args.requesterB.request<{ unsubscribed: boolean }>(
    'runtime.clientEvents.unsubscribe',
    { subscriptionId: 'not-this-session' },
    5_000
  )
  if (!probe.ok || probe.result.unsubscribed !== false) {
    throw new Error('host B did not accept the desktop socket')
  }
  if (args.method === 'orchestration.federationAttachStart') {
    args.attachOutput.value = runHostBHostname(args.worktree)
    return rpcOk({
      state: 'ready',
      dispatchId: 'disp_e2e',
      output: args.attachOutput.value
    })
  }
  if (args.method === 'orchestration.federationShow') {
    return rpcOk({ state: 'ready', output: args.attachOutput.value })
  }
  if (args.method === 'orchestration.federationStop') {
    return rpcOk({ state: 'stopped', dispatchId: 'disp_e2e' })
  }
  if (args.method === 'agent.launch') {
    return rpcOk({
      outcome: { kind: 'terminal', handle: 'term_visible_e2e' },
      worktree: `path:${args.worktree}`
    })
  }
  if (args.method === 'terminal.create') {
    return rpcOk({
      terminal: { handle: 'term_shell_e2e', worktree: `path:${args.worktree}` }
    })
  }
  if (args.method === 'orchestration.surface.ensureScratch') {
    return rpcOk({
      path: args.worktree,
      worktree: 'folder:fld_e2e',
      folderWorkspaceId: 'fld_e2e',
      created: false
    })
  }
  if (args.method === 'orchestration.surface.inventory') {
    return rpcOk({
      machineName: 'dezignerdrugz00',
      agents: ['claude', 'codex'],
      projects: [{ id: 'grp_e2e', name: 'Orca orchestration', parentPath: args.worktree }],
      folderWorkspaces: [
        {
          id: 'fld_e2e',
          name: 'scratch',
          path: args.worktree,
          projectGroupId: 'grp_e2e',
          selector: 'folder:fld_e2e'
        }
      ],
      repos: [
        {
          id: 'repo_work',
          name: 'work',
          path: `${args.worktree}-git`,
          selector: `path:${args.worktree}-git`
        }
      ],
      sessions: [{ handle: 'term_visible_e2e', agent: 'claude' }]
    })
  }
  return rpcOk({ method: args.method })
}

export function runHostBHostname(worktree: string): string {
  const hostname = runProcessSync({
    program: 'sh',
    args: ['-c', 'echo "B_CWD=$(pwd)"; hostname; cat MARKER'],
    cwd: worktree,
    timeoutMs: 5_000
  })
  if (hostname.code !== 0) {
    throw new Error(hostname.stderr || 'hostname failed in the host B worktree')
  }
  return hostname.stdout.trim()
}
