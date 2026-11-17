import { describe, expect, it } from 'vitest'
import {
  dispatchMailboxAddress,
  isHomeRunMailboxSelector,
  normalizeDispatchId
} from './orchestration-dispatch-id'

describe('normalizeDispatchId', () => {
  it('strips a dispatch: mailbox prefix and leaves a bare ctx_ id', () => {
    expect(normalizeDispatchId('dispatch:ctx_793e1b7ab138')).toBe('ctx_793e1b7ab138')
    expect(normalizeDispatchId('DISPATCH:ctx_793e1b7ab138')).toBe('ctx_793e1b7ab138')
    expect(normalizeDispatchId('ctx_793e1b7ab138')).toBe('ctx_793e1b7ab138')
  })
})

describe('dispatchMailboxAddress', () => {
  it('names the Dispatch mailbox for a bare or prefixed id', () => {
    expect(dispatchMailboxAddress('ctx_793e1b7ab138')).toBe('dispatch:ctx_793e1b7ab138')
    expect(dispatchMailboxAddress('dispatch:ctx_793e1b7ab138')).toBe('dispatch:ctx_793e1b7ab138')
  })
})

describe('isHomeRunMailboxSelector', () => {
  it('recognizes Dispatch, Run, and task ids in both spellings', () => {
    expect(isHomeRunMailboxSelector('ctx_793e1b7ab138')).toBe(true)
    expect(isHomeRunMailboxSelector('dispatch:ctx_793e1b7ab138')).toBe(true)
    expect(isHomeRunMailboxSelector('run_abc')).toBe(true)
    expect(isHomeRunMailboxSelector('run:run_abc')).toBe(true)
    expect(isHomeRunMailboxSelector('task_abc')).toBe(true)
    expect(isHomeRunMailboxSelector('task:task_abc')).toBe(true)
  })

  it('leaves live tab handles for the named host', () => {
    expect(isHomeRunMailboxSelector('term_visible')).toBe(false)
    expect(isHomeRunMailboxSelector('dhub:env-ubuntu')).toBe(false)
  })
})
