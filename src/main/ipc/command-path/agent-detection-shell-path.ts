import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import {
  hydrateShellPath,
  mergePathSegments
} from '../../startup/shell-environment/hydrate-shell-path'
import {
  getPreflightWslTarget,
  type PreflightRuntimeContext
} from '../preflight/preflight-runtime-target'

export async function hydrateShellPathForAgentDetection(
  context?: PreflightRuntimeContext,
  force = false
): Promise<void> {
  if (getPreflightWslTarget(context)) {
    return
  }
  // Daemon/SSH PATH may omit agents available in the user's shell.
  const hydration = await (force ? hydrateShellPath({ force: true }) : hydrateShellPath())
  if (hydration.ok) {
    mergePathSegments(hydration.segments)
  }
  appendUserLocalBinToPath()
}

/** orcad's non-login PATH often omits pip/npm user bins; append so detection still finds them. */
export function appendUserLocalBinToPath(): void {
  if (process.platform === 'win32') {
    return
  }
  const dir = join(homedir(), '.local/bin')
  const current = process.env.PATH ?? ''
  const parts = current.split(delimiter).filter(Boolean)
  if (parts.includes(dir)) {
    return
  }
  process.env.PATH = current ? `${current}${delimiter}${dir}` : dir
}
