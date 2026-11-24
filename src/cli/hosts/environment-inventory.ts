import type { CommandHandler } from '../dispatch/dispatch'
import { rejectRemoteSelectionFlags } from '../dispatch/remote-selection-flag-rejection'
import { printResult } from '../output/command-result-output'
import { RuntimeClientError } from '../runtime/types'
import {
  formatHostInventory,
  withHostOrchestrationTiers,
  type HostInventoryRow
} from './host-format'
import { listedHostInventoryForGroup } from './inventory-group-filter'

export const handleHostInventory: CommandHandler = async ({ client, flags, json }) => {
  rejectRemoteSelectionFlags(
    flags,
    '`orca host inventory`. It answers from this machine\u2019s desktop hub, so a routed answer would describe a different fleet.',
    {
      nextSteps: [
        'Run `orca host inventory` on that machine to see the hosts connected to its desktop app.',
        'Drop the flag to answer for this machine.'
      ]
    }
  )
  try {
    const listed = await client.call<{
      hub: 'desktop' | 'remote' | 'unavailable'
      hosts: HostInventoryRow[]
      message?: string
    }>('orchestration.desktopHub.inventory', {})
    const group = flags.get('group')
    printResult(
      withHostOrchestrationTiers(
        listedHostInventoryForGroup(listed, typeof group === 'string' ? group : undefined)
      ),
      json,
      formatHostInventory
    )
  } catch (error) {
    if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
      throw new RuntimeClientError(
        'incompatible_runtime',
        'This Orca host cannot inventory desktop-connected machines. Update Orca on the desktop and on this host, then retry `orca host inventory`.'
      )
    }
    throw error
  }
}
