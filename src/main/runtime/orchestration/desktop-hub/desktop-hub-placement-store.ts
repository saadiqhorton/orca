import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getAppEnvironment, hasAppEnvironment } from '../../../../shared/app-lifecycle/app-environment'
import {
  DesktopHubPlacementSchema,
  type DesktopHubPlacement
} from '../../../../shared/orchestration/desktop-hub-contract'

let enabled = false

/** Fingerprints only. The desktop keeps the device token; this file lets show/stop survive a daemon restart. */
export function enableDesktopHubPlacementStore(): void {
  enabled = true
}

export function readDesktopHubPlacement(selector: string): DesktopHubPlacement | null {
  const stored = readAll().get(selector)
  return stored ?? null
}

export function writeDesktopHubPlacement(placement: DesktopHubPlacement): void {
  const path = storePath()
  if (!path) {
    return
  }
  const parsed = DesktopHubPlacementSchema.safeParse(placement)
  if (!parsed.success || parsed.data.selector !== selectorOf(placement)) {
    return
  }
  const all = readAll()
  all.set(parsed.data.selector, parsed.data)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify([...all.values()]), { encoding: 'utf8', mode: 0o600 })
}

function selectorOf(placement: DesktopHubPlacement): string {
  return placement.selector
}

function readAll(): Map<string, DesktopHubPlacement> {
  const path = storePath()
  const placements = new Map<string, DesktopHubPlacement>()
  if (!path) {
    return placements
  }
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return placements
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return placements
  }
  if (!Array.isArray(parsed)) {
    return placements
  }
  for (const entry of parsed) {
    const row = DesktopHubPlacementSchema.safeParse(entry)
    if (row.success) {
      placements.set(row.data.selector, row.data)
    }
  }
  return placements
}

function storePath(): string | null {
  if (!enabled || !hasAppEnvironment()) {
    return null
  }
  return join(getAppEnvironment().getPath('userData'), 'desktop-hub-placements.json')
}
