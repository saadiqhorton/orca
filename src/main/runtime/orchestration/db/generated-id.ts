import { randomBytes } from 'node:crypto'

const LEGACY_ID_BYTES = 6
const WIDE_ID_BYTES = 16
const WIDE_ID_PREFIXES: ReadonlySet<string> = new Set(['ctx'])

function mintedByteLength(prefix: string): number {
  return WIDE_ID_PREFIXES.has(prefix) ? WIDE_ID_BYTES : LEGACY_ID_BYTES
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(mintedByteLength(prefix)).toString('hex')}`
}

/** Whether `value` has a shape `generateId(prefix)` produced, including ids minted before widening. */
export function isGeneratedId(value: string, prefix: string): boolean {
  const marker = `${prefix}_`
  if (!value.startsWith(marker)) {
    return false
  }
  const hex = value.slice(marker.length)
  const acceptedLengths = WIDE_ID_PREFIXES.has(prefix)
    ? [LEGACY_ID_BYTES * 2, WIDE_ID_BYTES * 2]
    : [LEGACY_ID_BYTES * 2]
  return acceptedLengths.includes(hex.length) && /^[0-9a-f]+$/i.test(hex)
}
