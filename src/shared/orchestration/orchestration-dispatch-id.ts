/** Bare Dispatch ids from worker-start receipts; `dispatch:` is the mailbox spelling. */
export function normalizeDispatchId(id: string): string {
  return id.replace(/^dispatch:/i, '')
}

/** Addresses that live on the caller's Run, not on a `--host` machine's local store. */
export function isHomeRunMailboxSelector(value: string): boolean {
  return /^(run|dispatch|task):/i.test(value) || /^(ctx_|run_|task_)/i.test(value)
}
