import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { focusRuntimeTerminalHandle } from '@/components/terminal-pane/links/handles/terminal-handle-links'
import type { RuntimeTerminalRevealPendingNotice } from '../../../../shared/terminal/runtime/runtime-terminal-create-contract'

/** Main created the tab but could not show it; the notice names the host so the person can find it. */
export function registerTerminalRevealPendingIpcBridge(unsubs: (() => void)[]): void {
  unsubs.push(
    window.api.ui.onTerminalRevealPending((notice) => {
      showTerminalRevealPendingToast(notice)
    })
  )
}

export function showTerminalRevealPendingToast(notice: RuntimeTerminalRevealPendingNotice): void {
  toast.message(
    translate(
      'auto.hooks.ipcEvents.terminalRevealPending.opened',
      'Opened a tab on {{value0}}. Orca could not show it.',
      { value0: notice.host }
    ),
    {
      action: {
        label: translate('auto.hooks.ipcEvents.terminalRevealPending.showTab', 'Show tab'),
        onClick: () => {
          void focusRuntimeTerminalHandle(notice.handle, null)
        }
      }
    }
  )
}
