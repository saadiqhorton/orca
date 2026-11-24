import { DEFAULT_TERMINAL_READ_LIMIT } from './tail/terminal-tail-limits'
import { terminalReadLimit } from './tail/terminal-tail-read'

export function newestTerminalReadCursor(args: {
  latestCursor: string | number | null | undefined
  limit?: number
}): { cursor: number; limit: number } | undefined {
  const latest =
    typeof args.latestCursor === 'number'
      ? args.latestCursor
      : typeof args.latestCursor === 'string' && /^\d+$/.test(args.latestCursor)
        ? Number.parseInt(args.latestCursor, 10)
        : Number.NaN
  if (!Number.isFinite(latest) || latest <= 0) {
    return undefined
  }
  const limit = terminalReadLimit(args.limit, DEFAULT_TERMINAL_READ_LIMIT)
  return { cursor: Math.max(0, latest - limit), limit }
}
