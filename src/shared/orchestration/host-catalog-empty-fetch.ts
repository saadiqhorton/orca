/** An empty host list is not proof the host has no rows; desktop sync used to wipe host-created scratch. */
export function preserveCatalogOnEmptyFetch<T>(
  previous: readonly T[],
  fetched: readonly T[]
): readonly T[] | null {
  return fetched.length === 0 ? previous : null
}
