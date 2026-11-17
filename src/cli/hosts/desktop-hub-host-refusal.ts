import type { RuntimeClient } from '../runtime/client'
import { RuntimeClientError } from '../runtime/types'
import { desktopHubRowMatches } from '../../shared/orchestration/desktop-hub-contract'

type HubRow = { kind?: unknown; name?: unknown; machineName?: string; label?: string; id?: string }

/**
 * `orca host list` also prints machines the desktop app is connected to. Only
 * worker-start and send route through it, so other `--host` commands must say so
 * instead of reporting an unknown host.
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
    `${flagSpelling} names ${row.name}, a machine the desktop app is connected to. This command cannot run there; only \`orca orchestration worker-start --host ${row.name}\` and \`orca orchestration send --host ${row.name}\` can. Nothing was created.`,
    {
      nextSteps: [
        `orca orchestration worker-start --host ${row.name} --worktree path:<existing Orca project folder on ${row.name}> --agent <agent> --spec "<task>"`
      ]
    }
  )
}
