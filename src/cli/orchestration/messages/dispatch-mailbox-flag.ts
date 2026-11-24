import { RuntimeClientError } from '../../runtime/connection/types'
import { dispatchMailboxAddress } from '../../../shared/orchestration/orchestration-dispatch-id'

/** check/inbox --dispatch names a worker mailbox; --terminal still names a live tab. */
export function applyDispatchMailboxFlag(flags: Map<string, string | boolean>): void {
  if (!flags.has('dispatch')) {
    return
  }
  const dispatch = flags.get('dispatch')
  if (typeof dispatch !== 'string' || dispatch.length === 0) {
    throw new RuntimeClientError('invalid_argument', 'Missing value for --dispatch')
  }
  if (flags.has('terminal')) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use either --dispatch or --terminal, not both.'
    )
  }
  flags.delete('dispatch')
  flags.set('terminal', dispatchMailboxAddress(dispatch))
}
