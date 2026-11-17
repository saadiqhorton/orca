/** Bare Dispatch ids from worker-start receipts; `dispatch:` is the mailbox spelling. */
export function normalizeDispatchId(id: string): string {
  return id.replace(/^dispatch:/i, '')
}

/** Mailbox address for check/inbox: a bare ctx_ id or dispatch:ctx_ id. */
export function dispatchMailboxAddress(id: string): string {
  return `dispatch:${normalizeDispatchId(id)}`
}

/** Addresses that live on the caller's Run, not on a `--host` machine's local store. */
export function isHomeRunMailboxSelector(value: string): boolean {
  return /^(run|dispatch|task):/i.test(value) || /^(ctx_|run_|task_)/i.test(value)
}
