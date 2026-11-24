import type { RuntimeClient } from '../runtime/client'
import { RuntimeClientError } from '../runtime/connection/types'
import { desktopHubRowMatches } from '../../shared/orchestration/desktop-hub-contract'

type HubRow = { kind?: unknown; name?: unknown; machineName?: string; label?: string; id?: string }

/**
 * `orca host list` also prints machines the desktop app is connected to. Most
 * commands retarget there automatically; this refusal is the fallback when a
 * command still has `--host` after that wrap (or on an older runtime).
 */
export async function refuseDesktopHubHostAlias(
  client: Pick<RuntimeClient, 'call'>,
  alias: string,
  flagSpelling: string
): Promise<void> {
  let hosts: unknown
  try {
    hosts = (await client.call<{ hosts?: unknown }>('orchestration.desktopHub.list', {})).result
      .hosts
  } catch {
    return
  }
  if (!Array.isArray(hosts)) {
    return
  }
  const row = (hosts as HubRow[]).find(
    (candidate): candidate is HubRow & { name: string } =>
      typeof candidate === 'object' &&
      candidate !== null &&
      candidate.kind === 'execution' &&
      typeof candidate.name === 'string' &&
      desktopHubRowMatches(candidate as { name: string }, alias)
  )
  if (!row) {
    return
  }
  throw new RuntimeClientError(
    'invalid_argument',
    `${flagSpelling} names ${row.name}, a machine the desktop app is connected to. Open a visible tab there with \`orca agent launch --host ${row.name}\` or \`orca terminal create --host ${row.name}\`; inspect the fleet with \`orca host inventory\`. Nothing was created.`,
    {
      nextSteps: [
        `orca host inventory --json`,
        `orca agent launch --host ${row.name} --agent <agent> --prompt "<task>" --json`,
        `orca terminal create --host ${row.name} --json`,
        `orca orchestration worker-start --host ${row.name} --agent <agent> --spec "<task>"`
      ]
    }
  )
}
