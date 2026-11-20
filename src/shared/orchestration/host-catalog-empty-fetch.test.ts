import { describe, expect, it } from 'vitest'
import { preserveCatalogOnEmptyFetch } from './host-catalog-empty-fetch'

describe('preserveCatalogOnEmptyFetch', () => {
  it('keeps host-created rows when a later fetch is empty', () => {
    const previous = [{ id: 'fld_scratch' }]
    expect(preserveCatalogOnEmptyFetch(previous, [])).toEqual(previous)
    expect(preserveCatalogOnEmptyFetch(previous, [{ id: 'fld_other' }])).toBeNull()
  })
})
