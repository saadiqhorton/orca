import type { RuntimeAccountController } from '../../agent-session/environment/runtime-account-controller'
import type { TerminalWorkspaceLaunchScope } from '../../orchestration/terminal-authority/structured-sessions/runtime-legacy-worker-terminal-recovery-types'
import { applyRemoteViewerLaunchEnv } from './remote-viewer-launch-env'
import type { TerminalCreateOptions } from './terminal-create-options'
import { withHostAccountLaunchEnv } from './runtime-agent-terminal-startup'

export async function prepareHostAgentTerminalLaunch(
  workspace: TerminalWorkspaceLaunchScope,
  opts: TerminalCreateOptions,
  resolvedLaunch: TerminalCreateOptions,
  accounts: Pick<RuntimeAccountController, 'prepareHostAgentLaunch' | 'hostLaunchEnvFor'>
): Promise<TerminalCreateOptions> {
  const launch = applyRemoteViewerLaunchEnv(resolvedLaunch, opts.terminalImageViewerSupported)
  // An SSH workspace's shell runs on that machine, where this distro's account paths mean nothing.
  if (workspace.connectionId) {
    return launch
  }
  if (launch.launchAgent) {
    await accounts.prepareHostAgentLaunch(launch.launchAgent)
  }
  const hostLaunchEnv = accounts.hostLaunchEnvFor(launch.launchAgent)
  return withHostAccountLaunchEnv(opts, launch, hostLaunchEnv)
}
