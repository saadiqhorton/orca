/** `--json` keeps stdout parseable; text mode prints the same warning on stderr. */
export function emitCliWarning(message: string, json: boolean): string | undefined {
  if (json) {
    return message
  }
  process.stderr.write(`warning: ${message}\n`)
  return undefined
}

export function mergeCliWarning(
  existing: string | undefined,
  extra: string | undefined
): string | undefined {
  if (!extra) {
    return existing
  }
  if (!existing) {
    return extra
  }
  return `${existing} ${extra}`
}
