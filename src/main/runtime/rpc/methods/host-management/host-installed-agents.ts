import type { InventoryRuntime } from '../orchestration/surface/orchestration-surface-inventory'
import { listHostAgents } from '../orchestration/surface/orchestration-surface-inventory'

// Why: status.get answers every idle probe; detection spawns agent probes, so it runs off the answer path.
const CACHE_TTL_MS = 5 * 60_000

type CachedAgents = { agents: string[]; checkedAt: number }

const cache = new Map<string, CachedAgents>()
const refreshing = new Set<string>()

/** The last detected agents for this host; undefined until the first detection lands. */
export function cachedHostInstalledAgents(
  runtime: InventoryRuntime & { getRuntimeId: () => string }
): string[] | undefined {
  const key = runtime.getRuntimeId()
  const entry = cache.get(key)
  if (!entry || Date.now() - entry.checkedAt > CACHE_TTL_MS) {
    refresh(key, runtime)
  }
  return entry?.agents
}

function refresh(key: string, runtime: InventoryRuntime): void {
  if (refreshing.has(key)) {
    return
  }
  refreshing.add(key)
  void listHostAgents(runtime)
    .then((agents) => {
      cache.set(key, { agents, checkedAt: Date.now() })
    })
    .catch(() => undefined)
    .finally(() => {
      refreshing.delete(key)
    })
}
