import { quoteCliCommandArgument } from '../arguments/shell-command-quote'
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
  const listed: unknown[] = hosts
  const row = listed.find((candidate): candidate is HubRow & { name: string } => {
    if (typeof candidate !== 'object' || candidate === null) {
      return false
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: hub list rows are untyped JSON; kind and name are validated before use.
    const entry = candidate as HubRow
    if (entry.kind !== 'execution' || typeof entry.name !== 'string') {
      return false
    }
    return desktopHubRowMatches(
      {
        name: entry.name,
        machineName: typeof entry.machineName === 'string' ? entry.machineName : undefined,
        label: typeof entry.label === 'string' ? entry.label : undefined,
        id: typeof entry.id === 'string' ? entry.id : undefined
      },
      alias
    )
  })
  if (!row) {
    return
  }
  throw new RuntimeClientError(
    'invalid_argument',
    `${flagSpelling} names ${row.name}, a machine the desktop app is connected to. Open a visible tab there with \`orca agent launch --host ${quoteCliCommandArgument(row.name)}\` or \`orca terminal create --host ${quoteCliCommandArgument(row.name)}\`; inspect the fleet with \`orca host inventory\`. Nothing was created.`,
    {
      nextSteps: [
        `orca host inventory --json`,
        `orca agent launch --host ${quoteCliCommandArgument(row.name)} --agent <agent> --prompt "<task>" --json`,
        `orca terminal create --host ${quoteCliCommandArgument(row.name)} --json`,
        `orca orchestration worker-start --host ${quoteCliCommandArgument(row.name)} --agent <agent> --spec "<task>"`
      ]
    }
  )
}
